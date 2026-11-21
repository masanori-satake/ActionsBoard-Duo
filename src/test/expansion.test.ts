import assert from "node:assert/strict";
import test from "node:test";
import { EXPANSION_CYCLE, nextExpansionMode } from "../core/expansion";

// ---------- expansion cycle ----------

test("nextExpansionMode: full cycle order", () => {
  assert.equal(nextExpansionMode("failures"), "running");
  assert.equal(nextExpansionMode("running"), "all");
  assert.equal(nextExpansionMode("all"), "collapsed");
  assert.equal(nextExpansionMode("collapsed"), "failures");
});

test("nextExpansionMode: manual restarts the cycle at failures", () => {
  assert.equal(nextExpansionMode("manual"), "failures");
});

test("EXPANSION_CYCLE: the four presets, failures first", () => {
  assert.deepEqual([...EXPANSION_CYCLE], ["failures", "running", "all", "collapsed"]);
});
