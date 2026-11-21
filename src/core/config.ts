import type { AccountConfig, AppConfig, GroupConfig, WatchedItem, WatchedPlan, WatchedWorkflow } from "./types";
import { sanitiseBaseUrl } from "./url";

/**
 * Pure validation of the stored configuration. settings.json is user
 * editable, so readConfig runs everything through here: a malformed
 * entry is coerced or dropped element-wise instead of throwing later
 * (in a display-name helper, in the tree) or blanking the whole board.
 */

/** Read-time caps: a hand-edited config cannot grow the board without bound. */
export const MAX_ACCOUNTS = 50;
export const MAX_GROUPS = 100;
export const MAX_WATCHED_ITEMS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitiseItem(raw: unknown): WatchedItem | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  if (typeof raw.planKey === "string") {
    // Bamboo plan entry: both keys are required.
    if (typeof raw.projectKey !== "string") {
      return undefined;
    }
    const item: WatchedPlan = { projectKey: raw.projectKey, planKey: raw.planKey };
    if (typeof raw.starred === "boolean") {
      item.starred = raw.starred;
    }
    return item;
  }
  if (typeof raw.owner === "string" && typeof raw.repo === "string" && typeof raw.workflow === "string") {
    const item: WatchedWorkflow = { owner: raw.owner, repo: raw.repo, workflow: raw.workflow };
    if (typeof raw.starred === "boolean") {
      item.starred = raw.starred;
    }
    return item;
  }
  return undefined;
}

export function sanitiseConfig(raw: unknown): AppConfig {
  const root = isRecord(raw) ? raw : {};
  const rawAccounts = Array.isArray(root.accounts) ? root.accounts : [];
  const accounts: AccountConfig[] = [];
  const seenAccountIds = new Set<string>();
  for (const entry of rawAccounts) {
    if (accounts.length >= MAX_ACCOUNTS) {
      break;
    }
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "") {
      continue;
    }
    // Duplicate account ids: the first entry wins; later ones are dropped.
    if (seenAccountIds.has(entry.id)) {
      continue;
    }
    seenAccountIds.add(entry.id);
    const account: AccountConfig = {
      id: entry.id,
      name: asString(entry.name),
      baseUrl: sanitiseBaseUrl(entry.baseUrl),
    };
    if (entry.kind === "bamboo" || entry.kind === "github") {
      account.kind = entry.kind;
    }
    accounts.push(account);
  }
  const rawGroups = Array.isArray(root.groups) ? root.groups : [];
  const groups: GroupConfig[] = [];
  let itemBudget = MAX_WATCHED_ITEMS;
  for (const entry of rawGroups) {
    if (groups.length >= MAX_GROUPS) {
      break;
    }
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "" || typeof entry.accountId !== "string") {
      continue;
    }
    const rawItems = Array.isArray(entry.workflows) ? entry.workflows : [];
    const workflows: WatchedItem[] = [];
    for (const rawItem of rawItems) {
      if (itemBudget <= 0) {
        break;
      }
      const item = sanitiseItem(rawItem);
      if (item) {
        workflows.push(item);
        itemBudget--;
      }
    }
    groups.push({ id: entry.id, name: asString(entry.name), accountId: entry.accountId, workflows });
  }
  return { accounts, groups };
}

/**
 * Clamp a polling interval read from settings: anything that is not a
 * finite number falls back to the default; numbers are clamped at both
 * ends so a hand-edited settings.json can neither spin the poller nor
 * park it for a day.
 */
export function clampIntervalSeconds(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** Validate the notification scope; unknown values read as "all". */
export function toNotificationScope(value: unknown): "all" | "mine" | "starred" {
  return value === "mine" || value === "starred" ? value : "all";
}
