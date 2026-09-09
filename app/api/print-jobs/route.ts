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

/**
 * Hand out the oldest waiting job. The claim is a conditional update, so two
 * agents started by mistake can never print the same ticket twice.
 */
async function claim() {
  const candidate = await db.printJob.findFirst({
    where: { status: "QUEUED", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { id: "asc" },
  });
  if (!candidate) return new NextResponse(null, { status: 204 });

  const taken = await db.printJob.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "PRINTING", attempts: { increment: 1 } },
  });
  // Another agent got there first; it will be offered again on the next poll.
  if (taken.count !== 1) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    id: candidate.id,
    label: candidate.label,
    printerName: candidate.printerName,
    attempt: candidate.attempts + 1,
    maxAttempts: MAX_ATTEMPTS,
    payload: Buffer.from(candidate.payload).toString("base64"),
  });
}

async function result(body: { id?: number; ok?: boolean; error?: string }) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const job = await db.printJob.findUnique({ where: { id }, select: { attempts: true } });
  if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (body.ok) {
    await db.printJob.update({
      where: { id },
      data: { status: "DONE", error: null },
    });
    await sweep();
    return NextResponse.json({ ok: true, status: "DONE" });
  }

  // Out of paper is worth retrying; a job that has failed five times is not.
  const giveUp = job.attempts >= MAX_ATTEMPTS;
  await db.printJob.update({
    where: { id },
    data: {
      status: giveUp ? "FAILED" : "QUEUED",
      error: (body.error ?? "unknown").slice(0, 1000),
    },
  });
  return NextResponse.json({ ok: true, status: giveUp ? "FAILED" : "QUEUED" });
}
