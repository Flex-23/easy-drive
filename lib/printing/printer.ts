import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The bridge to the printer attached to this machine.
 *
 * The app serves the till from the shop's own computer, so it can hand a job
 * straight to the Windows spooler as RAW data — no browser dialog, no driver
 * rendering. Everything goes through PowerShell (`scripts/print-raw.ps1`), so
 * there is no native module to compile and nothing to install.
 */

const POWERSHELL = "powershell.exe";
const SCRIPT = path.join(process.cwd(), "scripts", "print-raw.ps1");

export type PrintResult = { ok: true } | { ok: false; error: string };

function run(args: string[], timeoutMs = 15_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(POWERSHELL, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      err += "\ntimed out";
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, out, err: err + String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

/** Every printer installed on this machine, newest Windows API first. */
export async function listPrinters(): Promise<string[]> {
  if (process.platform !== "win32") return [];

  const modern = await run([
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-Printer | Select-Object -ExpandProperty Name",
  ]);
  const names = parseNames(modern.out);
  if (names.length > 0) return names;

  // Older Windows without the PrintManagement module.
  const legacy = await run([
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-WmiObject -Class Win32_Printer | Select-Object -ExpandProperty Name",
  ]);
  return parseNames(legacy.out);
}

function parseNames(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Send bytes to a printer by its Windows name. The job is written to a temp
 * file because that is the one thing PowerShell can hand to the spooler
 * verbatim; it is removed again whatever happens.
 */
export async function printRaw(printerName: string, data: Buffer): Promise<PrintResult> {
  if (process.platform !== "win32") {
    return { ok: false, error: "printerUnsupportedPlatform" };
  }
  if (!printerName.trim()) return { ok: false, error: "printerNotConfigured" };

  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "easy-drive-print-"));
    const file = path.join(dir, "job.bin");
    await writeFile(file, data);

    const result = await run([
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
    ]);

    if (result.code === 0 && result.out.includes("OK")) return { ok: true };
    return { ok: false, error: "printerFailed" };
  } catch {
    return { ok: false, error: "printerFailed" };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
