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
