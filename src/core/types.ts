/** Shared types for ActionsBoard-Duo. Pure data — no vscode dependency. */

/** Normalised status used everywhere in the UI. */
export type RunStatus = "success" | "failure" | "running" | "other";

/** The CI service an account connects to. */
export type AccountKind = "github" | "bamboo";

/** One registered CI connection (a "server"). The PAT itself is never here. */
export interface AccountConfig {
  id: string;
  name: string;
  /**
   * API base URL. For GitHub: https://api.github.com or
   * https://<host>/api/v3 for GHES. For Bamboo: the server base URL
   * (the REST API lives under <baseUrl>/rest/api/latest).
   */
  baseUrl: string;
  /** CI service kind. Absent means "github" (settings written before 0.2.0). */
  kind?: AccountKind;
}

/** The account's CI service kind; absent kind defaults to GitHub. */
export function accountKind(account: AccountConfig): AccountKind {
  return account.kind === "bamboo" ? "bamboo" : "github";
}

/** A workflow watched inside a group (GitHub accounts). */
export interface WatchedWorkflow {
  owner: string;
  repo: string;
  /** Workflow file name (e.g. "ci.yml") or numeric workflow id as a string. */
  workflow: string;
  starred?: boolean;
}

/** A plan watched inside a group (Bamboo accounts). */
export interface WatchedPlan {
  projectKey: string;
  /** Full plan key as Bamboo names it, e.g. "PROJ-PLAN". */
  planKey: string;
  starred?: boolean;
}

/**
 * One watched entry in a group. The shape follows the group's account
 * kind: WatchedWorkflow for GitHub accounts, WatchedPlan for Bamboo
 * accounts. Entries whose shape does not match the account kind are
 * inert — they stay in the settings but are never polled or shown.
 */
export type WatchedItem = WatchedWorkflow | WatchedPlan;

/** Type guard: is this entry a Bamboo plan entry? */
export function isPlanEntry(item: WatchedItem): item is WatchedPlan {
  return typeof (item as WatchedPlan).planKey === "string";
}

/** Identity comparison for watched entries (used by starring and drag & drop). */
export function sameItem(a: WatchedItem, b: WatchedItem): boolean {
  if (isPlanEntry(a) || isPlanEntry(b)) {
    return isPlanEntry(a) && isPlanEntry(b) && a.projectKey === b.projectKey && a.planKey === b.planKey;
  }
  return a.owner === b.owner && a.repo === b.repo && a.workflow === b.workflow;
}

/** A named bundle of watched workflows, bound to one account. */
export interface GroupConfig {
  id: string;
  name: string;
  accountId: string;
  workflows: WatchedItem[];
}

export interface AppConfig {
  accounts: AccountConfig[];
  groups: GroupConfig[];
}

