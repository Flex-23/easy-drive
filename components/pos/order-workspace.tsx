"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, PauseCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { computeOrderTotals } from "@/lib/pricing";
import { useToast } from "@/components/ui/toast";
import { OrderTypeTabs, type OrderType } from "./order-type-tabs";
import { CartColumn } from "./cart-column";
import { MenuBrowser } from "./menu-browser";
import { ProductModal } from "./product-modal";
import { DiscountModal } from "./discount-modal";
import { SplitModal } from "./split-modal";
import { CustomerSelectModal } from "./customer-select-modal";
import { HeldOrdersModal } from "./held-orders-modal";
import {
  holdOrder,
  createOrder,
  resumeOrder,
  deleteHeldOrder,
} from "@/app/actions/orders";
import { printNewOrder } from "@/app/actions/print";
import type { CategoryView, MenuItemView } from "@/types/menu";
import type { CartLine, CartLineOption } from "@/types/order";
import type { CustomerView } from "@/lib/queries/customers";
import type { OrderCard } from "@/lib/queries/orders";

export function OrderWorkspace({
  categories,
  taxRate,
  deliveryFee,
  heldOrders,
}: {
  categories: CategoryView[];
  taxRate: number;
  deliveryFee: number;
  heldOrders: OrderCard[];
}) {
  const { locale, dict } = useI18n();
  const errorText = (key: string) =>
    (dict.errors as Record<string, string>)[key] ?? dict.toast.genericError;
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountCents, setDiscountCents] = useState(0);
  const [customer, setCustomer] = useState<CustomerView | null>(null);

  const [activeItem, setActiveItem] = useState<MenuItemView | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showHeld, setShowHeld] = useState(false);

  // Menu lookup for rebuilding a parked bill's lines.
  const itemsById = useMemo(() => {
    const map = new Map<number, MenuItemView>();
    for (const category of categories) {
      for (const item of category.items) map.set(item.id, item);
    }
    return map;
  }, [categories]);

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
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  /**
   * Bring a parked bill back to the till. Lines are rebuilt against today's
   * menu, so prices and options are the current ones; anything that has since
   * left the menu is dropped and reported.
   */
  function resume(id: number) {
    start(async () => {
      const res = await resumeOrder(id, locale);
      if (!res.ok) {
        toast(dict.toast.genericError, "error");
        return;
      }
      const { data } = res;
      const rebuilt: CartLine[] = [];
      let dropped = 0;
      let droppedOptions = 0;

      data.lines.forEach((line, index) => {
        const item = line.itemId === null ? undefined : itemsById.get(line.itemId);
        if (!item) {
          dropped += 1;
          return;
        }
        // A saved option is matched to today's menu by name, so renaming a size
        // or an extra in the panel loses it. That quietly changes the price, so
        // the misses are counted and the cashier is told rather than left to
        // notice a bill that no longer adds up.
        const options: CartLineOption[] = [];
        for (const saved of line.options) {
          const match = item.groups
            .flatMap((group) => group.choices.map((choice) => ({ group, choice })))
            .find(({ choice }) => choice.name === saved.choiceName);
          if (!match) {
            droppedOptions += 1;
            continue;
          }
          options.push({
            groupId: match.group.id,
            choiceId: match.choice.id,
            groupName: match.group.name,
            choiceName: match.choice.name,
            priceDelta: match.choice.priceDelta,
          });
        }
        rebuilt.push({
          uid: `${item.id}-${Date.now()}-${index}`,
          itemId: item.id,
          itemNumber: item.itemNumber,
          name: item.name,
          categoryName: item.categoryName,
          basePrice: item.basePrice,
          quantity: line.quantity,
          options,
        });
      });

      setLines(rebuilt);
      setOrderType(data.type);
      setDiscountCents(data.discount);
      setCustomer(data.customer);
      setShowHeld(false);
      // The bill left the parked list the moment it was recalled.
      router.refresh();
      if (dropped > 0) toast(dict.held.missingItems, "info");
      else if (droppedOptions > 0) toast(dict.held.missingOptions, "info");
      else toast(dict.toast.orderResumed, "success");
    });
  }

  function removeHeld(id: number) {
    start(async () => {
      const res = await deleteHeldOrder(id, locale);
      if (res.ok) {
        toast(dict.held.deleted, "success");
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  /**
   * Send the finished cart to the orders board. Nothing is paid here: the board
   * is where an order is handed to a driver or settled in cash or online.
   */
  function charge() {
    if (lines.length === 0) return;
    if (!validateBeforeCheckout()) return;
    start(async () => {
      const res = await createOrder(buildPayload());
      if (res.ok) {
        toast(dict.toast.orderSent, "success");
        // The customer copy and the kitchen bon go straight to the printer.
        printNewOrder(res.data.id).then((print) => {
          if (!print.ok) toast(errorText(print.error), "error");
        });
        reset();
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
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
          {/* Parked bills — the way back to anything put aside. */}
          <button
            onClick={() => setShowHeld(true)}
            className={`press flex items-center gap-2 rounded-[var(--radius-btn)] border px-3 py-2 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-surface-muted ${
              heldOrders.length > 0
                ? "border-warning bg-warning-weak text-warning"
                : "border-border bg-surface text-text-muted"
            }`}
          >
            <PauseCircle className="size-4" />
            {dict.held.title}
            {heldOrders.length > 0 ? (
              <span className="tnum inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-xs font-bold text-white">
                {heldOrders.length}
              </span>
            ) : null}
          </button>

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
          onClose={() => setShowCustomer(false)}
          onAttach={(c) => {
            setCustomer(c);
            setShowCustomer(false);
          }}
        />
      ) : null}
      {showHeld ? (
        <HeldOrdersModal
          orders={heldOrders}
          busy={pending}
          onClose={() => setShowHeld(false)}
          onResume={resume}
          onDelete={removeHeld}
        />
      ) : null}
    </div>
  );
}
