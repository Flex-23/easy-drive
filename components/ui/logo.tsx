export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="48" height="48" rx="12" fill="var(--accent)" />
      <path
        d="M14 16h14M14 24h11M14 32h14"
        stroke="var(--accent-fg)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M31 30l6 6"
        stroke="var(--accent-fg)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      Easy<span className="text-accent"> Drive</span>
    </span>
  );
}
