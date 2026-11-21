import assert from "node:assert/strict";
import test from "node:test";
import { buildExport, parseImport } from "../core/config";
import {
  listRunsUrl,
  normaliseBaseUrl,
  parseActionsUrl,
  parseJobs,
  parseRuns,
  parseWorkflows,
  webBaseFromApi,
} from "../core/github";
import { classifyProbe, livenessTransition, showsRecoveryMarker } from "../core/liveness";
import { aggregateStatusBar, isFreshFailure, selectBranchRuns, workflowVisible } from "../core/model";
import { normaliseStatus } from "../core/status";
import type { AccountHealth, GroupConfig, RunInfo, WatchedWorkflow, WorkflowState } from "../core/types";
import { groupDisplayName, workflowKey } from "../core/types";

// ---------- status normalisation ----------

test("normaliseStatus: completed conclusions", () => {
  assert.equal(normaliseStatus("completed", "success"), "success");
  assert.equal(normaliseStatus("completed", "failure"), "failure");
  assert.equal(normaliseStatus("completed", "timed_out"), "failure");
  assert.equal(normaliseStatus("completed", "startup_failure"), "failure");
  assert.equal(normaliseStatus("completed", "cancelled"), "other");
  assert.equal(normaliseStatus("completed", "skipped"), "other");
  assert.equal(normaliseStatus("completed", "neutral"), "other");
  assert.equal(normaliseStatus("completed", null), "other");
});

test("normaliseStatus: unfinished runs are running", () => {
  assert.equal(normaliseStatus("in_progress", null), "running");
  assert.equal(normaliseStatus("queued", null), "running");
  assert.equal(normaliseStatus("waiting", null), "running");
  assert.equal(normaliseStatus("pending", null), "running");
  assert.equal(normaliseStatus("requested", null), "running");
  assert.equal(normaliseStatus("", null), "running");
});

// ---------- GitHub parsing ----------

function runJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workflow_runs: [
      {
        id: 101,
        name: "CI",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
        display_title: "Fix bug",
        event: "push",
        run_number: 42,
        created_at: "2026-11-21T00:00:00Z",
        updated_at: "2026-11-21T00:05:00Z",
        html_url: "https://github.com/o/r/actions/runs/101",
        actor: { login: "alice" },
        triggering_actor: { login: "bob" },
        ...overrides,
      },
    ],
  };
}

test("parseRuns maps fields and prefers triggering_actor", () => {
  const runs = parseRuns(runJson());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].branch, "main");
  assert.equal(runs[0].status, "success");
  assert.equal(runs[0].actorLogin, "bob");
  assert.equal(runs[0].runNumber, 42);
});

test("parseJobs finds the failed step", () => {
  const jobs = parseJobs({
    jobs: [
      {
        id: 7,
        name: "build (ubuntu, 20)",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.com/o/r/actions/runs/1/job/7",
        started_at: "2026-11-21T00:00:00Z",
        completed_at: "2026-11-21T00:03:00Z",
        steps: [
          { name: "Checkout", status: "completed", conclusion: "success", number: 1 },
          { name: "Test", status: "completed", conclusion: "failure", number: 2 },
        ],
      },
    ],
  });
  assert.equal(jobs[0].status, "failure");
  assert.equal(jobs[0].failedStep, "Test");
});

