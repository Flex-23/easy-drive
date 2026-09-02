import type { Cents } from "@/lib/pricing";

/** A configured line held in the client-side cart before checkout. */
export interface CartLine {
  uid: string;
  itemId: number;
  itemNumber: number;
  name: string;
  categoryName: string;
  basePrice: Cents;
  quantity: number;
  kitchenNotes?: string;
  options: CartLineOption[];
}

export interface CartLineOption {
  groupId: number;
  choiceId: number;
  groupName: string;
  choiceName: string;
  priceDelta: Cents;
}

/** Result envelope returned by every mutation (never throws to the UI). */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Money on the receipt is in euros (render boundary). */
export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  options: string[];
}
export interface ReceiptData {
  orderNumber: string;
  createdAt: string;
  type: "DINE_IN" | "PICKUP" | "DELIVERY";
  tableNumber: string | null;
  customerName: string | null;
  cashierName: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: "CASH" | "CARD" | "ONLINE";
  cashTendered: number | null;
  change: number | null;
  restaurantName: string;
  receiptHeader: string;
  receiptFooter: string;
}
