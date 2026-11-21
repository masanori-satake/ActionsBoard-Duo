import type { JobInfo, RunInfo, RunStatus } from "./types";

/**
 * Pure Bamboo Data Center REST helpers: URL building and response
 * interpretation, following the endpoints and payload shapes documented
 * in the bamboo-dc-analysis skill references (REST base
 * `<server>/rest/api/latest`, Bearer PAT auth, list payloads nested as
 * `plans.plan` / `results.result`).
 * No network and no vscode dependency — the fetch itself is injected by
 * the caller, so everything here is unit-testable.
 */

/** Normalise a user-entered Bamboo server base URL (trim, drop trailing slashes). */
export function normaliseBambooBaseUrl(input: string): string {
  return (input ?? "").trim().replace(/\/+$/, "");
}

function restUrl(baseUrl: string, path: string): string {
  return `${normaliseBambooBaseUrl(baseUrl)}/rest/api/latest/${path}`;
}

/** Instance information — the documented lightweight liveness endpoint. */
export function bambooInfoUrl(baseUrl: string): string {
  return restUrl(baseUrl, "info");
}

/** The authenticated user themselves (documented in the skill's `check`). */
export function bambooCurrentUserUrl(baseUrl: string): string {
  return restUrl(baseUrl, "currentUser");
}

/** One page of the plan list; discovery pages through these (see discoverPlans). */
export const BAMBOO_PLANS_PAGE_SIZE = 500;

/** Discovery gives up after this many plans rather than paging forever. */
export const BAMBOO_PLANS_CAP = 2000;

export function bambooPlansUrl(baseUrl: string, startIndex = 0, maxResults = BAMBOO_PLANS_PAGE_SIZE): string {
  return `${restUrl(baseUrl, "plan")}?expand=plans.plan&max-results=${maxResults}&start-index=${startIndex}`;
}

export function bambooProjectsUrl(baseUrl: string): string {
  return `${restUrl(baseUrl, "project")}?expand=projects.project&max-results=500`;
}

export function bambooResultsUrl(baseUrl: string, planKey: string, maxResults = 10): string {
  return `${restUrl(baseUrl, `result/${encodeURIComponent(planKey)}`)}?expand=results.result&max-results=${maxResults}`;
}

/** One build's detail, with its stages' job results expanded (documented expand path). */
export function bambooResultDetailUrl(baseUrl: string, resultKey: string): string {
  return `${restUrl(baseUrl, `result/${encodeURIComponent(resultKey)}`)}?expand=stages.stage.results.result`;
}

/** The build's (or plan's) page in the Bamboo web UI. */
export function bambooBrowseUrl(baseUrl: string, key: string): string {
  return `${normaliseBambooBaseUrl(baseUrl)}/browse/${encodeURIComponent(key)}`;
}

/**
 * Normalise a Bamboo build state pair into the four board statuses.
 * A build that is still alive (InProgress / Queued / Pending) counts as
 * running whatever its (not yet final) build state says; a finished
 * build is judged by its build state: Successful → success, Failed →
 * failure, anything else (Unknown, …) → other.
 */
export function normaliseBambooStatus(
  buildState: string | null | undefined,
  lifeCycleState: string | null | undefined,
): RunStatus {
  const lc = lifeCycleState ?? "";
  if (lc === "InProgress" || lc === "Queued" || lc === "Pending") {
    return "running";
  }
  switch (buildState ?? "") {
    case "Successful":
      return "success";
    case "Failed":
      return "failure";
    default:
      return "other";
  }
}

