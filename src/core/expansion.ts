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
