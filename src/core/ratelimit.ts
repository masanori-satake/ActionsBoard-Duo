/**
 * Pure rate-limit (HTTP 429) decisions for build polling. A 429 means
 * the server is alive but asking us to back off: the account's build
 * polling pauses until the reset time, while liveness probing carries
 * on (and keeps classifying 429 as "reachable" — see classifyProbe).
 */

/** A server-supplied Retry-After is honoured at most this far out. */
export const RATE_LIMIT_MAX_MS = 15 * 60 * 1000;

/**
 * The timestamp until which an account stays rate-limited after a
 * response, or undefined when the response is not a 429. With a
 * Retry-After value, it wins (capped at RATE_LIMIT_MAX_MS); without
 * one, the pause lasts until the next liveness cycle would run
 * (fallbackMs from now) — liveness is the board's recovery detector,
 * so its cadence is the natural retry rhythm.
 */
export function rateLimitResetAt(
  status: number,
  retryAfterMs: number | undefined,
  now: number,
  fallbackMs: number,
): number | undefined {
  if (status !== 429) {
    return undefined;
  }
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return now + Math.min(retryAfterMs, RATE_LIMIT_MAX_MS);
  }
  return now + fallbackMs;
}

/** True while the rate-limit pause recorded for an account is still running. */
export function isRateLimited(resetAt: number | undefined, now: number): boolean {
  return resetAt !== undefined && now < resetAt;
}
