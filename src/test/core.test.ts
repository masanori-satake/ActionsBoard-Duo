import assert from "node:assert/strict";
import test from "node:test";
import {
  listRunsUrl,
  normaliseBaseUrl,
  normalisePagesStatus,
  pagesDeploymentsUrl,
  parseJobs,
  parsePagesDeployment,
  parseRepoUrl,
  parseRuns,
  parseWorkflowName,
  parseWorkflows,
  webBaseFromApi,
} from "../core/github";
import {
  classifyProbe,
  decideProbe,
  livenessTransition,
  nextRecoveredAt,
  showsRecoveryMarker,
  withoutRecoveryMarker,
} from "../core/liveness";
import { aggregateStatusBar, isFreshFailure, selectBranchRuns, visibleGroups, workflowVisible } from "../core/model";
import { moveGroup, moveWatchedItem } from "../core/reorder";
import { isMutedRun, normaliseStatus } from "../core/status";
import type {
  AccountHealth,
  GroupConfig,
  RunInfo,
  WatchedItem,
  WatchedWorkflow,
  WorkflowState,
} from "../core/types";
import { groupDisplayName, isPlanEntry, itemKey, planDisplayName, sameItem, workflowDisplayName, workflowKey } from "../core/types";

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

test("parseWorkflowName captures the workflow name from the runs payload", () => {
  assert.equal(parseWorkflowName(runJson()), "CI");
  assert.equal(parseWorkflowName(runJson({ name: "AI Coder Trigger" })), "AI Coder Trigger");
});

