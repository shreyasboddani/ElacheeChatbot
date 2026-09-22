export const APPROVED_ELACHEE_HOSTS = new Set([
  "elachee.org",
  "www.elachee.org",
]);

export function getApprovedWebsiteUrl(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !APPROVED_ELACHEE_HOSTS.has(url.hostname)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isApprovedWebsiteUrl(value: string): boolean {
  return getApprovedWebsiteUrl(value) !== undefined;
}

export function canonicalizeElacheeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!APPROVED_ELACHEE_HOSTS.has(url.hostname)) return undefined;
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

    url.protocol = "https:";
    url.hostname = "elachee.org";
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return undefined;
  }
}
