/**
 * Minimal HTTPS JSON fetch with an absolute timeout, following the Duo
 * hardening habits: 15 s cap, no request body, GET only. Read-only by design.
 *
 * Redirects are followed manually (at most 5) rather than with
 * redirect:"follow": the Authorization header is re-sent only while the
 * redirect target stays on the same host as the previous URL, so a
 * server-supplied redirect can never carry the token to another host.
 * Response bodies are capped at 10 MB — a hostile or broken server
 * cannot make the board buffer an unbounded payload.
 */

import { sameHost } from "./core/url";

export interface FetchResult {
  status: number;
  json: unknown;
  /** Retry-After of the final response, in milliseconds, when present and parseable. */
  retryAfterMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface FetchOptions {
  timeoutMs?: number;
  /**
   * Plain JSON negotiation for non-GitHub servers (Bamboo): GitHub's
   * vendor Accept header would make Bamboo's content negotiation fail,
   * so Bamboo requests ask for plain application/json instead.
   */
  bamboo?: boolean;
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds * 1000;
}

/**
 * Read a response body under the size cap. A declared Content-Length
 * over the cap fails the request outright; while streaming, the byte
 * count is enforced as chunks arrive and the read is aborted past the
 * cap. Throwing here surfaces exactly like any other fetch failure.
 */
async function readBodyCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error(`Response body too large (Content-Length ${declared} exceeds ${MAX_BODY_BYTES} bytes)`);
  }
  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) {
      throw new Error(`Response body too large (exceeds ${MAX_BODY_BYTES} bytes)`);
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The error below is the one that matters.
        }
        throw new Error(`Response body too large (exceeds ${MAX_BODY_BYTES} bytes)`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function fetchJson(
  url: string,
  token: string | undefined,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const baseHeaders: Record<string, string> = options.bamboo
      ? {
          Accept: "application/json",
          "User-Agent": "ActionsBoard-Duo",
        }
      : {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ActionsBoard-Duo",
        };
    let currentUrl = url;
    // Sticky: once a redirect leaves the original host, the token is
    // never sent again on this request, even if a later hop comes back.
    let sendAuth = true;
    for (let hop = 0; ; hop++) {
      const headers: Record<string, string> = { ...baseHeaders };
      if (token && sendAuth) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(currentUrl, { method: "GET", headers, signal: controller.signal, redirect: "manual" });
      const location = res.headers.get("location");
      if (!REDIRECT_STATUSES.has(res.status) || !location || hop >= MAX_REDIRECTS) {
        // Final response (or a redirect we do not follow: no Location,
        // or the hop budget is spent — the 3xx then surfaces to the
        // caller like any other non-2xx status).
        const text = await readBodyCapped(res);
        let json: unknown = null;
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
        }
        return { status: res.status, json, retryAfterMs: parseRetryAfterMs(res) };
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (!sameHost(currentUrl, nextUrl)) {
        sendAuth = false;
      }
      currentUrl = nextUrl;
    }
  } finally {
    clearTimeout(timer);
  }
}
