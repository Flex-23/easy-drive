/**
 * Easy Drive — print agent.
 *
 * Runs on the shop's Windows machine, beside the printer. The app in the cloud
 * has no printer attached: when a ticket is printed there it is rendered on the
 * server and the finished bytes are left in a queue. This agent asks the app for
 * the next one over HTTPS and hands it to the Windows spooler.
 *
 * It is deliberately ignorant. No database, no dependencies, no menu, no prices,
 * no receipt layout — the bytes arrive complete and its whole job is to move
 * them to paper. That is why this folder can be copied anywhere on the machine
 * and why it does not change when the app does.
 *
 *   config.json  — the app's address and the shared key
 *   print-raw.ps1 — hands bytes to the spooler untouched (RAW), must stay beside
 *
 * Start it by double-clicking start-print.bat, or: node print-agent.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "print-raw.ps1");

/** How often to ask for work when the queue was empty. */
const IDLE_POLL_MS = 3000;
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
    config = JSON.parse(raw);
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

/** Hand one job's bytes to the Windows spooler, untouched. */
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

async function print(job) {
  let dir = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "easy-drive-print-"));
    const file = path.join(dir, "job.bin");
    await writeFile(file, Buffer.from(job.payload, "base64"));
    return await toSpooler(job.printerName, file);
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
  for (;;) {
    try {
      const job = await talk(config, { action: "claim" });
      quiet = false;

      if (!job) {
        await sleep(IDLE_POLL_MS);
        continue;
      }

      const size = Buffer.from(job.payload, "base64").length;
      log(`printing #${job.id} — ${job.label} (${size} bytes → ${job.printerName})`);
      const result = await print(job);

      await talk(config, {
        action: "result",
        id: job.id,
        ok: result.ok,
        error: result.ok ? undefined : result.message,
      });

      if (result.ok) {
        log(`done #${job.id}`);
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
