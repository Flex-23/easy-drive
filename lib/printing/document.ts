import "server-only";
import QRCode from "qrcode";
import type { PrintDocument, SlipImage, WidthMm } from "./lines";

/**
 * Turns a slip's lines into a finished document: every `QR` directive becomes a
 * real PNG, and the line becomes the `IMG` directive the renderer draws.
 *
 *   QR⇥21⇥M⇥https://maps.google.com/…     ← what the ticket builder emits
 *   IMG⇥21⇥qr-0.png                        ← what the printer end receives
 *
 * The image travels as base64 beside the lines, not as a path: the shop machine
 * is not this machine, and a path on a cloud host means nothing there. Whichever
 * end prints writes the bytes into its own temp directory and rewrites the name
 * to a local absolute path, which is why the PowerShell script never has to know
 * where any of this came from.
 *
 * A QR is drawn as an image rather than with the printer's own ESC/POS QR
 * command because the two cannot be mixed: the text is drawn by GDI+, and a
 * native QR command would have to be sent as raw bytes in the same job.
 */

const QR_PREFIX = "QR\t";

/** About 8 dots/mm — the resolution of a thermal head, so the code prints 1:1. */
const DOTS_PER_MM = 8;

export async function buildDocument(
  lines: string[],
  widthMm: WidthMm,
): Promise<PrintDocument> {
  const out: string[] = [];
  const images: SlipImage[] = [];

  for (const line of lines) {
    if (!line.startsWith(QR_PREFIX)) {
      out.push(line);
      continue;
    }

    // QR⇥mm⇥level⇥data — the data itself can hold no tab, so it is the rest.
    const parts = line.split("\t");
    const mm = Number(parts[1]) || 21;
    const level = (parts[2] || "M") as "L" | "M" | "Q" | "H";
    const data = parts.slice(3).join("\t");

    const name = `qr-${images.length}.png`;
    const png = await QRCode.toBuffer(data, {
      type: "png",
      errorCorrectionLevel: level,
      margin: 1,
      width: Math.round(mm * DOTS_PER_MM),
      color: { dark: "#000000", light: "#ffffff" },
    });

    images.push({ name, base64: png.toString("base64") });
    out.push(`IMG\t${mm}\t${name}`);
  }

  return { lines: out, images, widthMm };
}
