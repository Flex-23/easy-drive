"use client";

import { Printer, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatDateTime } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import type { ReceiptData } from "@/types/order";

export function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptData | null;
  onClose: () => void;
}) {
  const { locale, dict } = useI18n();
  if (!receipt) return null;

  const typeLabel =
    receipt.type === "DINE_IN"
      ? dict.orderType.dineIn
      : receipt.type === "PICKUP"
        ? dict.orderType.pickup
        : dict.orderType.delivery;

  return (
    <Modal
      open={!!receipt}
      onClose={onClose}
      closeLabel={dict.common.close}
      maxWidth="max-w-md"
      title={
        <span className="flex items-center gap-2">
          <Check className="size-5 text-success" />
          {dict.toast.orderPaid}
        </span>
      }
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="press flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-border py-2.5 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            <Printer className="size-4" />
            {dict.receipt.printReceipt}
          </button>
          <button
            onClick={onClose}
            className="press flex-1 rounded-[var(--radius-btn)] bg-accent py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong"
          >
            {dict.common.close}
          </button>
        </div>
      }
    >
      <div className="receipt-print mx-auto max-w-xs font-mono text-sm text-text">
        <div className="text-center">
          <p className="text-base font-bold">{receipt.restaurantName}</p>
          {receipt.receiptHeader ? (
            <p className="text-xs text-text-muted">{receipt.receiptHeader}</p>
          ) : null}
        </div>
        <div className="my-3 border-t border-dashed border-border pt-2 text-xs">
          <div className="flex justify-between">
            <span>{dict.receipt.order}</span>
            <span className="tnum">{receipt.orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>{dict.receipt.date}</span>
            <span className="tnum">{formatDateTime(receipt.createdAt, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span>{dict.dailyReport.type}</span>
            <span>{typeLabel}</span>
          </div>
          {receipt.tableNumber ? (
            <div className="flex justify-between">
              <span>{dict.receipt.table}</span>
              <span className="tnum">{receipt.tableNumber}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span>{dict.receipt.cashier}</span>
            <span>{receipt.cashierName}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-border py-2">
          {receipt.lines.map((l, i) => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between gap-2">
                <span className="flex-1">
                  <span className="tnum">{l.quantity}×</span> {l.name}
                </span>
                <span className="tnum">{formatMoney(l.lineTotal, locale)}</span>
              </div>
              {l.options.length > 0 ? (
                <p className="ps-4 text-xs text-text-muted">{l.options.join(", ")}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-border pt-2 text-xs">
          <Line label={dict.cart.subtotal} value={formatMoney(receipt.subtotal, locale)} />
          {receipt.discount > 0 ? (
            <Line label={dict.cart.discount} value={`− ${formatMoney(receipt.discount, locale)}`} />
          ) : null}
          {receipt.deliveryFee > 0 ? (
            <Line label={dict.cart.deliveryFee} value={formatMoney(receipt.deliveryFee, locale)} />
          ) : null}
          <Line label={dict.cart.tax} value={formatMoney(receipt.tax, locale)} />
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-bold">
            <span>{dict.cart.total}</span>
            <span className="tnum">{formatMoney(receipt.total, locale)}</span>
          </div>
          {receipt.cashTendered !== null ? (
            <>
              <Line label={dict.payment.cashTendered} value={formatMoney(receipt.cashTendered, locale)} />
              <Line label={dict.payment.change} value={formatMoney(receipt.change ?? 0, locale)} />
            </>
          ) : null}
        </div>

        <p className="mt-3 border-t border-dashed border-border pt-2 text-center text-xs">
          {receipt.receiptFooter || dict.receipt.thankYou}
        </p>
      </div>
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