/** Bamboo list payloads nest the items; a single item may arrive unwrapped. */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === "object") {
    return [value];
  }
  return [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Trailing number of a result key ("PROJ-PLAN-123" → 123), if any. */
function trailingNumber(key: string): number | undefined {
  const m = /-(\d+)$/.exec(key);
  return m ? Number(m[1]) : undefined;
}

interface RawBambooResult {
  id?: number;
  key?: string;
  buildResultKey?: string;
  number?: number;
  buildNumber?: number;
  resultNumber?: number;
  state?: string;
  buildState?: string;
  lifeCycleState?: string;
  buildStartedTime?: string;
  buildCompletedTime?: string;
  reasonSummary?: string;
  planBranchName?: string;
  branchName?: string;
  branch?: { name?: string } | string;
  link?: { href?: string };
  plan?: { name?: string; key?: string };
}

/**
 * The branch a result belongs to, when the payload carries one. Bamboo
 * plan branches are separate plans, so master-plan result lists rarely
 * carry a branch at all; the candidates are read defensively because
 * the documented shapes do not pin one field name.
 */
function resultBranch(r: RawBambooResult): string {
  if (typeof r.planBranchName === "string" && r.planBranchName !== "") {
    return r.planBranchName;
  }
  if (typeof r.branch === "string" && r.branch !== "") {
    return r.branch;
  }
  if (r.branch && typeof r.branch === "object" && typeof r.branch.name === "string") {
    return r.branch.name;
  }
  if (typeof r.branchName === "string" && r.branchName !== "") {
    return r.branchName;
  }
  return "";
}

/**
 * Parse a plan's result list (`GET /result/{planKey}` with
 * `expand=results.result`) into normalised runs, newest first as the
 * API returns them. Per-build actor information is not part of the
 * documented payload, so actorLogin stays empty: Bamboo builds never
 * carry the "mine" person mark.
 */
export function parseBambooResults(json: unknown, baseUrl: string): RunInfo[] {
  const raw = asArray((json as { results?: { result?: unknown } })?.results?.result);
  const runs: RunInfo[] = [];
  // Results whose id cannot be determined get distinct negative
  // fallback ids: a shared 0 would collide in tree node ids and in the
  // jobsByRun map, merging unrelated builds into one.
  let fallbackSeq = 0;
  for (const item of raw) {
    const r = item as RawBambooResult;
    if (!r || typeof r !== "object") {
      continue;
    }
    const key = str(r.key) || str(r.buildResultKey);
    const buildState = str(r.buildState) || str(r.state);
    const started = str(r.buildStartedTime);
    const completed = str(r.buildCompletedTime);
    runs.push({
      id: num(r.id) ?? trailingNumber(key) ?? --fallbackSeq,
      key: key !== "" ? key : undefined,
      name: str(r.plan?.name),
      branch: resultBranch(r),
      status: normaliseBambooStatus(buildState, r.lifeCycleState),
      rawStatus: str(r.lifeCycleState),
      conclusion: buildState !== "" ? buildState : null,
      actorLogin: "",
      title: str(r.reasonSummary),
      event: "",
      runNumber: num(r.number) ?? num(r.buildNumber) ?? num(r.resultNumber) ?? trailingNumber(key) ?? 0,
      createdAt: started,
      updatedAt: completed !== "" ? completed : started,
      htmlUrl: str(r.link?.href) || (key !== "" ? bambooBrowseUrl(baseUrl, key) : ""),
    });
  }
  return runs;
}

/**
 * The plan's name, taken from the results payload (`plan.name` of a
 * result, when the server includes it). Undefined when the payload has
 * no results or no plan name, so callers can fall back gracefully.
 */
export function parseBambooPlanName(json: unknown): string | undefined {
  const raw = asArray((json as { results?: { result?: unknown } })?.results?.result);
  for (const item of raw) {
    const name = (item as RawBambooResult)?.plan?.name;
    if (typeof name === "string" && name.trim() !== "") {
      return name;
    }
  }
  return undefined;
}

export interface BambooPlanSummary {
  projectKey: string;
  projectName: string;
  /** Full plan key, e.g. "PROJ-PLAN". */
  planKey: string;
  name: string;
  enabled: boolean;
}

interface RawBambooPlan {
  key?: string;
  name?: string;
  shortName?: string;
  projectKey?: string;
  projectName?: string;
  project?: { key?: string; name?: string };
  enabled?: boolean;
}

/**
 * How many plan entries a plan-list payload carries, before parsing
 * drops the unusable ones. Discovery paging compares this against the
 * requested page size to tell a full page (there may be more) from a
 * short one (the list is exhausted).
 */
export function bambooPlanCount(json: unknown): number {
  return asArray((json as { plans?: { plan?: unknown } })?.plans?.plan).length;
}

/** Parse the plan list (`GET /plan` with `expand=plans.plan`), sorted by project then plan key. */
export function parseBambooPlans(json: unknown): BambooPlanSummary[] {
  const raw = asArray((json as { plans?: { plan?: unknown } })?.plans?.plan);
  const out: BambooPlanSummary[] = [];
  for (const item of raw) {
    const p = item as RawBambooPlan;
    if (!p || typeof p !== "object" || typeof p.key !== "string" || p.key === "") {
      continue;
    }
    // Project keys never contain "-", so the plan key's first segment
    // is the project key when the payload does not carry it directly.
    const projectKey = str(p.projectKey) || str(p.project?.key) || p.key.split("-")[0];
    out.push({
      projectKey,
      projectName: str(p.projectName) || str(p.project?.name) || projectKey,
      planKey: p.key,
      name: str(p.name) || str(p.shortName) || p.key,
      enabled: p.enabled !== false,
    });
  }
  // Sorted so the settings form's checklist groups by project no matter
  // what order the server returned.
  out.sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.planKey.localeCompare(b.planKey));
  return out;
}

