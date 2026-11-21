/**
 * Pure URL helpers shared by the config validation (only http/https
 * base URLs are usable) and the fetch layer (credentials follow a
 * redirect only while the host stays the same). No vscode dependency.
 */

/** True when the value parses as a URL with an http: or https: scheme. */
export function isHttpUrlString(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Coerce a stored base URL to a usable one: a string that parses as an
 * http/https URL is kept (trimmed); anything else — non-string, empty,
 * unparseable, or another scheme such as ftp: or file: — becomes "".
 * The empty result then flows through the existing empty-baseUrl
 * handling (GitHub falls back to api.github.com; Bamboo requests fail
 * as network errors), never into a request with a foreign scheme.
 */
export function sanitiseBaseUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  return isHttpUrlString(trimmed) ? trimmed : "";
}

/** True when both URLs parse and name the same host (host:port). */
export function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}
