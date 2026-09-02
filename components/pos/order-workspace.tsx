"use client";

import { useMemo, useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { computeOrderTotals } from "@/lib/pricing";
import { useToast } from "@/components/ui/toast";
import { OrderTypeTabs, type OrderType } from "./order-type-tabs";
import { CartColumn } from "./cart-column";
import { MenuBrowser } from "./menu-browser";
import { ProductModal } from "./product-modal";
import { PaymentModal } from "./payment-modal";
import { DiscountModal } from "./discount-modal";
import { SplitModal } from "./split-modal";
import { CustomerSelectModal } from "./customer-select-modal";
import { ReceiptModal } from "./receipt-modal";
import { holdOrder, payOrder } from "@/app/actions/orders";
import type { CategoryView, MenuItemView } from "@/types/menu";
import type { CartLine, ReceiptData } from "@/types/order";
import type { CustomerView } from "@/lib/queries/customers";
import type { StreetEntry } from "@/types/street";

export function OrderWorkspace({
  categories,
  taxRate,
  deliveryFee,
  streets,
}: {
  categories: CategoryView[];
  taxRate: number;
  deliveryFee: number;
  streets: StreetEntry[];
}) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountCents, setDiscountCents] = useState(0);
  const [customer, setCustomer] = useState<CustomerView | null>(null);

  const [activeItem, setActiveItem] = useState<MenuItemView | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const deliveryCents = orderType === "DELIVERY" ? Math.round(deliveryFee * 100) : 0;

  const totals = useMemo(
    () =>
      computeOrderTotals({
        lines: lines.map((l) => ({
          basePrice: l.basePrice,
          quantity: l.quantity,
          options: l.options.map((o) => ({ priceDelta: o.priceDelta })),
        })),
        discountAmount: discountCents,
        deliveryFee: deliveryCents,
        taxRate,
      }),
    [lines, discountCents, deliveryCents, taxRate],
  );

  function addLine(line: CartLine) {
    setLines((prev) => [...prev, line]);
    toast(dict.product.addedToCart, "success");
  }
  function setQty(uid: string, quantity: number) {
    setLines((prev) =>
      quantity < 1
        ? prev.filter((l) => l.uid !== uid)
        : prev.map((l) => (l.uid === uid ? { ...l, quantity } : l)),
    );
  }
  function removeLine(uid: string) {
    setLines((prev) => prev.filter((l) => l.uid !== uid));
  }
  function reset() {
    setLines([]);
    setDiscountCents(0);
    setCustomer(null);
  }

  function buildPayload() {
    return {
      locale,
      type: orderType,
      tableNumber: null,
      customerId: customer?.id ?? null,
      addressId: orderType === "DELIVERY" ? customer?.address?.id ?? null : null,
      discountCents,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        kitchenNotes: l.kitchenNotes,
        choiceIds: l.options.map((o) => o.choiceId),
      })),
    };
  }

  function validateBeforeCheckout(): boolean {
    if (orderType === "DELIVERY" && !customer?.address) {
      toast(dict.validation.addressRequired, "error");
      setShowCustomer(true);
      return false;
    }
    return true;
  }

  function hold() {
    if (lines.length === 0) return;
    start(async () => {
      const res = await holdOrder(buildPayload());
      if (res.ok) {
        toast(dict.toast.orderHeld, "success");
        reset();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  function charge() {
    if (lines.length === 0) return;
    if (!validateBeforeCheckout()) return;
    setShowPayment(true);
  }

  function confirmPay(method: "CASH" | "CARD" | "ONLINE", tenderedCents: number | null) {
    start(async () => {
      const res = await payOrder({
        ...buildPayload(),
        paymentMethod: method,
        cashTenderedCents: tenderedCents,
      });
      if (res.ok) {
        setShowPayment(false);
        setReceipt(res.data);
        reset();
      } else {
        toast(
          res.error === "cashInsufficient"
            ? dict.payment.insufficientCash
            : dict.toast.genericError,
          "error",
        );
      }
    });
  }

  const needsAddress = orderType === "DELIVERY" && !customer?.address;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Header: order-type + customer control */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="w-full max-w-xs">
          <OrderTypeTabs value={orderType} onChange={setOrderType} />
        </div>

        <div className="ms-auto flex items-center gap-2">
          {customer ? (
            <div
              className={`flex items-center gap-2 rounded-[var(--radius-btn)] border bg-surface px-3 py-2 shadow-[var(--shadow-sm)] ${needsAddress ? "border-danger" : "border-border"}`}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-accent-weak text-xs font-bold text-accent">
                {customer.name.slice(0, 1)}
              </span>
              <span className="max-w-40 truncate text-sm font-semibold text-text">
                {customer.name}
              </span>
              <button
                onClick={() => setShowCustomer(true)}
                className="press text-xs font-semibold text-accent hover:underline"
              >
                {dict.customer.change}
              </button>
              <button
                onClick={() => setCustomer(null)}
                className="press rounded-md p-0.5 text-text-faint hover:text-danger"
                aria-label={dict.customer.clear}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomer(true)}
              className={`press flex items-center gap-2 rounded-[var(--radius-btn)] border px-4 py-2 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-surface-muted ${needsAddress ? "border-danger text-danger" : "border-border bg-surface text-text"}`}
            >
              <UserPlus className="size-4" />
              {dict.customer.selectCustomer}
            </button>
          )}
        </div>
      </div>

      {/* Working area: menu (lead) + cart */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <MenuBrowser categories={categories} onSelectItem={setActiveItem} />
        <CartColumn
          lines={lines}
          totals={totals}
          orderType={orderType}
          busy={pending}
          onQty={setQty}
          onRemove={removeLine}
          onDiscount={() => setShowDiscount(true)}
          onSplit={() => setShowSplit(true)}
          onHold={hold}
          onCharge={charge}
        />
      </div>

      <ProductModal item={activeItem} onClose={() => setActiveItem(null)} onAdd={addLine} />
      <PaymentModal
        open={showPayment}
        total={totals.total}
        busy={pending}
        onClose={() => setShowPayment(false)}
        onConfirm={confirmPay}
      />
      <DiscountModal
        open={showDiscount}
        current={discountCents}
        subtotal={totals.subtotal}
        onClose={() => setShowDiscount(false)}
        onApply={(cents) => {
          setDiscountCents(cents);
          setShowDiscount(false);
        }}
      />
      <SplitModal open={showSplit} total={totals.total} onClose={() => setShowSplit(false)} />
      {showCustomer ? (
        <CustomerSelectModal
          open
          streets={streets}
          onClose={() => setShowCustomer(false)}
          onAttach={(c) => {
            setCustomer(c);
            setShowCustomer(false);
          }}
        />
      ) : null}
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
