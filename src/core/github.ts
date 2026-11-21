import { normaliseStatus } from "./status";
import type { JobInfo, RunInfo } from "./types";

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

/**
 * Parse a pasted GitHub Actions URL into owner/repo (and workflow file when
 * the URL points at one). Accepts:
 *   https://github.com/<owner>/<repo>
 *   https://github.com/<owner>/<repo>/actions
 *   https://github.com/<owner>/<repo>/actions/workflows/<file>.yml
 *   https://github.com/<owner>/<repo>/actions/runs/<id>
 * Returns null when the URL does not look like a GitHub repository URL.
 */
export function parseActionsUrl(input: string): { owner: string; repo: string; workflow?: string } | null {
  let url: URL;
  try {
    url = new URL((input ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const parts = url.pathname.split("/").filter((p) => p !== "");
  if (parts.length < 2) {
    return null;
  }
  const [owner, repo] = parts;
  if (!owner || !repo) {
    return null;
  }
  let workflow: string | undefined;
  if (parts[2] === "actions" && parts[3] === "workflows" && parts[4]) {
    workflow = decodeURIComponent(parts[4]);
  }
  return { owner, repo, workflow };
}