test("parseWorkflowName is undefined when there is nothing to take it from", () => {
  assert.equal(parseWorkflowName({ workflow_runs: [] }), undefined);
  assert.equal(parseWorkflowName({}), undefined);
  assert.equal(parseWorkflowName(null), undefined);
  assert.equal(parseWorkflowName(runJson({ name: "" })), undefined);
  assert.equal(parseWorkflowName(runJson({ name: "   " })), undefined);
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

test("parseRepoUrl: web URLs, with and without trailing slash", () => {
  assert.deepEqual(parseRepoUrl("https://github.com/masanori-satake/QuickLog-Solo"), {
    owner: "masanori-satake",
    repo: "QuickLog-Solo",
  });
  assert.deepEqual(parseRepoUrl("https://github.com/masanori-satake/QuickLog-Solo/"), {
    owner: "masanori-satake",
    repo: "QuickLog-Solo",
  });
  assert.deepEqual(parseRepoUrl("http://github.com/o/r"), { owner: "o", repo: "r" });
});

test("parseRepoUrl: extra path segments and query/fragment are ignored", () => {
  assert.deepEqual(parseRepoUrl("https://github.com/o/r/actions"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("https://github.com/o/r/blob/main/README.md"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("https://ghes.example.com/o/r/pulls?foo=bar#frag"), { owner: "o", repo: "r" });
});

test("parseRepoUrl: .git suffix, SSH form, bare owner/repo, whitespace", () => {
  assert.deepEqual(parseRepoUrl("https://github.com/o/r.git"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("git@github.com:o/r.git"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("git@github.com:o/r"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("o/r"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("  https://github.com/o/r  \n"), { owner: "o", repo: "r" });
  assert.deepEqual(parseRepoUrl("github.com/o/r"), { owner: "o", repo: "r" });
});

test("parseRepoUrl: unparseable input returns undefined", () => {
  assert.equal(parseRepoUrl(""), undefined);
  assert.equal(parseRepoUrl("   "), undefined);
  assert.equal(parseRepoUrl("https://github.com/"), undefined);
  assert.equal(parseRepoUrl("https://github.com/onlyowner"), undefined);
  assert.equal(parseRepoUrl("justone"), undefined);
  assert.equal(parseRepoUrl("not a url at all"), undefined);
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

test("decideProbe holds the first unreachable result pending confirmation", () => {
  const first = decideProbe("reachable", "unreachable", 0);
  assert.equal(first.applyState, undefined);
  assert.equal(first.needsConfirmation, true);
  assert.equal(first.consecutiveUnreachable, 1);
  // A brand-new account (no recorded state) is held the same way.
  const fresh = decideProbe(undefined, "unreachable", 0);
  assert.equal(fresh.applyState, undefined);
  assert.equal(fresh.needsConfirmation, true);
});

test("decideProbe applies unreachable once the confirmation agrees", () => {
  const second = decideProbe("reachable", "unreachable", 1);
  assert.equal(second.applyState, "unreachable");
  assert.equal(second.needsConfirmation, false);
  assert.equal(second.consecutiveUnreachable, 2);
});

test("decideProbe keeps an already-unreachable account applied without confirmation", () => {
  const again = decideProbe("unreachable", "unreachable", 0);
  assert.equal(again.applyState, "unreachable");
  assert.equal(again.needsConfirmation, false);
});

test("decideProbe applies reachable and authError immediately and resets the streak", () => {
  const back = decideProbe("reachable", "reachable", 1);
  assert.equal(back.applyState, "reachable");
  assert.equal(back.consecutiveUnreachable, 0);
  assert.equal(back.needsConfirmation, false);
  // A 401/403 is deterministic: no confirmation, even mid-streak.
  const auth = decideProbe("reachable", "authError", 1);
  assert.equal(auth.applyState, "authError");
  assert.equal(auth.consecutiveUnreachable, 0);
  assert.equal(auth.needsConfirmation, false);
  // Recovery out of unreachable is a single-probe transition, as before.
  const recovered = decideProbe("unreachable", "reachable", 5);
  assert.equal(recovered.applyState, "reachable");
  assert.equal(recovered.consecutiveUnreachable, 0);
});

test("recovery marker window", () => {
  const now = 1_000_000_000;
  assert.equal(showsRecoveryMarker(now - 60_000, now), true);
  assert.equal(showsRecoveryMarker(now - 20 * 60_000, now), false);
  assert.equal(showsRecoveryMarker(undefined, now), false);
});

test("nextRecoveredAt sets the marker only for a witnessed recovery", () => {
  const now = 2_000_000_000;
  const recovery = livenessTransition("unreachable", "reachable");
  // Mid-session recovery: the marker is set, as before.
  assert.equal(nextRecoveredAt(recovery, undefined, now, true), now);
  // The same recovery applied by the silent startup baseline sets no
  // marker — and clears one the previous state somehow still carried.
  assert.equal(nextRecoveredAt(recovery, undefined, now, false), undefined);
  assert.equal(nextRecoveredAt(recovery, now - 60_000, now, false), undefined);
  // No recovery edge: the previous marker carries over untouched.
  const steady = livenessTransition("reachable", "reachable");
  assert.equal(nextRecoveredAt(steady, now - 60_000, now, true), now - 60_000);
  assert.equal(nextRecoveredAt(steady, undefined, now, false), undefined);
  const outage = livenessTransition("reachable", "unreachable");
  assert.equal(nextRecoveredAt(outage, now - 60_000, now, true), now - 60_000);
});

test("withoutRecoveryMarker drops a persisted marker and keeps the rest", () => {
  const stored: AccountHealth = { state: "reachable", since: 10, lastOkAt: 20, recoveredAt: 15, login: "me" };
  const loaded = withoutRecoveryMarker(stored);
  assert.equal(loaded.recoveredAt, undefined);
  assert.equal(loaded.state, "reachable");
  assert.equal(loaded.since, 10);
  assert.equal(loaded.lastOkAt, 20);
  assert.equal(loaded.login, "me");
  // The stored object itself is not mutated.
  assert.equal(stored.recoveredAt, 15);
  // No marker to drop: the health is returned unchanged.
  const plain: AccountHealth = { state: "unreachable", since: 5 };
  assert.equal(withoutRecoveryMarker(plain), plain);
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

// ---------- workflow display name ----------

test("workflowDisplayName: the workflow name beats the file name", () => {
  const w: WatchedWorkflow = { owner: "o", repo: "r", workflow: "ai-coder-trigger.yml" };
  assert.equal(workflowDisplayName(w, "AI Coder Trigger"), "AI Coder Trigger");
});

test("workflowDisplayName: falls back to the file name before the first fetch", () => {
  const w: WatchedWorkflow = { owner: "o", repo: "r", workflow: "ai-coder-trigger.yml" };
  assert.equal(workflowDisplayName(w, undefined), "ai-coder-trigger.yml");
  assert.equal(workflowDisplayName(w), "ai-coder-trigger.yml");
  assert.equal(workflowDisplayName(w, ""), "ai-coder-trigger.yml");
  assert.equal(workflowDisplayName(w, "   "), "ai-coder-trigger.yml");
});

// ---------- branch-run muting ----------

test("isMutedRun: the latest run itself keeps its status colour", () => {
  const latest = makeRun(3, "main", "success", "2026-11-21T03:00:00Z");
  assert.equal(isMutedRun(latest, latest), false);
});

test("isMutedRun: branch runs other than the latest are muted", () => {
  const latest = makeRun(3, "main", "success", "2026-11-21T03:00:00Z");
  const staleFailure = makeRun(1, "fix/old-branch", "failure", "2026-11-21T01:00:00Z");
  assert.equal(isMutedRun(latest, staleFailure), true);
});

test("isMutedRun: unknown latest mutes nothing", () => {
  const run = makeRun(1, "dev", "failure", "2026-11-21T01:00:00Z");
  assert.equal(isMutedRun(undefined, run), false);
});

// ---------- watched entries: workflows and plans (0.2.0) ----------

const planA: WatchedItem = { projectKey: "PROJ", planKey: "PROJ-PLAN", starred: true };
const planB: WatchedItem = { projectKey: "PROJ", planKey: "PROJ-OTHER" };
const wfA: WatchedItem = { owner: "me", repo: "app", workflow: "ci.yml", starred: true };

test("isPlanEntry / sameItem: shape decides identity", () => {
  assert.equal(isPlanEntry(planA), true);
  assert.equal(isPlanEntry(wfA), false);
  assert.equal(sameItem(planA, { projectKey: "PROJ", planKey: "PROJ-PLAN" }), true);
  assert.equal(sameItem(planA, { projectKey: "OTHER", planKey: "PROJ-PLAN" }), false);
  assert.equal(sameItem(planA, planB), false);
  assert.equal(sameItem(wfA, { owner: "me", repo: "app", workflow: "ci.yml" }), true);
  assert.equal(sameItem(wfA, planA), false);
});

test("itemKey: workflow keys keep the established format; plan keys are distinct", () => {
  assert.equal(itemKey("acc", wfA), workflowKey("acc", { owner: "me", repo: "app", workflow: "ci.yml" }));
  assert.equal(itemKey("acc", planA), "acc:plan:PROJ-PLAN");
});

test("planDisplayName: server name wins, plan key is the fallback", () => {
  assert.equal(planDisplayName(planA, "My Plan"), "My Plan");
  assert.equal(planDisplayName(planA, undefined), "PROJ-PLAN");
  assert.equal(planDisplayName(planA, "  "), "PROJ-PLAN");
});

test("visibleGroups: entries of the other kind are inert", () => {
  const groups: GroupConfig[] = [
    { id: "g1", name: "g", accountId: "acc", workflows: [wfA, planA] },
  ];
  const states = new Map<string, WorkflowState>();
  const logins = new Map<string, string | undefined>();
  const gh = visibleGroups(groups, "acc", states, logins, "all", "all", "github");
  assert.deepEqual(gh[0].workflows, [wfA]);
  const bb = visibleGroups(groups, "acc", states, logins, "all", "all", "bamboo");
  assert.deepEqual(bb[0].workflows, [planA]);
});

// ---------- GitHub Pages two-stage tracking (0.2.0) ----------

test("pagesDeploymentsUrl: deployments API under the repo", () => {
  assert.equal(
    pagesDeploymentsUrl("https://api.github.com", "me", "site"),
    "https://api.github.com/repos/me/site/pages/deployments",
  );
});

test("normalisePagesStatus: deliverable, error, and everything else deploying", () => {
  assert.equal(normalisePagesStatus("deliverable"), "deliverable");
  assert.equal(normalisePagesStatus("deployment_attempt_error"), "error");
  assert.equal(normalisePagesStatus("error"), "error");
  assert.equal(normalisePagesStatus("in_progress"), "deploying");
  assert.equal(normalisePagesStatus("queued"), "deploying");
});

test("parsePagesDeployment: newest entry wins; unusable payloads keep the old state", () => {
  const parsed = parsePagesDeployment([
    { id: 42, status: "in_progress", updated_at: "2026-11-21T09:00:00Z", page_url: "https://me.github.io/site/" },
    { id: 41, status: "deliverable", updated_at: "2026-11-20T09:00:00Z", page_url: "https://me.github.io/site/" },
  ]);
  assert.deepEqual(parsed, {
    status: "deploying",
    rawStatus: "in_progress",
    deploymentId: 42,
    updatedAt: "2026-11-21T09:00:00Z",
    pageUrl: "https://me.github.io/site/",
  });
  assert.equal(parsePagesDeployment([]), undefined);
  assert.equal(parsePagesDeployment({}), undefined);
  assert.equal(parsePagesDeployment([{ id: 1 }]), undefined);
  assert.equal(parsePagesDeployment(null), undefined);
});

// ---------- drag reorder (0.2.0) ----------

function reorderGroups(): GroupConfig[] {
  return [
    { id: "g1", name: "one", accountId: "acc", workflows: [wfA, planB] },
    { id: "g2", name: "two", accountId: "acc", workflows: [] },
    { id: "g3", name: "three", accountId: "other", workflows: [] },
  ];
}

test("moveWatchedItem: reorder within a group, insert-before honoured", () => {
  const groups = reorderGroups();
  assert.equal(moveWatchedItem(groups, "g1", planB, "g1", wfA), true);
  assert.deepEqual(groups[0].workflows, [planB, wfA]);
});

test("moveWatchedItem: move into another group of the same account", () => {
  const groups = reorderGroups();
  assert.equal(moveWatchedItem(groups, "g1", wfA, "g2"), true);
  assert.deepEqual(groups[0].workflows, [planB]);
  assert.deepEqual(groups[1].workflows, [wfA]);
});

test("moveWatchedItem: cross-account moves are rejected and change nothing", () => {
  const groups = reorderGroups();
  assert.equal(moveWatchedItem(groups, "g1", wfA, "g3"), false);
  assert.deepEqual(groups[0].workflows, [wfA, planB]);
  assert.deepEqual(groups[2].workflows, []);
});

test("moveGroup: reorder groups, missing group is a no-op", () => {
  const groups = reorderGroups();
  assert.equal(moveGroup(groups, "g2", "g1"), true);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["g2", "g1", "g3"],
  );
  assert.equal(moveGroup(groups, "nope"), false);
});
