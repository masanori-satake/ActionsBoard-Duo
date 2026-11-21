import { normaliseStatus } from "./status";
import type { JobInfo, PagesDeploymentState, PagesStatus, RunInfo } from "./types";

/**
 * Pure GitHub Actions REST helpers: URL building and response interpretation.
 * No network and no vscode dependency — the fetch itself is injected by the
 * caller, so everything here is unit-testable.
 */

export const DEFAULT_BASE_URL = "https://api.github.com";

/** Normalise a user-entered base URL (trim, drop trailing slashes). */
export function normaliseBaseUrl(input: string): string {
  const trimmed = (input ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_BASE_URL : trimmed;
}

export function userUrl(baseUrl: string): string {
  return `${normaliseBaseUrl(baseUrl)}/user`;
}

export function listWorkflowsUrl(baseUrl: string, owner: string, repo: string): string {
  return `${normaliseBaseUrl(baseUrl)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`;
}

export function listRunsUrl(baseUrl: string, owner: string, repo: string, workflow: string, perPage = 50): string {
  return `${normaliseBaseUrl(baseUrl)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=${perPage}`;
}

export function listJobsUrl(baseUrl: string, owner: string, repo: string, runId: number): string {
  return `${normaliseBaseUrl(baseUrl)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs?per_page=100&filter=all`;
}

export function workflowPageUrl(owner: string, repo: string, workflow: string, webBaseUrl?: string): string {
  const web = webBaseFromApi(normaliseBaseUrl(webBaseUrl ?? DEFAULT_BASE_URL));
  return `${web}/${owner}/${repo}/actions/workflows/${workflow}`;
}

/** Derive the web origin from an API base URL (github.com or GHES). */
export function webBaseFromApi(apiBaseUrl: string): string {
  if (apiBaseUrl === DEFAULT_BASE_URL) {
    return "https://github.com";
  }
  // GHES: https://host/api/v3 -> https://host
  return apiBaseUrl.replace(/\/api\/v3$/, "");
}

export interface WorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface RawWorkflow {
  id?: number;
  name?: string;
  path?: string;
  state?: string;
}

export function parseWorkflows(json: unknown): WorkflowSummary[] {
  const total = (json as { workflows?: RawWorkflow[] })?.workflows;
  if (!Array.isArray(total)) {
    return [];
  }
  return total
    .filter((w) => typeof w?.path === "string")
    .map((w) => ({
      id: typeof w.id === "number" ? w.id : 0,
      name: typeof w.name === "string" ? w.name : (w.path as string),
      path: w.path as string,
      state: typeof w.state === "string" ? w.state : "",
    }));
}

interface RawRun {
  id?: number;
  name?: string;
  head_branch?: string | null;
  status?: string;
  conclusion?: string | null;
  display_title?: string;
  event?: string;
  run_number?: number;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  actor?: { login?: string };
  triggering_actor?: { login?: string };
}

export function parseRuns(json: unknown): RunInfo[] {
  const raw = (json as { workflow_runs?: RawRun[] })?.workflow_runs;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((r) => typeof r?.id === "number")
    .map((r) => ({
      id: r.id as number,
      name: typeof r.name === "string" ? r.name : "",
      branch: typeof r.head_branch === "string" ? r.head_branch : "",
      status: normaliseStatus(r.status, r.conclusion),
      rawStatus: typeof r.status === "string" ? r.status : "",
      conclusion: typeof r.conclusion === "string" ? r.conclusion : null,
      actorLogin: r.triggering_actor?.login ?? r.actor?.login ?? "",
      title: typeof r.display_title === "string" ? r.display_title : "",
      event: typeof r.event === "string" ? r.event : "",
      runNumber: typeof r.run_number === "number" ? r.run_number : 0,
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : "",
      htmlUrl: typeof r.html_url === "string" ? r.html_url : "",
    }));
}

/**
 * The workflow's own name (`name:` in the workflow file, as reported by
 * GitHub), taken from the list-runs payload. Every run in the response
 * belongs to the same workflow, so the first (most recent) run item
 * carries it. Returns undefined when the payload has no runs or the
 * name is missing/blank, so callers can fall back gracefully.
 */
export function parseWorkflowName(json: unknown): string | undefined {
  const raw = (json as { workflow_runs?: RawRun[] })?.workflow_runs;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  for (const r of raw) {
    if (typeof r?.name === "string" && r.name.trim() !== "") {
      return r.name;
    }
  }
  return undefined;
}

interface RawStep {
  name?: string;
  status?: string;
  conclusion?: string | null;
  number?: number;
}

interface RawJob {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  started_at?: string | null;
  completed_at?: string | null;
  steps?: RawStep[];
}

export function parseJobs(json: unknown): JobInfo[] {
  const raw = (json as { jobs?: RawJob[] })?.jobs;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((j) => typeof j?.id === "number")
    .map((j) => {
      const failedStep = Array.isArray(j.steps)
        ? j.steps.find((s) => (s.conclusion ?? "") === "failure" || (s.conclusion ?? "") === "timed_out")?.name
        : undefined;
      return {
        id: j.id as number,
        name: typeof j.name === "string" ? j.name : "",
        status: normaliseStatus(j.status, j.conclusion),
        rawStatus: typeof j.status === "string" ? j.status : "",
        conclusion: typeof j.conclusion === "string" ? j.conclusion : null,
        failedStep,
        htmlUrl: typeof j.html_url === "string" ? j.html_url : "",
        startedAt: typeof j.started_at === "string" ? j.started_at : null,
        completedAt: typeof j.completed_at === "string" ? j.completed_at : null,
      };
    });
}


/** The repository's GitHub Pages deployments (two-stage tracking, stage 2). */
export function pagesDeploymentsUrl(baseUrl: string, owner: string, repo: string): string {
  return `${normaliseBaseUrl(baseUrl)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pages/deployments`;
}

/**
 * Normalise a Pages deployment status. The deployments API reports
 * `deliverable` once the site is live; error statuses (e.g.
 * `deployment_attempt_error`) count as failure; anything else
 * (queued / in progress / …) is still deploying. The Chrome edition
 * only distinguished deliverable from everything else — the failure
 * case is split out here so a broken deployment does not read as
 * "still working on it" forever.
 */
export function normalisePagesStatus(rawStatus: string): PagesStatus {
  const s = (rawStatus ?? "").toLowerCase();
  if (s === "deliverable") {
    return "deliverable";
  }
  if (s.includes("error")) {
    return "error";
  }
  return "deploying";
}

interface RawPagesDeployment {
  id?: number;
  status?: string;
  updated_at?: string;
  page_url?: string;
}

/**
 * Parse the Pages deployments list: the first entry is the newest
 * deployment. Returns undefined when the payload is not a non-empty
 * array or the newest entry carries no status, so callers keep the
 * previously known state (the Chrome edition's behaviour on a failed
 * or empty fetch).
 */
export function parsePagesDeployment(json: unknown): PagesDeploymentState | undefined {
  if (!Array.isArray(json) || json.length === 0) {
    return undefined;
  }
  const d = json[0] as RawPagesDeployment;
  if (!d || typeof d.status !== "string" || d.status === "") {
    return undefined;
  }
  return {
    status: normalisePagesStatus(d.status),
    rawStatus: d.status,
    deploymentId: typeof d.id === "number" ? d.id : 0,
    updatedAt: typeof d.updated_at === "string" ? d.updated_at : "",
    pageUrl: typeof d.page_url === "string" ? d.page_url : "",
  };
}
