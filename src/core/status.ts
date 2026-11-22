import type { RunInfo, RunStatus } from "./types";

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

/**
 * Whether a branch-run row is shown muted (gray). A workflow's status is
 * carried by its newest run overall (WorkflowState.latest); branch runs for
 * other runs — older runs, side branches — do not decide the workflow's
 * current state, so their icons are de-emphasised. When the latest run is
 * unknown (state not fetched yet), nothing is muted.
 */
export function isMutedRun(latest: RunInfo | undefined, run: RunInfo): boolean {
  return latest !== undefined && latest.id !== run.id;
}