/** One workflow run, normalised. */
export interface RunInfo {
  id: number;
  /** Bamboo result key (e.g. "PROJ-PLAN-123"); undefined for GitHub runs. */
  key?: string;
  name: string;
  branch: string;
  status: RunStatus;
  /** Raw GitHub status: queued / in_progress / completed / waiting / ... */
  rawStatus: string;
  conclusion: string | null;
  actorLogin: string;
  title: string;
  event: string;
  runNumber: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/** One job inside a run. */
export interface JobInfo {
  id: number;
  name: string;
  status: RunStatus;
  rawStatus: string;
  conclusion: string | null;
  /** Name of the first failed step, when the job failed. */
  failedStep?: string;
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Runtime state for one Bamboo branch plan, nested under its master
 * plan's WorkflowState. Mirrors the master's run fields so the tree
 * can render a branch exactly like a plan, one level down.
 */
export interface PlanBranchState {
  /** The branch plan's own plan key. */
  planKey: string;
  /** Display name (the VCS branch name when known). */
  name: string;
  /** Newest builds first, as returned by the API (capped). */
  runs: RunInfo[];
  /** The newest build, if any. */
  latest?: RunInfo;
  /** Jobs fetched lazily per run id, within this branch. */
  jobsByRun: Record<number, JobInfo[]>;
}

/** Runtime state for one watched workflow. */
export interface WorkflowState {
  /** accountId + owner/repo/workflow */
  key: string;
  /** Newest runs first, as returned by the API (capped). */
  runs: RunInfo[];
  /** Newest run per branch, ordered failure → running → other → success. */
  branchRuns: RunInfo[];
  /** The newest run overall, if any. */
  latest?: RunInfo;
  /**
   * The workflow's own name on GitHub, captured from the list-runs
   * payload while polling. Undefined until the first successful fetch
   * that returned at least one run; preserved across later polls that
   * return no runs.
   */
  workflowName?: string;
  /**
   * The plan's name on Bamboo, captured from the results payload while
   * polling (the `plan.name` of a result). Same lifecycle as workflowName.
   */
  planName?: string;
  /**
   * Bamboo only: the plan's branch plans and their builds, polled
   * alongside the master plan. Undefined until the first poll that
   * could fetch the branch list; empty when the plan has no branches.
   */
  branches?: PlanBranchState[];
  /** Jobs fetched lazily per run id. */
  jobsByRun: Record<number, JobInfo[]>;
  /** Last fetch error message, if the last fetch failed at workflow level. */
  error?: string;
  fetchedAt?: number;
}

/** Liveness of one account (server). The three states are kept distinct. */
export type LivenessState = "reachable" | "authError" | "unreachable";

export interface AccountHealth {
  state: LivenessState;
  /** When the state last changed (epoch ms). */
  since: number;
  /** Last time the server answered normally (epoch ms). */
  lastOkAt?: number;
  /** When the server came back after an outage (epoch ms); drives the 復旧 marker. */
  recoveredAt?: number;
  /** Own login on this account, once fetched. */
  login?: string;
}

export type ScopeFilter = "all" | "mine" | "starred";
export type DisplayMode = "all" | "starred";

export function workflowKey(accountId: string, w: WatchedWorkflow): string {
  return `${accountId}:${w.owner}/${w.repo}/${w.workflow}`;
}

/** State-map key for any watched entry, whatever the account kind. */
export function itemKey(accountId: string, item: WatchedItem): string {
  if (isPlanEntry(item)) {
    return `${accountId}:plan:${item.planKey}`;
  }
  return workflowKey(accountId, item);
}

/**
 * Label for a watched workflow: the workflow's own name once it is
 * known (captured while polling), otherwise the workflow file name —
 * the only label available before the first successful fetch.
 */
export function workflowDisplayName(w: WatchedWorkflow, workflowName?: string): string {
  if (workflowName && workflowName.trim() !== "") {
    return workflowName;
  }
  return w.workflow;
}

/**
 * Tree label for a group: its name, or the caller-supplied localised
 * placeholder when the name is empty or whitespace-only. Display only —
 * the stored name is never rewritten.
 */
export function groupDisplayName(g: GroupConfig, unnamed: string): string {
  return g.name.trim() !== "" ? g.name : unnamed;
}

/**
 * Label for a watched plan: the plan's name on Bamboo once it is known
 * (captured while polling), otherwise the full plan key — the only
 * label available before the first successful fetch.
 */
export function planDisplayName(p: WatchedPlan, planName?: string): string {
  if (planName && planName.trim() !== "") {
    return planName;
  }
  return p.planKey;
}

/** Normalised GitHub Pages deployment state (two-stage tracking). */
export type PagesStatus = "deploying" | "deliverable" | "error";

/**
 * The latest GitHub Pages deployment of one repository, tracked after a
 * watched workflow's run succeeds (mirrors the Chrome edition: the state
 * is per repository, not per workflow).
 */
export interface PagesDeploymentState {
  status: PagesStatus;
  /** Raw status string from the Pages deployments API. */
  rawStatus: string;
  deploymentId: number;
  updatedAt: string;
  pageUrl: string;
}

/** State-map key for a repository's Pages deployment state. */
export function pagesKey(accountId: string, owner: string, repo: string): string {
  return `${accountId}:${owner}/${repo}`;
}
