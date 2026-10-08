/**
 * Food Express — print agent.
 *
 * Runs on the shop's Windows machine, beside the printer. The app in the cloud
 * has no printer attached: when a ticket is printed there it is rendered on the
 * server and the finished slip is left in a queue. This agent asks the app for
 * the next one over HTTPS and hands it to the renderer beside it.
 *
 * It is deliberately ignorant. No database, no dependencies, no menu, no prices,
 * no receipt layout — the slip arrives finished, and its whole job is to put it
 * in front of the renderer. That is why this folder can be copied anywhere on
 * the machine and why it does not change when the app does.
 *
 *   config.json       — the app's address and the shared key
 *   print-receipt.ps1 — draws the slip with GDI+ and prints it, must stay beside
 *
 * Start it by double-clicking start-print.bat, or: node print-agent.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "print-receipt.ps1");

/**
 * How often to ask for work — the dial between how fast paper appears and how
 * many requests the app is asked to answer. A ticket waits half of this on
 * average, so during service it is kept short; after a few quiet minutes the
 * agent slows down, because a closed shop need not be asked every second
 * whether anything has been ordered.
 *
 * These are a **cadence, not a sleep**: the round trip to the app already takes
 * the better part of a second from the shop, and sleeping the full interval on
 * top of it made the real gap between two questions 1.7 s and 4.9 s rather than
 * the 0.8 s and 4 s written here. What has already been spent is subtracted.
 *
 * Lower BUSY_POLL_MS for faster paper — at 800 ms a service hour costs 4,500
 * requests, at 300 ms it costs 12,000. Free hosting plans count those. Both can
 * be overridden in config.json (`pollMs`, `idlePollMs`) without touching this
 * file, because the right answer depends on the shop's hosting plan.
 */
const BUSY_POLL_MS = 800;
const IDLE_POLL_MS = 2500;
/**
 * How long after the last ticket the agent keeps checking quickly. Ten minutes
 * rather than three: a quiet Tuesday still has customers, and the first order
 * after a lull is exactly the one nobody should be left waiting for.
 */
const BUSY_FOR_MS = 10 * 60 * 1000;
/** How long to wait after a failed print before asking again. */
const RETRY_PAUSE_MS = 15_000;
/** How long to wait when the app itself cannot be reached. */
const OFFLINE_PAUSE_MS = 10_000;

/**
 * Everything printed to the screen is written to `agent.log` beside this script
 * as well.
 *
 * Started from `start-hidden.vbs` the agent has no window at all, which is how
 * it should run in a shop — but it also means the screen is nobody's. The file
 * is then the only account of what happened, so it is written before anything
 * else can go wrong with it.
 */
const LOG_FILE = path.join(HERE, "agent.log");
/** Truncate past this, so an agent left running for a year cannot fill the disk. */
const LOG_MAX_BYTES = 1_000_000;

