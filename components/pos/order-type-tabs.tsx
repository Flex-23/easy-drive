"use client";

import { UtensilsCrossed, ShoppingBag, Bike } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export type OrderType = "DINE_IN" | "PICKUP" | "DELIVERY";

export function OrderTypeTabs({
  value,
  onChange,
}: {
  value: OrderType;
  onChange: (t: OrderType) => void;
}) {
  const { dict } = useI18n();
  const tabs: { type: OrderType; label: string; icon: typeof Bike }[] = [
    { type: "DINE_IN", label: dict.orderType.dineIn, icon: UtensilsCrossed },
    { type: "PICKUP", label: dict.orderType.pickup, icon: ShoppingBag },
    { type: "DELIVERY", label: dict.orderType.delivery, icon: Bike },
  ];

  return (
    <div
      role="tablist"
      aria-label={dict.orderType.dineIn}
      className="grid grid-cols-3 gap-1 rounded-[var(--radius-btn)] border border-border bg-surface-muted p-1"
    >
      {tabs.map((t) => {
        const active = value === t.type;
        const Icon = t.icon;
        return (
          <button
            key={t.type}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.type)}
            className={`press flex items-center justify-center gap-2 rounded-[calc(var(--radius-btn)-2px)] px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-accent text-accent-fg shadow-[var(--shadow-sm)]"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Icon className="size-4" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
