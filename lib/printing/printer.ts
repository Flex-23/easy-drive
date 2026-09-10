import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrintDocument } from "./lines";

/**
 * The bridge to the printer attached to this machine.
 *
 * The slip is written to a temp file and drawn by PowerShell with GDI+
 * (`print/print-receipt.ps1`), so there is no native module to compile and
 * nothing to install beyond the printer. It used to be sent as raw ESC/POS
 * bytes; see `lines.ts` for why it no longer is.
 *
 * The same few steps happen in `print/print-agent.mjs` for the cloud path. They
 * are deliberately not shared: that folder is copied to the shop machine on its
 * own and must keep running with no dependencies and no build step.
 */

const POWERSHELL = "powershell.exe";
const SCRIPT = path.join(process.cwd(), "print", "print-receipt.ps1");

export type PrintResult = { ok: true } | { ok: false; error: string };

function run(args: string[], timeoutMs = 20_000): Promise<{ code: number; out: string; err: string }> {
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
 * Draw a document on a printer named by Windows.
 *
 * The QR images are written beside the lines file and the `IMG` directives are
 * rewritten to point at them, so the PowerShell script only ever sees absolute
 * local paths and needs to know nothing about where the job came from. The whole
 * directory is removed again whatever happens.
 */
export async function printDocument(
  doc: PrintDocument,
  printerName: string,
): Promise<PrintResult> {
  if (process.platform !== "win32") {
    return { ok: false, error: "printerUnsupportedPlatform" };
  }
  if (!printerName.trim()) return { ok: false, error: "printerNotConfigured" };

  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "easy-drive-print-"));

    for (const image of doc.images) {
      await writeFile(path.join(dir, image.name), Buffer.from(image.base64, "base64"));
    }
    const lines = resolveImagePaths(doc.lines, dir);

    // A BOM makes Windows tooling read the file as UTF-8 without guessing, and
    // CRLF is what ReadAllLines expects from a file written on Windows.
    const file = path.join(dir, "slip.txt");
    await writeFile(file, `﻿${lines.join("\r\n")}\r\n`, "utf8");

    const result = await run([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT,
      "-Path",
      file,
      "-WidthMm",
      String(doc.widthMm),
      "-PrinterName",
      printerName,
    ]);

    if (result.code === 0 && result.out.includes("OK")) return { ok: true };
    return { ok: false, error: "printerFailed" };
  } catch {
    return { ok: false, error: "printerFailed" };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** `IMG⇥mm⇥name` → `IMG⇥mm⇥<absolute path in dir>`. */
export function resolveImagePaths(lines: string[], dir: string): string[] {
  return lines.map((line) => {
    if (!line.startsWith("IMG\t")) return line;
    const [directive, mm, name] = line.split("\t");
    return `${directive}\t${mm}\t${path.join(dir, name)}`;
  });
}
