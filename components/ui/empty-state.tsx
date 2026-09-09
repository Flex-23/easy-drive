import type { LucideIcon } from "lucide-react";

/**
 * What a list says when it has nothing to show. A bare line of grey text reads
 * as a bug; an icon in a quiet disc reads as a state the screen expected.
 */
export function EmptyState({
  icon: Icon,
  children,
  hint,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-text-faint">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-text-muted">{children}</p>
      {hint ? <p className="max-w-56 text-xs text-text-faint">{hint}</p> : null}
    </div>
  );
}
