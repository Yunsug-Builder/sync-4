const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);

/**
 * X/Twitter proof URL canonicalizer used for both lookup and insert.
 * - host => x.com
 * - strips query/hash
 * - canonical path => /{handle}/status/{id}
 */
export function normalizeProofUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (X_HOSTS.has(host)) {
    const segments = parsed.pathname.split("/").filter(Boolean);
    const statusIdx = segments.findIndex((s) => s.toLowerCase() === "status");
    const handle = segments[0]?.replace(/^@+/, "").trim();
    const tweetId = statusIdx >= 0 ? segments[statusIdx + 1]?.trim() : "";
    if (!handle || !tweetId || !/^\d+$/.test(tweetId)) {
      return null;
    }
    return `https://x.com/${encodeURIComponent(handle)}/status/${tweetId}`;
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}
