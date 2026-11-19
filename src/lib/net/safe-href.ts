/**
 * Link and image targets from agent- or user-written content: only http(s), mailto, same-page anchors, relative
 * paths and (for images) data:image. Everything else (javascript:, vbscript:, data:text/html, file:, blob: from
 * elsewhere, control characters used to hide a scheme) becomes undefined. Safe in client and server code.
 */
export function safeHref(raw: string | null | undefined, kind: "link" | "image" = "link"): string | undefined {
  if (typeof raw !== "string") return undefined;
  // Browsers drop tabs and newlines inside URLs ("java\tscript:"), so they are removed before the scheme is read.
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase();
  if (!scheme) return s.startsWith("//") || s.startsWith("\\\\") || s.startsWith("/\\") ? undefined : s;
  if (scheme === "http" || scheme === "https") return s;
  if (kind === "link" && scheme === "mailto") return s;
  if (kind === "image" && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s)) return s;
  return undefined;
}
