import type { AccountConfig, AppConfig, GroupConfig, WatchedWorkflow } from "./types";

/**
 * Export/import of the board configuration. Tokens (PATs) are never part of
 * the configuration, so an export can never contain one — that is the point
 * of keeping secrets in SecretStorage only.
 */

export interface ExportFile {
  app: "actionsboard-duo";
  version: 1;
  accounts: AccountConfig[];
  groups: GroupConfig[];
}

export function buildExport(config: AppConfig): ExportFile {
  return {
    app: "actionsboard-duo",
    version: 1,
    accounts: config.accounts.map((a) => ({ id: a.id, name: a.name, baseUrl: a.baseUrl })),
    groups: config.groups.map((g) => ({
      id: g.id,
      name: g.name,
      accountId: g.accountId,
      workflows: g.workflows.map((w) => cleanWorkflow(w)),
    })),
  };
}

function cleanWorkflow(w: WatchedWorkflow): WatchedWorkflow {
  const out: WatchedWorkflow = { owner: w.owner, repo: w.repo, workflow: w.workflow };
  if (w.alias) {
    out.alias = w.alias;
  }
  if (w.starred) {
    out.starred = true;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function cleanString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Parse and validate an imported JSON text. Throws Error with a message. */
export function parseImport(text: string): AppConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("not-json");
  }
  if (!isRecord(json) || !Array.isArray(json.accounts) || !Array.isArray(json.groups)) {
    throw new Error("bad-shape");
  }
  const accounts: AccountConfig[] = [];
  for (const raw of json.accounts) {
    if (!isRecord(raw)) {
      throw new Error("bad-account");
    }
    const id = cleanString(raw.id);
    const name = cleanString(raw.name);
    const baseUrl = cleanString(raw.baseUrl);
    if (!id || !name || !baseUrl) {
      throw new Error("bad-account");
    }
    accounts.push({ id, name, baseUrl });
  }
  const accountIds = new Set(accounts.map((a) => a.id));
  const groups: GroupConfig[] = [];
  for (const raw of json.groups) {
    if (!isRecord(raw) || !Array.isArray(raw.workflows)) {
      throw new Error("bad-group");
    }
    const id = cleanString(raw.id);
    const name = cleanString(raw.name);
    const accountId = cleanString(raw.accountId);
    if (!id || !name || !accountId || !accountIds.has(accountId)) {
      throw new Error("bad-group");
    }
    const workflows: WatchedWorkflow[] = [];
    for (const rawW of raw.workflows) {
      if (!isRecord(rawW)) {
        throw new Error("bad-workflow");
      }
      const owner = cleanString(rawW.owner);
      const repo = cleanString(rawW.repo);
      const workflow = cleanString(rawW.workflow);
      if (!owner || !repo || !workflow) {
        throw new Error("bad-workflow");
      }
      const w: WatchedWorkflow = { owner, repo, workflow };
      const alias = cleanString(rawW.alias);
      if (alias) {
        w.alias = alias;
      }
      if (rawW.starred === true) {
        w.starred = true;
      }
      workflows.push(w);
    }
    groups.push({ id, name, accountId, workflows });
  }
  return { accounts, groups };
}
