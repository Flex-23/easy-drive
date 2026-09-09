/**
 * The single source of truth for price math, used by BOTH the live cart
 * preview (client) and the final transactional write (server). Because it is
 * the same module in both places, the two can never disagree.
 *
 * All arithmetic is done in integer minor units (euro cents) so there is never
 * any floating-point rounding error on money. Values are stored as Decimal(10,2)
 * in MySQL and converted to/from cents only at the boundaries (see helpers).
 * This module imports nothing environment-specific, so it is safe on the client.
 */

export type Cents = number;

/** "10.50" | 10.5 (euros) -> 1050 (cents). Exact, no float accumulation. */
export function eurosToCents(value: number | string): Cents {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents =
    Number(whole) * 100 + Number((frac + "00").slice(0, 2).padEnd(2, "0"));
  return neg ? -cents : cents;
}

/** 1050 (cents) -> 10.5 (euros, number) for the render/formatting boundary. */
export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/** 1050 (cents) -> "10.50" for persisting as a Decimal string. */
export function centsToDecimalString(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const str = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${str}` : str;
}

export interface PricedOptionInput {
  priceDelta: Cents;
}
export interface PricedLineInput {
  basePrice: Cents;
  quantity: number;
  options: PricedOptionInput[];
}
export interface PricedLineResult {
  unitPrice: Cents;
  lineTotal: Cents;
}

export function computeLine(line: PricedLineInput): PricedLineResult {
  const optionsSum = line.options.reduce((acc, o) => acc + o.priceDelta, 0);
  const unitPrice = line.basePrice + optionsSum;
  const quantity = Math.max(1, Math.trunc(line.quantity));
  return { unitPrice, lineTotal: unitPrice * quantity };
}

export interface OrderTotalsInput {
  lines: PricedLineInput[];
  discountAmount?: Cents;
  deliveryFee?: Cents;
  /** VAT rate as a fraction, e.g. 0.19 for 19%. */
  taxRate: number;
}

export interface OrderTotals {
  subtotal: Cents;
  discountAmount: Cents;
  deliveryFee: Cents;
  taxAmount: Cents;
  total: Cents;
  lines: PricedLineResult[];
}

export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const lines = input.lines.map(computeLine);
  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);

  // A discount can never exceed the subtotal.
  const discountAmount = Math.min(Math.max(0, input.discountAmount ?? 0), subtotal);
  const deliveryFee = Math.max(0, input.deliveryFee ?? 0);

  const total = subtotal - discountAmount + deliveryFee;

  // VAT contained within a gross total: round(total * rate / (1 + rate)).
  const taxAmount = Math.round((total * input.taxRate) / (1 + input.taxRate));

  return { subtotal, discountAmount, deliveryFee, taxAmount, total, lines };
}
