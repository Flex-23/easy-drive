"use client";

import { UserPlus, UserRound, Phone, MapPin, MessageSquareText, History, X, Pencil } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/money";
import type { CustomerView } from "@/lib/queries/customers";
import type { OrderType } from "./order-type-tabs";

/**
 * Who the order is for, as a compact card above the bill. It shows the customer
 * the way the driver will need them — name, phone, the door — takes only the
 * lines that needs, and says plainly when a delivery still has nowhere to go.
 */
export function CustomerPanel({
  customer,
  orderType,
  onSelect,
  onEdit,
  onClear,
}: {
  customer: CustomerView | null;
  orderType: OrderType;
  /** Pick somebody — the form opens empty. */
  onSelect: () => void;
  /** Change the chosen customer's details — the form opens filled in. */
  onEdit: () => void;
  onClear: () => void;
}) {
  const delivery = orderType === "DELIVERY";
  // Only a chosen customer with nowhere to deliver to is a problem worth red;
  // an empty card at the start of an order is just the next thing to do.
  const missingAddress = delivery && customer !== null && !customer.address;

  return (
    <section
      className={`shrink-0 overflow-hidden rounded-[var(--radius-card)] border bg-surface ${
        missingAddress ? "border-danger" : "border-border"
      }`}
    >
      {customer ? (
        <CustomerDetails
          customer={customer}
          needsAddress={missingAddress}
          onChange={onEdit}
          onClear={onClear}
        />
      ) : (
        <NoCustomer delivery={delivery} onSelect={onSelect} />
      )}
    </section>
  );
}

/** One row: the situation on the left, the one thing to do on the right. */
function NoCustomer({ delivery, onSelect }: { delivery: boolean; onSelect: () => void }) {
  const { dict } = useI18n();
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <UserRound className="size-4 shrink-0 text-text-faint" />
          {dict.customer.noCustomer}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-text-faint">
          {delivery ? dict.validation.addressRequired : dict.customer.searchHint}
        </p>
      </div>
      <button
        onClick={onSelect}
        className="press flex shrink-0 items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-2 text-sm font-bold text-accent-fg shadow-[var(--shadow-sm)] hover:bg-accent-strong"
      >
        <UserPlus className="size-4" />
        {dict.customer.selectCustomer}
      </button>
    </div>
  );
}

function CustomerDetails({
  customer,
  needsAddress,
  onChange,
  onClear,
}: {
  customer: CustomerView;
  needsAddress: boolean;
  onChange: () => void;
  onClear: () => void;
}) {
  const { locale, dict } = useI18n();
  const { address } = customer;

  return (
    <>
      {/* Who — the initial as a tile, the name, the number; the controls at the end. */}
      <div className="flex items-center gap-3 bg-surface-muted/60 px-3 py-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-accent text-base font-bold text-accent-fg shadow-[var(--shadow-sm)]">
          {customer.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">{customer.name}</p>
          <p className="tnum flex items-center gap-1 text-xs text-text-muted" dir="ltr">
            <Phone className="size-3 shrink-0" />
            {customer.phone}
          </p>
        </div>
        <button
          onClick={onChange}
          aria-label={dict.customer.change}
          title={dict.customer.change}
          className="press rounded-md p-1.5 text-text-faint hover:bg-surface-muted hover:text-text"
        >
          <Pencil className="size-4" />
        </button>
        <button
          onClick={onClear}
          aria-label={dict.customer.clear}
          title={dict.customer.clear}
          className="press rounded-md p-1.5 text-text-faint hover:bg-surface-muted hover:text-danger"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Where — labels are for screen readers; the icons say it on screen. */}
      <dl className="px-3 py-2 text-sm leading-snug">
        <Row icon={MapPin} label={dict.customer.address}>
          {address ? (
            <>
              <span className="font-semibold text-text">
                {address.street} {address.houseNumber}
              </span>
              <span className="text-text-muted">
                {", "}
                {[address.postalCode, address.city].filter(Boolean).join(" ")}
                {address.area ? ` · ${address.area}` : ""}
              </span>
            </>
          ) : (
            <span className={needsAddress ? "font-semibold text-danger" : "text-text-faint"}>
              {needsAddress ? dict.validation.addressRequired : "—"}
            </span>
          )}
        </Row>

        {address?.notes ? (
          <Row icon={MessageSquareText} label={dict.customer.addressNotes} tone="warning">
            <span className="inline-block rounded-md bg-warning-weak px-1.5 py-0.5 text-xs italic text-warning">
              {address.notes}
            </span>
          </Row>
        ) : null}

        <Row icon={History} label={dict.customer.pastOrders}>
          <span className="text-xs text-text-muted">
            <span className="tnum font-semibold text-text">
              {formatNumber(customer.orderCount, locale)}
            </span>{" "}
            {dict.customer.pastOrders}
          </span>
        </Row>
      </dl>

      {/* A delivery with no address has one job left; say it as the button. */}
      {needsAddress ? (
        <div className="border-t border-border p-2">
          <button
            onClick={onChange}
            className="press flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-2 text-sm font-bold text-accent-fg shadow-[var(--shadow-sm)] hover:bg-accent-strong"
          >
            <MapPin className="size-4" />
            {dict.orderType.deliveryAddress}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** One line of the card: an icon in the margin, the value beside it. */
function Row({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon
        className={`mt-0.5 size-3.5 shrink-0 ${tone === "warning" ? "text-warning" : "text-text-faint"}`}
        aria-hidden
      />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
