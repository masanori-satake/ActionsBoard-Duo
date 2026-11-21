import * as vscode from "vscode";
import type { AccountHealth, AppConfig } from "./core/types";

const SECTION = "actionsBoardDuo";

export function readConfig(): AppConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const accounts = cfg.get<AppConfig["accounts"]>("accounts", []);
  const groups = cfg.get<AppConfig["groups"]>("groups", []);
  return {
    accounts: Array.isArray(accounts) ? accounts : [],
    groups: Array.isArray(groups) ? groups : [],
  };
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  await cfg.update("accounts", config.accounts, vscode.ConfigurationTarget.Global);
  await cfg.update("groups", config.groups, vscode.ConfigurationTarget.Global);
}

export interface BoardSettings {
  pollVisibleSec: number;
  pollHiddenSec: number;
  livenessSec: number;
  notifyOnFailure: boolean;
  notifyOnOutage: boolean;
  notifyOnRecovery: boolean;
  notificationScope: "all" | "mine" | "starred";
}

export function readSettings(): BoardSettings {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    pollVisibleSec: Math.max(10, cfg.get<number>("pollIntervalVisibleSeconds", 30)),
    pollHiddenSec: Math.max(30, cfg.get<number>("pollIntervalHiddenSeconds", 300)),
    livenessSec: Math.max(30, cfg.get<number>("livenessIntervalSeconds", 120)),
    notifyOnFailure: cfg.get<boolean>("notifyOnFailure", true),
    notifyOnOutage: cfg.get<boolean>("notifyOnOutage", true),
    notifyOnRecovery: cfg.get<boolean>("notifyOnRecovery", true),
    notificationScope: cfg.get<"all" | "mine" | "starred">("notificationScope", "all"),
  };
}

export async function writeSettings(patch: Partial<BoardSettings>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const target = vscode.ConfigurationTarget.Global;
  if (patch.pollVisibleSec !== undefined) await cfg.update("pollIntervalVisibleSeconds", patch.pollVisibleSec, target);
  if (patch.pollHiddenSec !== undefined) await cfg.update("pollIntervalHiddenSeconds", patch.pollHiddenSec, target);
  if (patch.livenessSec !== undefined) await cfg.update("livenessIntervalSeconds", patch.livenessSec, target);
  if (patch.notifyOnFailure !== undefined) await cfg.update("notifyOnFailure", patch.notifyOnFailure, target);
  if (patch.notifyOnOutage !== undefined) await cfg.update("notifyOnOutage", patch.notifyOnOutage, target);
  if (patch.notifyOnRecovery !== undefined) await cfg.update("notifyOnRecovery", patch.notifyOnRecovery, target);
  if (patch.notificationScope !== undefined) await cfg.update("notificationScope", patch.notificationScope, target);
}

const patKey = (accountId: string) => `actionsBoardDuo.pat.${accountId}`;

/** PATs live only in SecretStorage, keyed by account id. */
export class TokenStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get(accountId: string): Thenable<string | undefined> {
    return this.secrets.get(patKey(accountId));
  }

  async set(accountId: string, token: string): Promise<void> {
    await this.secrets.store(patKey(accountId), token);
  }

  async delete(accountId: string): Promise<void> {
    await this.secrets.delete(patKey(accountId));
  }
}

const HEALTH_KEY = "actionsBoardDuo.health";

/** Persisted per-account health, so 最終確認 survives restarts. */
export function readHealth(state: vscode.Memento): Map<string, AccountHealth> {
  const raw = state.get<Record<string, AccountHealth>>(HEALTH_KEY, {});
  return new Map(Object.entries(raw));
}

export async function writeHealth(state: vscode.Memento, health: Map<string, AccountHealth>): Promise<void> {
  await state.update(HEALTH_KEY, Object.fromEntries(health));
}
