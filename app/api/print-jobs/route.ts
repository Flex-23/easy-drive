import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * POST /api/print-jobs — the only door the print agent needs.
 *
 * The app in the cloud has no printer, so it renders each ticket and leaves the
 * finished bytes in `PrintJob`. The agent beside the printer at the shop asks
 * here for the next one and reports back what happened. Everything it needs
 * travels over plain HTTPS, so the agent carries no database credentials, no
 * dependencies and no knowledge of the menu — it moves bytes to paper.
 *
 *   { "action": "claim" }                        -> a job, or 204 when idle
 *   { "action": "result", "id": 7, "ok": true }  -> mark it done or failed
 *
 * Authenticated with PRINT_AGENT_KEY as `X-Print-Key`. Without that key set the
 * endpoint stays closed, because a queue anyone can drain is a queue that never
 * prints.
 */

/** Five tries at a printer that will not take the job is enough. */
const MAX_ATTEMPTS = 5;

/**
 * How long a job may sit in PRINTING before another claim may take it.
 *
 * The agent claims a job, prints it, then reports back. If it dies in between —
 * the machine rebooted, the window was closed, the connection dropped after the
 * bytes went out — nothing would ever move that row again: `claim` only looks at
 * QUEUED and the sweep only deletes DONE. The ticket would never print and
 * nobody would be told. Past this age the job is fair game again, and `attempts`
 * still stops it from looping forever.
 *
 * Long enough that it can never overtake a print in progress: the agent gives
 * the spooler 20 s and its own request 20 s, so claim to report is bounded well
 * inside this.
 *
 * The trade this makes: if the paper came out but the agent's report never
 * arrived, the job is reclaimed here and printed a second time. That is the
 * right way round for a kitchen. A duplicate bon is a sheet of paper somebody
 * throws away; the alternative — which is what this queue did before — is an
 * order that silently never reaches the kitchen and nobody finds out until the
 * customer asks where the food is.
 */
const STALE_PRINTING_MS = 2 * 60 * 1000;

/** A printed ticket is worth keeping for a day, so the queue can be read back. */
const KEEP_DONE_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
let lastSweep = 0;

/**
 * Drop yesterday's printed jobs. Done on the way past rather than on a schedule
 * — there is no scheduler here, and a queue that only grows is a queue that
 * eventually costs money. Failed jobs stay until someone has looked at them.
 */
async function sweep() {
  if (Date.now() - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = Date.now();
  await db.printJob
    .deleteMany({
      where: { status: "DONE", updatedAt: { lt: new Date(Date.now() - KEEP_DONE_MS) } },
    })
    .catch(() => {});
}

function authorized(request: Request): boolean {
  const key = env.PRINT_AGENT_KEY;
  if (!key) return false;
  const given = request.headers.get("x-print-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!env.PRINT_AGENT_KEY) {
    return NextResponse.json(
      { ok: false, error: "print_agent_key_not_set" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string; id?: number; ok?: boolean; error?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.action === "claim") return claim();
  if (body.action === "result") return result(body);
  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}

interface ClaimedRow {
  id: number;
  label: string;
  printerName: string;
  attempts: number;
  payload: Uint8Array;
  createdAt: Date;
}

/**
 * Hand out the oldest waiting job — find it, take it and return it in a single
 * statement. `FOR UPDATE SKIP LOCKED` is what makes that safe: a second agent
 * asking at the same moment steps over the locked row instead of waiting for
 * it, so one ticket can never be printed twice and neither agent blocks.
 *
 * A job left in PRINTING by an agent that died mid-job is picked up here too,
 * once it is old enough to be certain nobody is still holding it. That is the
 * queue's whole recovery mechanism: there is no scheduler on this host, so the
 * one statement that runs every second is also the one that heals it.
 *
 * This is asked for once a second while the shop is open, and the agent waits
 * on the answer before any paper moves, so it is worth one round trip and not
 * two.
 */
async function claim() {
  const staleBefore = new Date(Date.now() - STALE_PRINTING_MS);
  const rows = await db.$queryRaw<ClaimedRow[]>`
    UPDATE "PrintJob"
       SET status = 'PRINTING', attempts = attempts + 1, "updatedAt" = now()
     WHERE id = (
       SELECT id FROM "PrintJob"
        WHERE attempts < ${MAX_ATTEMPTS}
          AND (
            status = 'QUEUED'
            OR (status = 'PRINTING' AND "updatedAt" < ${staleBefore})
          )
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, label, "printerName", attempts, payload, "createdAt"`;

  const job = rows[0];
  if (!job) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    id: job.id,
    label: job.label,
    printerName: job.printerName,
    attempt: job.attempts,
    maxAttempts: MAX_ATTEMPTS,
    /** How long this job sat waiting — the agent logs it, so a slow print can
     *  be blamed on the right half of the chain. */
    waitedMs: Date.now() - new Date(job.createdAt).getTime(),
    payload: Buffer.from(job.payload).toString("base64"),
  });
}

/**
 * Settle a job the agent has finished with.
 *
 * Every write here is scoped to `status: PRINTING` — the state the agent's own
 * claim put the row in. A report that arrives after the job was reclaimed as
 * stale, or a second report for the same job, therefore changes nothing instead
 * of dragging a finished ticket back into the queue and printing it twice.
 */
async function result(body: { id?: number; ok?: boolean; error?: string }) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const job = await db.printJob.findUnique({
    where: { id },
    select: { attempts: true, status: true },
  });
  if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Out of paper is worth retrying; a job that has failed five times is not.
  const status = body.ok ? "DONE" : job.attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED";
  const settled = await db.printJob.updateMany({
    where: { id, status: "PRINTING" },
    data: { status, error: body.ok ? null : (body.error ?? "unknown").slice(0, 1000) },
  });
  if (settled.count === 0) {
    return NextResponse.json({ ok: true, status: job.status, stale: true });
  }

  if (body.ok) await sweep();
  return NextResponse.json({ ok: true, status });
}
