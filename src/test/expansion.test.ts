import assert from "node:assert/strict";
import test from "node:test";
import { ExpansionEpoch, shouldExpandFailedRun } from "../core/expansion";

// ---------- expansion epoch (superseding in-flight expansion work) ----------

test("ExpansionEpoch: a captured epoch is current until the next advance", () => {
  const gate = new ExpansionEpoch();
  const epoch = gate.advance();
  assert.equal(gate.isCurrent(epoch), true);
  assert.equal(gate.current, epoch);
});

test("ExpansionEpoch: advancing supersedes a loop that captured the old epoch", () => {
  const gate = new ExpansionEpoch();
  const runningLoop = gate.advance(); // "expand all" starts
  gate.advance(); // user switches to "collapsed"
  assert.equal(gate.isCurrent(runningLoop), false);
});

// ---------- failures expansion set (jobless failed runs stay collapsed) ----------

test("shouldExpandFailedRun: a failed run with jobs is expanded", () => {
  assert.equal(shouldExpandFailedRun(1), true);
  assert.equal(shouldExpandFailedRun(12), true);
});

test("shouldExpandFailedRun: a failed run confirmed to have no jobs is skipped", () => {
  assert.equal(shouldExpandFailedRun(0), false);
});

test("shouldExpandFailedRun: an unknown job count (jobs fetch failed) keeps the run", () => {
  assert.equal(shouldExpandFailedRun(null), true);
});

test("ExpansionEpoch: only the latest generation is current", () => {
  const gate = new ExpansionEpoch();
  const first = gate.advance();
  const second = gate.advance();
  const third = gate.advance();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), false);
  assert.equal(gate.isCurrent(third), true);
  assert.ok(first < second && second < third, "epochs increase monotonically");
});