test("parseWorkflows reads the workflow list", () => {
  const list = parseWorkflows({
    workflows: [{ id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
  });
  assert.equal(list[0].path, ".github/workflows/ci.yml");
});

test("urls: base normalisation and web base", () => {
  assert.equal(normaliseBaseUrl("https://api.github.com/"), "https://api.github.com");
  assert.equal(normaliseBaseUrl(""), "https://api.github.com");
  assert.equal(webBaseFromApi("https://api.github.com"), "https://github.com");
  assert.equal(webBaseFromApi("https://ghes.example.com/api/v3"), "https://ghes.example.com");
  assert.ok(listRunsUrl("https://api.github.com", "o", "r", "ci.yml").includes("/repos/o/r/actions/workflows/ci.yml/runs"));
});

test("parseActionsUrl variants", () => {
  assert.deepEqual(parseActionsUrl("https://github.com/o/r"), { owner: "o", repo: "r", workflow: undefined });
  assert.deepEqual(parseActionsUrl("https://github.com/o/r/actions/workflows/ci.yml"), {
    owner: "o",
    repo: "r",
    workflow: "ci.yml",
  });
  assert.equal(parseActionsUrl("not a url"), null);
  assert.equal(parseActionsUrl("https://github.com/onlyowner"), null);
});

// ---------- branch-run selection ----------

function makeRun(id: number, branch: string, status: RunInfo["status"], updatedAt: string, actor = "alice"): RunInfo {
  return {
    id,
    name: "CI",
    branch,
    status,
    rawStatus: "completed",
    conclusion: null,
    actorLogin: actor,
    title: `run ${id}`,
    event: "push",
    runNumber: id,
    createdAt: updatedAt,
    updatedAt,
    htmlUrl: "",
  };
}

test("selectBranchRuns keeps the newest run per branch", () => {
  const runs = [
    makeRun(3, "main", "success", "2026-11-21T03:00:00Z"),
    makeRun(2, "main", "failure", "2026-11-21T02:00:00Z"),
    makeRun(1, "dev", "failure", "2026-11-21T01:00:00Z"),
  ];
  const picked = selectBranchRuns(runs);
  assert.equal(picked.length, 2);
  assert.equal(picked.find((r) => r.branch === "main")?.id, 3);
});

test("selectBranchRuns orders failures first, then running, then success", () => {
  const runs = [
    makeRun(1, "ok", "success", "2026-11-21T03:00:00Z"),
    makeRun(2, "bad", "failure", "2026-11-21T01:00:00Z"),
    makeRun(3, "busy", "running", "2026-11-21T02:00:00Z"),
  ];
  assert.deepEqual(
    selectBranchRuns(runs).map((r) => r.branch),
    ["bad", "busy", "ok"],
  );
});

// ---------- scope / star filtering ----------

const wf = (starred: boolean): WatchedWorkflow => ({ owner: "o", repo: "r", workflow: "ci.yml", starred });
const stateWith = (runs: RunInfo[]): WorkflowState => ({
  key: "k",
  runs,
  branchRuns: runs,
  latest: runs[0],
  jobsByRun: {},
});

test("workflowVisible: starred-only display mode hides unstarred", () => {
  assert.equal(workflowVisible(wf(false), undefined, "me", "all", "starred"), false);
  assert.equal(workflowVisible(wf(true), undefined, "me", "all", "starred"), true);
});

test("workflowVisible: scope starred and mine", () => {
  assert.equal(workflowVisible(wf(false), undefined, "me", "starred", "all"), false);
  assert.equal(workflowVisible(wf(true), undefined, "me", "starred", "all"), true);
  const mine = stateWith([makeRun(1, "main", "success", "2026-11-21T00:00:00Z", "me")]);
  const notMine = stateWith([makeRun(1, "main", "success", "2026-11-21T00:00:00Z", "other")]);
  assert.equal(workflowVisible(wf(false), mine, "me", "mine", "all"), true);
  assert.equal(workflowVisible(wf(false), notMine, "me", "mine", "all"), false);
  assert.equal(workflowVisible(wf(false), undefined, undefined, "mine", "all"), false);
});

// ---------- liveness ----------

test("classifyProbe keeps the three states distinct", () => {
  assert.equal(classifyProbe(200, false), "reachable");
  assert.equal(classifyProbe(401, false), "authError");
  assert.equal(classifyProbe(403, false), "authError");
  assert.equal(classifyProbe(500, false), "unreachable");
  assert.equal(classifyProbe(null, true), "unreachable");
  assert.equal(classifyProbe(null, false), "unreachable");
});

test("livenessTransition detects outage and recovery edges", () => {
  assert.equal(livenessTransition("reachable", "unreachable").becameUnreachable, true);
  assert.equal(livenessTransition("unreachable", "unreachable").becameUnreachable, false);
  assert.equal(livenessTransition("unreachable", "reachable").recovered, true);
  assert.equal(livenessTransition("reachable", "reachable").recovered, false);
  assert.equal(livenessTransition(undefined, "unreachable").becameUnreachable, true);
});

test("recovery marker window", () => {
  const now = 1_000_000_000;
  assert.equal(showsRecoveryMarker(now - 60_000, now), true);
  assert.equal(showsRecoveryMarker(now - 20 * 60_000, now), false);
  assert.equal(showsRecoveryMarker(undefined, now), false);
});

// ---------- status bar aggregation ----------

function healthOf(state: AccountHealth["state"]): AccountHealth {
  return { state, since: 0 };
}

test("aggregateStatusBar counts workflows by newest run; outages excluded", () => {
  const wOk: WatchedWorkflow = { owner: "o", repo: "r", workflow: "ok.yml" };
  const wBad: WatchedWorkflow = { owner: "o", repo: "r", workflow: "bad.yml" };
  const wDown: WatchedWorkflow = { owner: "o", repo: "r", workflow: "down.yml" };
  const groups: GroupConfig[] = [
    { id: "g1", name: "G1", accountId: "a1", workflows: [wOk, wBad] },
    { id: "g2", name: "G2", accountId: "a2", workflows: [wDown] },
  ];
  const states = new Map<string, WorkflowState>([
    [workflowKey("a1", wOk), stateWith([makeRun(1, "main", "success", "2026-11-21T00:00:00Z")])],
    [workflowKey("a1", wBad), stateWith([makeRun(2, "main", "failure", "2026-11-21T00:00:00Z")])],
    // The down server's workflow also "failed" last time — it must NOT be
    // counted as a failure while the server is unreachable.
    [workflowKey("a2", wDown), stateWith([makeRun(3, "main", "failure", "2026-11-21T00:00:00Z")])],
  ]);
  const health = new Map<string, AccountHealth>([
    ["a1", healthOf("reachable")],
    ["a2", healthOf("unreachable")],
  ]);
  const counts = aggregateStatusBar(groups, states, health);
  assert.equal(counts.success, 1);
  assert.equal(counts.failure, 1);
  assert.equal(counts.running, 0);
  assert.equal(counts.unreachableServers, 1);
});

test("isFreshFailure fires once per failing run", () => {
  const failing = stateWith([makeRun(9, "main", "failure", "2026-11-21T00:00:00Z")]);
  const okBefore = stateWith([makeRun(8, "main", "success", "2026-11-21T00:00:00Z")]);
  assert.equal(isFreshFailure(okBefore, failing), true);
  assert.equal(isFreshFailure(failing, failing), false);
  assert.equal(isFreshFailure(undefined, failing), false);
});

// ---------- export / import ----------

test("export never carries a token field; import round-trips", () => {
  const config = {
    accounts: [{ id: "a1", name: "Main", baseUrl: "https://api.github.com" }],
    groups: [{ id: "g1", name: "G", accountId: "a1", workflows: [{ owner: "o", repo: "r", workflow: "ci.yml", starred: true }] }],
  };
  const exported = buildExport(config);
  const text = JSON.stringify(exported);
  assert.ok(!text.includes("token"), "export must not contain any token field");
  assert.deepEqual(parseImport(text), config);
});

test("parseImport rejects junk", () => {
  assert.throws(() => parseImport("not json"));
  assert.throws(() => parseImport("{}"));
  assert.throws(() =>
    parseImport(JSON.stringify({ accounts: [], groups: [{ id: "g", name: "G", accountId: "missing", workflows: [] }] })),
  );
});

// ---------- group display name ----------

test("groupDisplayName: a named group shows its name", () => {
  const g: GroupConfig = { id: "g1", name: "Release", accountId: "a1", workflows: [] };
  assert.equal(groupDisplayName(g, "(Unnamed group)"), "Release");
});

test("groupDisplayName: empty or whitespace-only name falls back to the placeholder", () => {
  const empty: GroupConfig = { id: "g1", name: "", accountId: "a1", workflows: [] };
  const blank: GroupConfig = { id: "g2", name: "   ", accountId: "a1", workflows: [] };
  assert.equal(groupDisplayName(empty, "（名前なしグループ）"), "（名前なしグループ）");
  assert.equal(groupDisplayName(blank, "（名前なしグループ）"), "（名前なしグループ）");
  // The stored name is never rewritten by the display helper.
  assert.equal(empty.name, "");
  assert.equal(blank.name, "   ");
});
