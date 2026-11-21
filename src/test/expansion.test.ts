import assert from "node:assert/strict";
import test from "node:test";
import { ExpansionEpoch, shouldExpandFailedRun, shouldExpandOnStatusClick } from "../core/expansion";
import type { StatusBarCounts } from "../core/model";

const counts = (overrides: Partial<StatusBarCounts>): StatusBarCounts => ({
  success: 0,
  failure: 0,
  running: 0,
  unreachableServers: 0,
  authErrorServers: 0,
  ...overrides,
});

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

// ---------- status bar click (open with failures expanded when wrong) ----------

test("shouldExpandOnStatusClick: a healthy board only opens the panel", () => {
  assert.equal(shouldExpandOnStatusClick(counts({ success: 5 })), false);
  assert.equal(shouldExpandOnStatusClick(counts({ success: 3, running: 2 })), false);
  assert.equal(shouldExpandOnStatusClick(counts({})), false);
});

test("shouldExpandOnStatusClick: a build failure opens with failures expanded", () => {
  assert.equal(shouldExpandOnStatusClick(counts({ success: 4, failure: 1 })), true);
});

test("shouldExpandOnStatusClick: an unreachable server opens with failures expanded", () => {
  assert.equal(shouldExpandOnStatusClick(counts({ success: 4, unreachableServers: 1 })), true);
});

test("shouldExpandOnStatusClick: an authentication error alone opens with failures expanded", () => {
  assert.equal(shouldExpandOnStatusClick(counts({ authErrorServers: 1 })), true);
  assert.equal(shouldExpandOnStatusClick(counts({ success: 4, authErrorServers: 2 })), true);
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
