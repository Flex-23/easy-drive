"use client";

/**
 * Renders an inline script that runs during HTML parsing (before paint) on hard
 * loads, without React warning about script tags on the client. On the server
 * the tag is `text/javascript` (so the browser executes it); on the client —
 * including soft navigations like switching locale, and router.refresh() — it
 * renders the inert `text/plain` branch, so React never reconciles an
 * executable script tag and never warns. `suppressHydrationWarning` accepts the
 * server/client type mismatch. Must be a Client Component for the client branch
 * to run at all. See node_modules/next/dist/docs/.../preventing-flash-before-hydration.md.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