function appendLog(line) {
  try {
    if (statSync(LOG_FILE, { throwIfNoEntry: false })?.size > LOG_MAX_BYTES) {
      // Keep the most recent half rather than deleting the lot: whatever went
      // wrong is usually near the end.
      const kept = readFileSync(LOG_FILE, "utf8").slice(-LOG_MAX_BYTES / 2);
      writeFileSync(LOG_FILE, `--- trimmed ---\n${kept}`);
    }
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // A locked or unwritable log must never stop receipts printing.
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleString("de-DE");

function write(stream, parts) {
  const line = `[${stamp()}] ${parts.join(" ")}`;
  stream(line);
  appendLog(line);
}

const log = (...parts) => write((l) => console.log(l), parts);
const warn = (...parts) => write((l) => console.warn(l), parts);

/**
 * Only one agent may run at a time.
 *
 * Two are harmless to the queue — a job is claimed with a conditional update, so
 * it can never print twice — but they double the requests the app is asked to
 * answer and each holds its own PowerShell open. It happens easily: the shop
 * starts one at logon and somebody double-clicks the batch file as well.
 *
 * The claim is a listening socket rather than a lock file because the operating
 * system releases it the moment the process dies, however it dies. A lock file
 * would survive a power cut and lock the shop out of its own printer.
 */
const LOCK_PORT = 45_631;
/** Exit code meaning "another agent already has it" — start-print.bat reads it. */
const EXIT_ALREADY_RUNNING = 3;

function claimSingleInstance() {
  return new Promise((resolve) => {
    const guard = net.createServer();
    guard.once("error", () => resolve(false));
    guard.once("listening", () => {
      // Held for as long as the process lives, but never the reason it lives.
      guard.unref();
      resolve(true);
    });
    guard.listen(LOCK_PORT, "127.0.0.1");
  });
}

async function loadConfig() {
  const file = path.join(HERE, "config.json");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    warn(
      `No config.json beside this script. ` +
        `Copy config.example.json to config.json and fill in your app address and key.`,
    );
    process.exit(1);
  }

  let config;
  try {
    // Notepad and PowerShell both save UTF-8 with a byte-order mark, and this
    // file is meant to be edited by hand on Windows.
    config = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    warn(`config.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  const missing = ["appUrl", "printKey"].filter((k) => !String(config[k] ?? "").trim());
  if (missing.length > 0) {
    warn(`config.json is missing: ${missing.join(", ")}`);
    process.exit(1);
  }
  // A trailing slash here produces a double slash in every request.
  config.appUrl = String(config.appUrl).replace(/\/+$/, "");
  return config;
}

/** Ask the app for work, or tell it how a job went. */
async function talk(config, body) {
  const response = await fetch(`${config.appUrl}/api/print-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-print-key": config.printKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 204) return null;
  if (response.status === 401) throw new Error("the key in config.json is not accepted");
  if (response.status === 503) throw new Error("PRINT_AGENT_KEY is not set on the app");
  if (!response.ok) throw new Error(`the app answered ${response.status}`);
  return response.json();
}

/**
 * The renderer, kept running between receipts.
 *
 * Starting PowerShell costs about 850 ms on a shop PC and loading System.Drawing
 * another 400 ms. Spawning one per receipt paid both every time, and that was
 * most of what the customer stood there waiting for — 2.3 s of work to put three
 * inches of paper on the counter. The host is started once and fed one job per
 * line instead: a warm slip costs about half a second, nearly all of it the
 * printer driver's own.
 *
 * It is started on the first job rather than at launch, so an agent left running
 * overnight holds nothing open, and it is restarted by itself if it ever dies —
 * a printer driver taking PowerShell down with it must cost one receipt, not the
 * evening.
 */
const host = { proc: null, buffer: "", waiting: [] };

function hostLine(line) {
  const waiter = host.waiting.shift();
  if (waiter) waiter.resolve(line);
}

/** Drop the host; the next job starts a fresh one. */
function stopHost(reason) {
  const dying = host.proc;
  host.proc = null;
  host.buffer = "";
  for (const waiter of host.waiting.splice(0)) waiter.reject(new Error(reason));
  if (dying) dying.kill();
}

/** The running renderer, started if it is not up yet. */
async function ensureHost() {
  if (host.proc) return host.proc;

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Serve"],
    { windowsHide: true },
  );
  host.proc = child;

  child.stdout.on("data", (chunk) => {
    host.buffer += String(chunk);
    let cut;
    while ((cut = host.buffer.indexOf("\n")) >= 0) {
      const line = host.buffer.slice(0, cut).trim();
      host.buffer = host.buffer.slice(cut + 1);
      if (line) hostLine(line);
    }
  });
  // PowerShell writes its own errors here; they belong in the log, not in a
  // reply, so they are never matched against a waiting job.
  child.stderr.on("data", (chunk) => warn(`  renderer: ${String(chunk).trim().slice(0, 300)}`));
  child.on("error", () => stopHost("the renderer could not be started"));
  child.on("close", () => stopHost("the renderer stopped"));

  // It answers READY once the runtime and System.Drawing are loaded.
  const ready = await hostAsk(null, 60_000);
  if (ready !== "READY") throw new Error(`the renderer said "${ready}" instead of READY`);
  return child;
}

/**
 * Send one job (or, with `null`, just wait for the next line) and return the
 * renderer's answer. A job that never answers takes the host down with it, so
 * the next receipt is drawn by a fresh one rather than queueing behind a hang.
 */
function hostAsk(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Checked before anything is queued: a waiter added for a job that was never
    // written would sit in the queue and swallow the *next* job's answer.
    if (!host.proc) {
      reject(new Error("the renderer is not running"));
      return;
    }

    const timer = setTimeout(() => {
      stopHost("the renderer did not answer");
      reject(new Error("the renderer did not answer"));
    }, timeoutMs);

    const waiter = {
      resolve: (line) => {
        clearTimeout(timer);
        resolve(line);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
    host.waiting.push(waiter);

    if (request === null) return;
    try {
      host.proc.stdin.write(`${JSON.stringify(request)}\n`);
    } catch (e) {
      host.waiting.splice(host.waiting.indexOf(waiter), 1);
      clearTimeout(timer);
      stopHost("the renderer could not be written to");
      reject(e);
    }
  });
}

/** Hand one slip to the renderer, which draws it and prints it. */
async function toSpooler(printerName, file, widthMm) {
  try {
    await ensureHost();
    const answer = await hostAsk({ path: file, widthMm, printerName }, 30_000);
    if (answer.startsWith("OK")) return { ok: true };
    return { ok: false, message: answer.replace(/^ERR\s*/, "").slice(0, 500) };
  } catch (e) {
    return { ok: false, message: String(e.message ?? e).slice(0, 500) };
  }
}

/**
 * Put one job on paper.
 *
 * The payload is the finished document as JSON: the slip's lines, its QR codes
 * as PNG bytes, and which roll it was built for. The images are written beside
 * the lines file and each `IMG` directive is pointed at its local copy, so the
 * PowerShell script only ever sees absolute paths on this machine and needs to
 * know nothing about where the job came from. The directory goes away again
 * whatever happens.
 */
async function print(job) {
  let dir = null;
  try {
    const doc = JSON.parse(Buffer.from(job.payload, "base64").toString("utf8"));
    dir = await mkdtemp(path.join(tmpdir(), "easy-drive-print-"));

    for (const image of doc.images ?? []) {
      await writeFile(path.join(dir, image.name), Buffer.from(image.base64, "base64"));
    }

    const lines = (doc.lines ?? []).map((line) => {
      if (!line.startsWith("IMG\t")) return line;
      const [directive, mm, name] = line.split("\t");
      return `${directive}\t${mm}\t${path.join(dir, name)}`;
    });

    // A BOM makes Windows tooling read the file as UTF-8 without guessing, and
    // CRLF is what ReadAllLines expects from a file written on Windows.
    const file = path.join(dir, "slip.txt");
    await writeFile(file, `﻿${lines.join("\r\n")}\r\n`, "utf8");

    return await toSpooler(job.printerName, file, doc.widthMm ?? 80);
  } catch (e) {
    return { ok: false, message: String(e) };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  if (process.platform !== "win32") {
    warn("This agent belongs on the machine with the printer (Windows).");
    process.exit(1);
  }

  if (!(await claimSingleInstance())) {
    log("another print agent is already running — leaving it to it");
    process.exit(EXIT_ALREADY_RUNNING);
  }

  const config = await loadConfig();
  log(`print agent started — asking ${config.appUrl} for jobs`);

  const busyPoll = Number(config.pollMs) > 0 ? Number(config.pollMs) : BUSY_POLL_MS;
  const idlePoll = Number(config.idlePollMs) > 0 ? Number(config.idlePollMs) : IDLE_POLL_MS;

  let quiet = false; // so a long outage does not fill the log with one message
  let lastJobAt = Date.now(); // start responsive: someone just launched this
  for (;;) {
    try {
      const askedAt = Date.now();
      const job = await talk(config, { action: "claim" });
      quiet = false;

      if (!job) {
        const busy = Date.now() - lastJobAt < BUSY_FOR_MS;
        // The interval counts from the question, not from the answer: the round
        // trip is part of the gap, not something to add to it.
        const spent = Date.now() - askedAt;
        await sleep(Math.max(0, (busy ? busyPoll : idlePoll) - spent));
        continue;
      }
      lastJobAt = Date.now();

      const waited = job.waitedMs === undefined ? "" : `, waited ${job.waitedMs} ms`;
      log(`printing #${job.id} — ${job.label} (→ ${job.printerName}${waited})`);
      const started = Date.now();
      const result = await print(job);

      await talk(config, {
        action: "result",
        id: job.id,
        ok: result.ok,
        error: result.ok ? undefined : result.message,
      });

      if (result.ok) {
        log(`done #${job.id} in ${Date.now() - started} ms`);
      } else {
        log(`failed #${job.id} (try ${job.attempt}/${job.maxAttempts}): ${result.message}`);
        await sleep(RETRY_PAUSE_MS);
      }
    } catch (e) {
      // No internet, app asleep, wrong key. Say it once, then keep trying: the
      // shop must never need this restarted by hand.
      if (!quiet) {
        log(`waiting — ${e.message}`);
        quiet = true;
      }
      await sleep(OFFLINE_PAUSE_MS);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log("stopping");
    // The renderer is a child of this process; closing the window should not
    // leave a PowerShell behind holding the printer open.
    stopHost("the agent is stopping");
    process.exit(0);
  });
}

main();
