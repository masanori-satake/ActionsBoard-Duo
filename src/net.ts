/**
 * Minimal HTTPS JSON fetch with an absolute timeout, following the Duo
 * hardening habits: 15 s cap, no request body, GET only. Read-only by design.
 */

export interface FetchResult {
  status: number;
  json: unknown;
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

export async function fetchJson(url: string, token: string | undefined, timeoutMs = TIMEOUT_MS): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ActionsBoard-Duo",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal, redirect: "follow" });
    let json: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}
