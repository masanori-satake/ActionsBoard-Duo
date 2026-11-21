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
