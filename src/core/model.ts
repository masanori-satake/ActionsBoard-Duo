import { statusRank } from "./status";
import type {
  AccountHealth,
  DisplayMode,
  GroupConfig,
  RunInfo,
  ScopeFilter,
  WatchedWorkflow,
  WorkflowState,
} from "./types";
import { workflowKey } from "./types";

/**
 * Pick the newest run per branch. Input runs are expected newest-first
 * (the GitHub API order); the first run seen for a branch wins.
 * Output order: failures first, then running, other, success; inside one
 * status, the most recently updated first.
 */
export function selectBranchRuns(runs: RunInfo[]): RunInfo[] {
  const byBranch = new Map<string, RunInfo>();
  for (const run of runs) {
    if (!byBranch.has(run.branch)) {
      byBranch.set(run.branch, run);
    }
  }
  return [...byBranch.values()].sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) {
      return rank;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Is this workflow "mine"? Any branch run started by the account's login. */
export function workflowIsMine(state: WorkflowState | undefined, login: string | undefined): boolean {
  if (!state || !login) {
    return false;
  }
  return state.branchRuns.some((r) => r.actorLogin === login);
}

/**
 * Visibility of one workflow under the scope filter and the display mode.
 * The two combine (AND): the starred-only display mode hides unstarred
 * workflows regardless of scope, and the scope filter applies on top.
 */
export function workflowVisible(
  w: WatchedWorkflow,
  state: WorkflowState | undefined,
  login: string | undefined,
  scope: ScopeFilter,
  mode: DisplayMode,
): boolean {
  if (mode === "starred" && !w.starred) {
    return false;
  }
  switch (scope) {
    case "all":
      return true;
    case "starred":
      return w.starred === true;
    case "mine":
      return workflowIsMine(state, login);
  }
}

/** A group with its visible workflows; null when nothing in it is visible. */
export interface VisibleGroup {
  group: GroupConfig;
  workflows: WatchedWorkflow[];
}

export function visibleGroups(
  groups: GroupConfig[],
  accountId: string,
  states: Map<string, WorkflowState>,
  logins: Map<string, string | undefined>,
  scope: ScopeFilter,
  mode: DisplayMode,
): VisibleGroup[] {
  const out: VisibleGroup[] = [];
  for (const group of groups) {
    if (group.accountId !== accountId) {
      continue;
    }
    const login = logins.get(accountId);
    const workflows = group.workflows.filter((w) =>
      workflowVisible(w, states.get(workflowKey(accountId, w)), login, scope, mode),
    );
    if (workflows.length > 0) {
      out.push({ group, workflows });
    }
  }
  return out;
}

export interface StatusBarCounts {
  success: number;
  failure: number;
  running: number;
  /** Unreachable servers, counted per account — never part of `failure`. */
  unreachableServers: number;
  authErrorServers: number;
}

/**
 * Aggregate the status bar counts. The unit is the watched workflow, judged
 * by its newest run overall. Workflows on unreachable or auth-error servers
 * are excluded from the build counts: their old state must not pose as the
 * current state, and an outage is not a build failure.
 */
export function aggregateStatusBar(
  groups: GroupConfig[],
  states: Map<string, WorkflowState>,
  health: Map<string, AccountHealth>,
): StatusBarCounts {
  const counts: StatusBarCounts = { success: 0, failure: 0, running: 0, unreachableServers: 0, authErrorServers: 0 };
  const seenAccounts = new Set<string>();
  for (const [accountId, h] of health) {
    seenAccounts.add(accountId);
    if (h.state === "unreachable") {
      counts.unreachableServers += 1;
    } else if (h.state === "authError") {
      counts.authErrorServers += 1;
    }
  }
  for (const group of groups) {
    const h = health.get(group.accountId);
    if (h && h.state !== "reachable") {
      continue;
    }
    for (const w of group.workflows) {
      const state = states.get(workflowKey(group.accountId, w));
      const latest = state?.latest;
      if (!latest) {
        continue;
      }
      if (latest.status === "success") {
        counts.success += 1;
      } else if (latest.status === "failure") {
        counts.failure += 1;
      } else if (latest.status === "running") {
        counts.running += 1;
      }
    }
  }
  return counts;
}

/**
 * Detect a fresh build failure: the newest run is a failure and it is not
 * the same run that was already known as failing (no double notifications
 * for one run).
 */
export function isFreshFailure(prev: WorkflowState | undefined, next: WorkflowState): boolean {
  if (!prev) {
    return false; // Nothing known before: not "fresh", just already there.
  }
  const latest = next.latest;
  if (!latest || latest.status !== "failure") {
    return false;
  }
  const prevLatest = prev?.latest;
  if (prevLatest && prevLatest.id === latest.id) {
    return false;
  }
  return true;
}
