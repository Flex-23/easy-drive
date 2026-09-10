/**
 * Easy Drive — print agent.
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
 * Lower BUSY_POLL_MS for faster paper — at 800 ms a service hour costs 4,500
 * requests, at 300 ms it costs 12,000. Free hosting plans count those.
 */
const BUSY_POLL_MS = 800;
const IDLE_POLL_MS = 4000;
/** How long after the last ticket the agent keeps checking quickly. */
const BUSY_FOR_MS = 3 * 60 * 1000;
/** How long to wait after a failed print before asking again. */
const RETRY_PAUSE_MS = 15_000;
/** How long to wait when the app itself cannot be reached. */
const OFFLINE_PAUSE_MS = 10_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("de-DE");
const log = (...parts) => console.log(`[${stamp()}]`, ...parts);

async function loadConfig() {
  const file = path.join(HERE, "config.json");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    console.error(
      `\nNo config.json beside this script.\n` +
        `Copy config.example.json to config.json and fill in your app address and key.\n`,
    );
    process.exit(1);
  }

  let config;
  try {
    // Notepad and PowerShell both save UTF-8 with a byte-order mark, and this
    // file is meant to be edited by hand on Windows.
    config = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    console.error(`\nconfig.json is not valid JSON: ${e.message}\n`);
    process.exit(1);
  }

  const missing = ["appUrl", "printKey"].filter((k) => !String(config[k] ?? "").trim());
  if (missing.length > 0) {
    console.error(`\nconfig.json is missing: ${missing.join(", ")}\n`);
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

/** Hand one slip to the renderer, which draws it and prints it. */
function toSpooler(printerName, file, widthMm) {
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
        "-Path",
        file,
        "-WidthMm",
        String(widthMm),
        "-PrinterName",
        printerName,
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
    console.error("This agent belongs on the machine with the printer (Windows).");
    process.exit(1);
  }

  const config = await loadConfig();
  log(`print agent started — asking ${config.appUrl} for jobs`);

  let quiet = false; // so a long outage does not fill the log with one message
  let lastJobAt = Date.now(); // start responsive: someone just launched this
  for (;;) {
    try {
      const job = await talk(config, { action: "claim" });
      quiet = false;

      if (!job) {
        const busy = Date.now() - lastJobAt < BUSY_FOR_MS;
        await sleep(busy ? BUSY_POLL_MS : IDLE_POLL_MS);
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
    process.exit(0);
  });
}

main();
