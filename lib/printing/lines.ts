/**
 * A slip, written as directive lines rather than as printer bytes.
 *
 * The till used to build ESC/POS and hand the bytes to the spooler as a RAW
 * job. That is the fastest way to move a receipt to paper and the worst way to
 * put a letter on it: the printer draws from a code page, so anything outside
 * CP858 came out as `?`, and the layout could only ever be a fixed number of
 * monospaced columns.
 *
 * So the bytes are gone. What travels now is a few lines of text carrying their
 * own formatting, and the drawing happens on the shop machine in GDI+
 * (`print/print-receipt.ps1`), which shapes and lays out text properly — Arabic
 * included — and can place an image.
 *
 * The format is deliberately tiny, because both ends have to agree on it and one
 * of them is a PowerShell script:
 *
 *   =text                 centred, very large — the order number and nothing else
 *   ~text                 centred, bold
 *   -                     a rule across the paper
 *   --                    a dashed double rule — fences the kitchen's item list
 *   (empty)               a blank line
 *   label⇥value           label at the left edge, value hard against the right
 *   !label⇥value          the same row in bold — a total
 *   !text                 a whole line in bold
 *   text                  a plain line
 *   QR⇥mm⇥level⇥data      a QR code, `mm` wide (rewritten to IMG before sending)
 *   IMG⇥mm⇥name           a PNG, centred and scaled to `mm` wide
 *
 * (⇥ is a tab.) This module is environment-free, so it can be exercised on its
 * own.
 */

/** Roll width. The renderer sets its type size and margins from this. */
export type WidthMm = 58 | 80;

/**
 * The paper width the shop chose, read out of the old `printerColumns` setting.
 *
 * That setting is a character count — 48 or 32 — from the days of monospaced
 * ESC/POS, and the Settings screen has always offered it as the paper width it
 * really stands for. Nothing counts characters any more, but the stored value is
 * still the shop's answer to "which roll?", so it is translated here rather than
 * migrated and re-asked.
 */
export function widthFromColumns(columns: number): WidthMm {
  return columns >= 40 ? 80 : 58;
}

/** A QR wide enough to scan at arm's length without eating the roll. */
const QR_WIDTH_MM: Record<WidthMm, number> = { 58: 21, 80: 29 };

/** A QR code travelling to the printer as bytes rather than as a file path. */
export interface SlipImage {
  /** What the `IMG` line refers to; the agent turns it into a local path. */
  name: string;
  base64: string;
}

/** One finished piece of paper, ready for whichever printer gets it. */
export interface PrintDocument {
  lines: string[];
  images: SlipImage[];
  widthMm: WidthMm;
}

const TAB = "\t";

/**
 * Tabs and newlines are the format's only structure, so they can never appear
 * inside a value. Kitchen notes and customer names are typed by hand, and a
 * stray tab in one of them would split a line into the wrong two halves.
 */
function clean(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ").trim();
}

/** Collects the lines of one slip. Methods chain; `build()` hands them back. */
export class Slip {
  private readonly out: string[] = [];

  constructor(readonly widthMm: WidthMm) {}

  /**
   * The order number, set far above everything else. It is the one string the
   * kitchen and the driver search the paper for.
   */
  hero(text: string): this {
    this.out.push(`=${clean(text)}`);
    return this;
  }

  /** Centred and bold — a heading. */
  centre(text: string): this {
    this.out.push(`~${clean(text)}`);
    return this;
  }

  /** A plain line. */
  text(value = ""): this {
    this.out.push(clean(value));
    return this;
  }

  /** A whole line in bold — a dish on the kitchen slip. */
  strong(value: string): this {
    this.out.push(`!${clean(value)}`);
    return this;
  }

  /**
   * Label on the left, figure hard against the right edge. The renderer measures
   * both and drops the value onto its own line rather than cutting either short.
   */
  row(label: string, value: string): this {
    this.out.push(`${clean(label)}${TAB}${clean(value)}`);
    return this;
  }

  /** The same row in bold — the total. */
  strongRow(label: string, value: string): this {
    this.out.push(`!${clean(label)}${TAB}${clean(value)}`);
    return this;
  }

  /** The dashed rule of a receipt. */
  rule(): this {
    this.out.push("-");
    return this;
  }

  /**
   * The double dashed rule. The kitchen slip fences its items with these so a
   * cook glancing down a spike of tickets can tell them from a customer copy
   * without reading either.
   */
  fence(): this {
    this.out.push("--");
    return this;
  }

  blank(count = 1): this {
    for (let i = 0; i < count; i++) this.out.push("");
    return this;
  }

  /**
   * A QR code, sized for this roll. It is emitted as a directive and turned into
   * a real PNG later (see `document.ts`) — the builder stays free of IO.
   */
  qr(data: string): this {
    this.out.push(
      `QR${TAB}${QR_WIDTH_MM[this.widthMm]}${TAB}M${TAB}${clean(data)}`,
    );
    return this;
  }

  build(): string[] {
    return this.out;
  }
}
