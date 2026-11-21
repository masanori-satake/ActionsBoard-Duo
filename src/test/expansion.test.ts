import assert from "node:assert/strict";
import test from "node:test";
import { ExpansionEpoch } from "../core/expansion";

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