export interface BambooProjectSummary {
  key: string;
  name: string;
}

/** Parse the project list (`GET /project` with `expand=projects.project`). */
export function parseBambooProjects(json: unknown): BambooProjectSummary[] {
  const raw = asArray((json as { projects?: { project?: unknown } })?.projects?.project);
  const out: BambooProjectSummary[] = [];
  for (const item of raw) {
    const p = item as { key?: string; name?: string };
    if (!p || typeof p !== "object" || typeof p.key !== "string" || p.key === "") {
      continue;
    }
    out.push({ key: p.key, name: str(p.name) || p.key });
  }
  return out;
}

/**
 * The signed-in user's name from `GET /currentUser`. The references use
 * the endpoint (the skill's connection check) but do not pin the exact
 * response shape, so the plausible field names are read defensively.
 */
export function parseBambooCurrentUser(json: unknown): string | undefined {
  const u = json as { name?: unknown; username?: unknown; userName?: unknown; login?: unknown } | null;
  if (!u || typeof u !== "object") {
    return undefined;
  }
  for (const candidate of [u.name, u.username, u.userName, u.login]) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }
  return undefined;
}

interface RawBambooJobResult {
  id?: number;
  key?: string;
  jobKey?: string;
  jobName?: string;
  name?: string;
  state?: string;
  buildState?: string;
  lifeCycleState?: string;
  buildStartedTime?: string;
  buildCompletedTime?: string;
  link?: { href?: string };
}

/** Display name for a job result: its job name when carried, else the job segment of its key. */
function jobName(r: RawBambooJobResult): string {
  if (typeof r.jobName === "string" && r.jobName !== "") {
    return r.jobName;
  }
  if (typeof r.name === "string" && r.name !== "") {
    return r.name;
  }
  const key = str(r.jobKey) || str(r.key);
  if (key === "") {
    return "";
  }
  // Result keys look like PROJECT-PLAN-JOB1-123: the job key sits
  // between the plan key and the trailing build number.
  const parts = key.split("-");
  if (parts.length > 3) {
    return parts.slice(2, -1).join("-");
  }
  return key;
}

/**
 * Parse one build's detail payload (`GET /result/{resultKey}` with
 * `expand=stages.stage.results.result`) into the jobs of its stages,
 * flattened in stage order. Job results carry no step breakdown, so
 * failedStep stays undefined.
 */
export function parseBambooStages(json: unknown): JobInfo[] {
  const stages = asArray((json as { stages?: { stage?: unknown } })?.stages?.stage);
  const jobs: JobInfo[] = [];
  for (const stageItem of stages) {
    const stage = stageItem as { results?: { result?: unknown } };
    for (const item of asArray(stage?.results?.result)) {
      const r = item as RawBambooJobResult;
      if (!r || typeof r !== "object") {
        continue;
      }
      const buildState = str(r.buildState) || str(r.state);
      jobs.push({
        id: num(r.id) ?? trailingNumber(str(r.key)) ?? jobs.length,
        name: jobName(r),
        status: normaliseBambooStatus(buildState, r.lifeCycleState),
        rawStatus: str(r.lifeCycleState),
        conclusion: buildState !== "" ? buildState : null,
        htmlUrl: str(r.link?.href),
        startedAt: str(r.buildStartedTime) || null,
        completedAt: str(r.buildCompletedTime) || null,
      });
    }
  }
  return jobs;
}
