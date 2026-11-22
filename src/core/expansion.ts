import type { StatusBarCounts } from "./model";
import type { RunInfo } from "./types";

/**
 * Expansion selector for the CI board tree.
 *
 * The tree has four preset expansion modes — "failures", "running", "all"
 * and "collapsed" — each with its own title-bar button. "manual" is not a
 * preset: it means the user toggled tree nodes by hand, so no preset button
 * is the current one.
 */
export type ExpansionMode = "failures" | "running" | "all" | "collapsed" | "manual";

/**
 * Generation counter that makes expansion work supersede-able.
 *
 * Applying an expansion mode reveals its target nodes one by one, which
 * takes time when the tree is large. Every new expansion instruction
 * advances the epoch; a reveal loop captures the epoch when it starts and
 * checks `isCurrent` before each step, stopping as soon as a newer
 * instruction (e.g. switching to "collapsed") has superseded it.
 */
/**
 * Whether a failed run belongs in the "failures" expansion set.
 *
 * `jobCount` is the number of jobs the run actually has, or null when the
 * jobs could not be fetched (the count is unknown). A run confirmed to
 * have no jobs at all — it failed before any job started — is left
 * collapsed: expanding it would reveal nothing but the "no jobs"
 * placeholder row. An unknown count keeps the run in the set: a failed
 * jobs fetch leaves a warning placeholder behind, which is a real
 * problem worth surfacing, not noise.
 */
export function shouldExpandFailedRun(jobCount: number | null): boolean {
  return jobCount === null || jobCount > 0;
}

/**
 * Whether a run is its workflow's current failure: the run failed AND
 * it is the workflow's newest run overall. A failure on a side branch
 * that the workflow has since moved past — a newer run exists, whether
 * it succeeded or is still running — is history, not the current
 * state, so it stays out of the "failures" expansion set. The tree
 * already mutes such runs for the same reason, and the status bar
 * counts and failure notifications likewise key on the newest run.
 * `latest` is undefined when no newest run is known; nothing counts
 * as current then.
 */
export function isLatestFailure(run: RunInfo, latest: RunInfo | undefined): boolean {
  return run.status === "failure" && latest !== undefined && latest.id === run.id;
}

/**
 * Whether clicking the status bar item should open the board with the
 * failures-only expansion applied, judged from the very counts the item
 * displays. Something being wrong means a build failure, an unreachable
 * server, or an authentication error. An authentication error counts
 * too: the click leads the user to the board, where the affected
 * server is expanded and shows the error and its reason.
 */
export function shouldExpandOnStatusClick(counts: StatusBarCounts): boolean {
  return counts.failure > 0 || counts.unreachableServers > 0 || counts.authErrorServers > 0;
}

export class ExpansionEpoch {
  private epoch = 0;

  /** The current epoch value. */
  get current(): number {
    return this.epoch;
  }

  /** Begin a new generation, invalidating every previously captured epoch. */
  advance(): number {
    this.epoch += 1;
    return this.epoch;
  }

  /** Whether a previously captured epoch is still the current generation. */
  isCurrent(epoch: number): boolean {
    return epoch === this.epoch;
  }
}
