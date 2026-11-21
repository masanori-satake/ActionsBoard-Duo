/**
 * Expansion selector for the CI board tree.
 *
 * The four preset modes form a cycle, driven by a single title-bar button:
 * failures → running → all → collapsed → failures …
 * "manual" is not part of the cycle: it means the user toggled tree nodes by
 * hand. Cycling from "manual" restarts the cycle at its head ("failures").
 */
export type ExpansionMode = "failures" | "running" | "all" | "collapsed" | "manual";

/** The preset modes, in cycle order. */
export const EXPANSION_CYCLE: readonly Exclude<ExpansionMode, "manual">[] = [
  "failures",
  "running",
  "all",
  "collapsed",
];

/** The mode the cycle button applies next, given the current mode. */
export function nextExpansionMode(current: ExpansionMode): Exclude<ExpansionMode, "manual"> {
  const idx = EXPANSION_CYCLE.indexOf(current as (typeof EXPANSION_CYCLE)[number]);
  if (idx < 0) {
    return EXPANSION_CYCLE[0];
  }
  return EXPANSION_CYCLE[(idx + 1) % EXPANSION_CYCLE.length];
}

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
