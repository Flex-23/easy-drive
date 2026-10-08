import type { OrderStatus } from "@prisma/client";

const statusTone: Record<OrderStatus, string> = {
  DRAFT: "bg-surface-muted text-text-muted",
  HELD: "bg-warning-weak text-warning",
  PENDING: "bg-accent-weak text-accent",
  PREPARING: "bg-accent-weak text-accent",
  READY: "bg-success-weak text-success",
  COMPLETED: "bg-success-weak text-success",
  CANCELLED: "bg-danger-weak text-danger",
};

export function StatusBadge({
  status,
  label,
}: {
  status: OrderStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[status]}`}
    >
      {label}
    </span>
  );
}

export function OrderTypeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
      {label}
    </span>
  );
}
