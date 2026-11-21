import type { RunStatus } from "./types";

/**
 * Normalise a GitHub Actions status/conclusion pair into the four board
 * statuses: 成功 (success) / 失敗 (failure) / 実行中 (running) / その他 (other).
 *
 * - Not completed yet (queued, waiting, pending, requested, in_progress)
 *   counts as running: the run is alive and on its way.
 * - Completed: success → success; failure / timed_out / startup_failure →
 *   failure; everything else (cancelled, skipped, neutral, action_required,
 *   stale) → other.
 */
export function normaliseStatus(status: string | null | undefined, conclusion: string | null | undefined): RunStatus {
  const s = (status ?? "").toLowerCase();
  if (s !== "completed") {
    return "running";
  }
  switch ((conclusion ?? "").toLowerCase()) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    default:
      return "other";
  }
}

/** Sort rank for display: failures first, then running, other, success. */
export function statusRank(status: RunStatus): number {
  switch (status) {
    case "failure":
      return 0;
    case "running":
      return 1;
    case "other":
      return 2;
    case "success":
      return 3;
  }
}
