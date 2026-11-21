import type { StatusBarCounts } from "./model";

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
