/**
 * Easy Drive — print agent.
 *
 * Runs on the shop's Windows machine, beside the printer. The app in the cloud
 * has no printer attached, so when a cashier there prints something it renders
 * the ticket and leaves the finished bytes in the `PrintJob` table. This agent
 * claims those jobs and hands them to the Windows spooler.
 *
 * It deliberately knows nothing about menus, prices or receipts: the bytes
 * arrive complete, and its whole job is to move them to the paper. That is why
 * it survives changes to the app without ever being touched.
 *
 *   npm run print-agent
 *
 * It needs the same .env as the app (DATABASE_URL) and the print script beside
 * it. Leave it running; it reconnects on its own if the network drops.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "print-raw.ps1");

/** How often to look for work when the queue was empty. */
const IDLE_POLL_MS = 3000;
/** How long to wait after a failed print before the job is offered again. */
const RETRY_AFTER_MS = 20_000;
/** After this many failures a job is left alone — the paper jam is real. */
const MAX_ATTEMPTS = 5;
/** Finished jobs are kept this long, so the queue can be read after the fact. */
const KEEP_DONE_MS = 24 * 60 * 60 * 1000;

const db = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("de-DE");
const log = (...parts) => console.log(`[${stamp()}]`, ...parts);

/** Hand one job's bytes to the Windows spooler, exactly as the app does. */
function toSpooler(printerName, file) {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        SCRIPT,
        "-Printer",
        printerName,
        "-File",
        file,
      ],
      { windowsHide: true },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      err += "\ntimed out";
    }, 20_000);

    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, message: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.includes("OK")) resolve({ ok: true });
      else resolve({ ok: false, message: (err || out || `exit ${code}`).trim().slice(0, 500) });
    });
  });
}

/**
 * Take the oldest waiting job, if any. The claim is a conditional update, so two
 * agents running by mistake can never print the same ticket twice.
 */
async function claim() {
  const candidate = await db.printJob.findFirst({
    where: { status: "QUEUED", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { id: "asc" },
  });
  if (!candidate) return null;

  const taken = await db.printJob.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "PRINTING", attempts: { increment: 1 } },
  });
  return taken.count === 1 ? candidate : null;
}

async function printJob(job) {
  let dir = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "easy-drive-agent-"));
    const file = path.join(dir, "job.bin");
    await writeFile(file, Buffer.from(job.payload));
    return await toSpooler(job.printerName, file);
  } catch (e) {
    return { ok: false, message: String(e) };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Old finished jobs are noise; the failed ones stay until someone looks. */
async function housekeeping() {
  const cutoff = new Date(Date.now() - KEEP_DONE_MS);
  const { count } = await db.printJob.deleteMany({
    where: { status: "DONE", updatedAt: { lt: cutoff } },
  });
  if (count > 0) log(`cleaned ${count} finished job(s)`);
}

async function main() {
  if (process.platform !== "win32") {
    console.error("The print agent belongs on the machine with the printer (Windows).");
    process.exit(1);
  }

  log("print agent started — waiting for jobs");
  // A job left PRINTING by a crash or a power cut is nobody's: offer it again.
  const { count: recovered } = await db.printJob.updateMany({
    where: { status: "PRINTING" },
    data: { status: "QUEUED" },
  });
  if (recovered > 0) log(`recovered ${recovered} interrupted job(s)`);

  let lastCleanup = 0;
  for (;;) {
    try {
      if (Date.now() - lastCleanup > KEEP_DONE_MS / 24) {
        await housekeeping();
        lastCleanup = Date.now();
      }

      const job = await claim();
      if (!job) {
        await sleep(IDLE_POLL_MS);
        continue;
      }

      log(`printing #${job.id} — ${job.label} (${job.payload.length} bytes → ${job.printerName})`);
      const result = await printJob(job);

      if (result.ok) {
        await db.printJob.update({ where: { id: job.id }, data: { status: "DONE", error: null } });
        log(`done #${job.id}`);
      } else {
        const attempts = job.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        await db.printJob.update({
          where: { id: job.id },
          data: { status: giveUp ? "FAILED" : "QUEUED", error: result.message },
        });
        log(`failed #${job.id} (attempt ${attempts}/${MAX_ATTEMPTS}): ${result.message}`);
        if (!giveUp) await sleep(RETRY_AFTER_MS);
      }
    } catch (e) {
      // The database is unreachable, most likely. Say so once and keep waiting;
      // the shop's till must not need this process restarted by hand.
      log(`waiting — ${String(e.message ?? e).split("\n")[0]}`);
      await sleep(IDLE_POLL_MS * 2);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log("stopping");
    await db.$disconnect().catch(() => {});
    process.exit(0);
  });
}

main();
