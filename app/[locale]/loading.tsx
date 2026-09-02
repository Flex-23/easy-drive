export default function Loading() {
  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <div className="h-6 w-40 animate-pulse rounded-md bg-surface-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
        ))}
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
        <div className="animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
      </div>
    </div>
  );
}
