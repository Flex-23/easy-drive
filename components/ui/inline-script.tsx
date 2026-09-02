/**
 * Renders an inline script that runs during HTML parsing (before paint) on hard
 * loads, without React warning about script tags on the client. On the server
 * the tag is `text/javascript` (so the browser executes it); on the client it
 * is inert `text/plain`. `suppressHydrationWarning` accepts the type mismatch.
 * See node_modules/next/dist/docs/.../preventing-flash-before-hydration.md.
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
