/**
 * ESC/POS — the language thermal receipt printers actually speak.
 *
 * Everything the shop prints is built here as bytes and handed to the Windows
 * spooler as a RAW job, so no browser dialog and no printer driver rendering
 * stands between the till and the paper. The builder is deliberately plain: a
 * receipt is a column of text, and the few commands below (alignment, emphasis,
 * double height, a QR code and the cut) are all a receipt ever needs.
 *
 * This module is environment-free so it can be unit-tested on its own.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Columns of Font A on an 80 mm roll; 58 mm rolls use 32. */
export const DEFAULT_COLUMNS = 48;

/**
 * CP858 — the code page nearly every thermal printer ships with, and the one
 * that carries German. Anything outside it becomes `?` rather than mojibake.
 *
 * Arabic is outside it. That is deliberate and not worth fixing here: the paper
 * is German (the till is, and the tickets fix their dictionary to `posLocale`),
 * and printing Arabic would mean shipping a font to the printer rather than a
 * code page. A customer whose name is entered in Arabic prints as `?????` — if
 * that ever matters, enter the name in Latin letters.
 */
const CP858: Record<string, number> = {
  "ä": 0x84, "ö": 0x94, "ü": 0x81, "Ä": 0x8e, "Ö": 0x99, "Ü": 0x9a,
  "ß": 0xe1, "€": 0xd5, "é": 0x82, "è": 0x8a, "à": 0x85, "ç": 0x87,
  "°": 0xf8, "£": 0x9c, "×": 0x78, "—": 0x2d, "–": 0x2d, "·": 0x2e,
  "“": 0x22, "”": 0x22, "„": 0x22, "…": 0x2e, "−": 0x2d, "،": 0x2c,
};

function encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (code < 0x80) bytes.push(code);
    // German money carries a non-breaking space before the €; on paper any exotic
    // space is just a space. Without this it printed as "64,20?€".
    else if (/\s/.test(char)) bytes.push(0x20);
    else bytes.push(CP858[char] ?? 0x3f);
  }
  return bytes;
}

export type Align = "left" | "center" | "right";

/**
 * Collects one print job. Methods chain, and `build()` hands back the bytes.
 */
export class Receipt {
  private readonly bytes: number[] = [];

  constructor(readonly columns: number = DEFAULT_COLUMNS) {
    // Reset, then select CP858 so umlauts and € come out right.
    this.bytes.push(ESC, 0x40, ESC, 0x74, 19);
  }

  private raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  align(where: Align): this {
    return this.raw(ESC, 0x61, where === "left" ? 0 : where === "center" ? 1 : 2);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Double height (and width, for a heading the kitchen can read at a glance). */
  big(on: boolean, wide = false): this {
    return this.raw(GS, 0x21, on ? (wide ? 0x11 : 0x01) : 0x00);
  }

  /** One line of text, wrapped to the paper width. */
  line(text = ""): this {
    for (const part of wrap(text, this.columns)) {
      this.bytes.push(...encode(part), 0x0a);
    }
    return this;
  }

  /** Label on the left, figure hard against the right edge. */
  row(label: string, value: string): this {
    const room = this.columns - value.length;
    const left = label.length > room ? label.slice(0, Math.max(0, room - 1)) : label;
    const gap = Math.max(1, this.columns - left.length - value.length);
    this.bytes.push(...encode(left + " ".repeat(gap) + value), 0x0a);
    return this;
  }

  /** A run of one character across the paper — the dashed rule of a receipt. */
  rule(char = "-"): this {
    return this.line(char.repeat(this.columns));
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, lines);
  }

  /**
   * A QR code, printed by the printer itself rather than as an image: sharper,
   * and a fraction of the data.
   *
   * The module size is chosen so the finished square is about 70% of the paper
   * width — big enough to scan from a phone at arm's length — whatever the
   * address length and whether the roll is 80 mm or 58 mm.
   */
  qr(data: string, moduleSize = qrModuleSize(data, this.columns)): this {
    const payload = encode(data);
    const length = payload.length + 3;
    return this.raw(
      // model 2
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      // module size
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize,
      // error correction M
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
      // store the payload
      GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30,
      ...payload,
      // print what was stored
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
    );
  }

  /** Just clear of the cutter, then cut — anything more is wasted paper. */
  cut(): this {
    return this.feed(2).raw(GS, 0x56, 0x42, 0x00);
  }

  build(): Buffer {
    return Buffer.from(this.bytes);
  }
}

/**
 * Bytes a QR holds at error-correction level M, by version. The version is the
 * smallest one that fits the data, and its side is `17 + 4 × version` modules.
 */
const QR_CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450,
  504, 560, 624, 666,
];

/** How many modules across the QR for this payload will be. */
function qrModules(length: number): number {
  const version = QR_CAPACITY_M.findIndex((capacity) => length <= capacity) + 1;
  return 17 + 4 * (version || QR_CAPACITY_M.length);
}

/**
 * The dot size that makes the QR roughly 70% of the paper, clamped to what the
 * printer accepts (1–16) and to what actually fits across the head.
 */
export function qrModuleSize(data: string, columns: number): number {
  const paperDots = columns * 12; // Font A is 12 dots wide: 48 cols = 576 dots
  const modules = qrModules(data.length);
  const size = Math.floor((paperDots * 0.7) / modules);
  return Math.min(16, Math.max(3, size));
}

/** Break a long line on word boundaries so nothing is lost off the edge. */
export function wrap(text: string, columns: number): string[] {
  if (text === "") return [""];
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(" ")) {
      if (current === "") current = word;
      else if (current.length + 1 + word.length <= columns) current += ` ${word}`;
      else {
        out.push(current);
        current = word;
      }
      while (current.length > columns) {
        out.push(current.slice(0, columns));
        current = current.slice(columns);
      }
    }
    out.push(current);
  }
  return out;
}
