/** Shared types for ActionsBoard-Duo. Pure data — no vscode dependency. */

/** Normalised status used everywhere in the UI. */
export type RunStatus = "success" | "failure" | "running" | "other";

/** One registered CI connection (a "server"). The PAT itself is never here. */
export interface AccountConfig {
  id: string;
  name: string;
  /** API base URL. https://api.github.com or https://<host>/api/v3 for GHES. */
  baseUrl: string;
}

/** A workflow watched inside a group. */
export interface WatchedWorkflow {
  owner: string;
  repo: string;
  /** Workflow file name (e.g. "ci.yml") or numeric workflow id as a string. */
  workflow: string;
  starred?: boolean;
}

/** A named bundle of watched workflows, bound to one account. */
export interface GroupConfig {
  id: string;
  name: string;
  accountId: string;
  workflows: WatchedWorkflow[];
}

export interface AppConfig {
  accounts: AccountConfig[];
  groups: GroupConfig[];
}

/** One workflow run, normalised. */
export interface RunInfo {
  id: number;
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
