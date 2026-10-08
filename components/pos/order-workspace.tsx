"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, Printer, MapPinned } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { computeOrderTotals } from "@/lib/pricing";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { OrderTypeTabs, type OrderType } from "./order-type-tabs";
import { CartColumn } from "./cart-column";
import { CustomerPanel } from "./customer-panel";
import { MenuBrowser } from "./menu-browser";
import { ProductModal } from "./product-modal";
import { DiscountModal } from "./discount-modal";
import { SplitModal } from "./split-modal";
import { CustomerSelectModal } from "./customer-select-modal";
import { AddressSearchModal } from "./address-search-modal";
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
  heldOrders,
}: {
  categories: CategoryView[];
  heldOrders: OrderCard[];
}) {
  const { locale, dict } = useI18n();
  const errorText = (key: string) =>
    (dict.errors as Record<string, string>)[key] ?? dict.toast.genericError;
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Most of what leaves the shop goes out on a bike, so the till starts there.
  const [orderType, setOrderType] = useState<OrderType>("DELIVERY");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountCents, setDiscountCents] = useState(0);
  // Typed by the cashier per order. It survives `reset()` on purpose: the next
  // delivery almost always costs the same as the last, so the figure stays put
  // until someone changes it.
  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [customer, setCustomer] = useState<CustomerView | null>(null);

  const [activeItem, setActiveItem] = useState<MenuItemView | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  /** The customer form: picking somebody, or editing the one already chosen. */
  const [customerForm, setCustomerForm] = useState<"pick" | "edit" | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  /** The order just sent, while the cashier is being asked whether to print it. */
  const [printFor, setPrintFor] = useState<number | null>(null);

  // Menu lookup for rebuilding a parked bill's lines.
  const itemsById = useMemo(() => {
    const map = new Map<number, MenuItemView>();
    for (const category of categories) {
      for (const item of category.items) map.set(item.id, item);
    }
    return map;
  }, [categories]);

  const deliveryCents = orderType === "DELIVERY" ? deliveryFeeCents : 0;

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
      }),
    [lines, discountCents, deliveryCents],
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
      deliveryCents,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        kitchenNotes: l.kitchenNotes,
        choices: l.options.map((o) => ({ id: o.choiceId, priceCents: o.priceDelta })),
      })),
    };
  }

  function validateBeforeCheckout(): boolean {
    if (orderType === "DELIVERY" && !customer?.address) {
      toast(dict.validation.addressRequired, "error");
      setCustomerForm(customer ? "edit" : "pick");
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
            kind: match.group.kind,
            groupName: match.group.name,
            choiceName: match.choice.name,
            // A size costs what the menu says today; an extra costs what was
            // typed for it when the bill was parked.
            priceDelta: match.group.kind === "SIZE" ? match.choice.priceDelta : saved.priceDelta,
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
      setDeliveryFeeCents(data.deliveryFee);
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
   *
   * The order is on the board the moment this succeeds; printing is a separate
   * question asked afterwards, so a phoned-in repeat or a mis-tap does not cost
   * two slips of paper.
   */
  function charge() {
    if (lines.length === 0) return;
    if (!validateBeforeCheckout()) return;
    start(async () => {
      const res = await createOrder(buildPayload());
      if (res.ok) {
        toast(dict.toast.orderSent, "success");
        reset();
        router.refresh();
        setPrintFor(res.data.id);
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  /** The cashier said yes: the customer copy and the kitchen bon go out. */
  function print(orderId: number) {
    setPrintFor(null);
    printNewOrder(orderId).then((print) => {
      if (!print.ok) toast(errorText(print.error), "error");
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Header: how the order leaves the shop, and the way back to parked bills */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="w-full max-w-xs">
          <OrderTypeTabs value={orderType} onChange={setOrderType} />
        </div>
        {/* Who lives where — customers by street, district or postal code. */}
        <button
          onClick={() => setShowAddressSearch(true)}
          className="press ms-auto flex items-center gap-2 rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-muted shadow-[var(--shadow-sm)] hover:bg-surface-muted"
        >
          <MapPinned className="size-4" />
          {dict.customer.addressSearch}
        </button>
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
      </div>

      {/*
        Working area: the menu, and beside it one column for the order — the
        customer as a compact card on top, only as tall as what it says, and
        the bill filling the rest. A customer is a few lines; giving them a
        column of their own left most of it empty.
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-0">
          <MenuBrowser categories={categories} onSelectItem={setActiveItem} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <CustomerPanel
            customer={customer}
            orderType={orderType}
            onSelect={() => setCustomerForm("pick")}
            onEdit={() => setCustomerForm("edit")}
            onClear={() => setCustomer(null)}
          />
          <div className="min-h-0 flex-1">
            <CartColumn
            lines={lines}
            totals={totals}
            orderType={orderType}
            deliveryFeeCents={deliveryFeeCents}
            onDeliveryFee={setDeliveryFeeCents}
            busy={pending}
            onQty={setQty}
            onRemove={removeLine}
            onDiscount={() => setShowDiscount(true)}
            onSplit={() => setShowSplit(true)}
            onHold={hold}
            onCharge={charge}
          />
          </div>
        </div>
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
      {customerForm ? (
        <CustomerSelectModal
          open
          initial={customerForm === "edit" ? customer : null}
          onClose={() => setCustomerForm(null)}
          onAttach={(c) => {
            setCustomer(c);
            setCustomerForm(null);
          }}
        />
      ) : null}
      {showAddressSearch ? (
        <AddressSearchModal
          onClose={() => setShowAddressSearch(false)}
          onAttach={(c) => {
            setCustomer(c);
            setShowAddressSearch(false);
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
      {printFor !== null ? (
        <Modal
          open
          onClose={() => setPrintFor(null)}
          closeLabel={dict.common.close}
          maxWidth="max-w-md"
          title={
            <span className="flex items-center gap-2">
              <Printer className="size-5 text-accent" />
              {dict.cart.printPromptTitle}
            </span>
          }
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => setPrintFor(null)}
                className="press flex flex-1 items-center justify-center rounded-[var(--radius-btn)] border border-border py-3 font-semibold text-text-muted hover:bg-surface-muted"
              >
                {dict.cart.printNo}
              </button>
              <button
                data-autofocus
                onClick={() => print(printFor)}
                className="press flex flex-[2] items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong"
              >
                <Printer className="size-5" />
                {dict.cart.printYes}
              </button>
            </div>
          }
        >
          <p className="text-sm text-text-muted">{dict.cart.printPromptBody}</p>
        </Modal>
      ) : null}
    </div>
  );
}
