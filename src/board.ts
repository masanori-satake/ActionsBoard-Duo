import * as vscode from "vscode";
import {
  listJobsUrl,
  listRunsUrl,
  listWorkflowsUrl,
  normaliseBaseUrl,
  parseJobs,
  parseRuns,
  parseWorkflows,
  parseWorkflowName,
  userUrl,
  type WorkflowSummary,
} from "./core/github";
import { classifyProbe, livenessTransition } from "./core/liveness";
import { isFreshFailure, selectBranchRuns } from "./core/model";
import type {
  AccountConfig,
  AccountHealth,
  AppConfig,
  JobInfo,
  WatchedWorkflow,
  WorkflowState,
} from "./core/types";
import { workflowDisplayName, workflowKey } from "./core/types";
import { t } from "./i18n";
import { fetchJson } from "./net";
import { readConfig, readHealth, readSettings, TokenStore, writeHealth } from "./store";

/**
 * The board engine: build polling, liveness probing, state and notifications.
 * Timers: build polling adapts to view visibility (30 s visible / 300 s
 * hidden by default); liveness runs on its own separate cycle.
 */
export class Board implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  config: AppConfig = { accounts: [], groups: [] };
  readonly states = new Map<string, WorkflowState>();
  readonly health = new Map<string, AccountHealth>();

  private buildTimer: NodeJS.Timeout | undefined;
  private livenessTimer: NodeJS.Timeout | undefined;
  private viewVisible = false;
  private polling = false;
  private probing = false;
  private saveInProgress = false;
  private disposed = false;

  constructor(
    private readonly globalState: vscode.Memento,
    readonly tokens: TokenStore,
  ) {
    this.config = readConfig();
    for (const [id, h] of readHealth(globalState)) {
      this.health.set(id, h);
    }
  }

  /**
   * Marks a settings-form save as in progress (see endSave). While a save
   * is running, reloadConfig still refreshes config, timers and the tree,
   * but does not fire its immediate poll/probe: the configuration writes
   * land one by one and the token writes may not have completed yet, so an
   * early check could run with a stale token and persist a bogus authError.
   * The save handler runs the single first check itself once every write
   * has landed.
   */
  beginSave(): void {
    this.saveInProgress = true;
  }

  /** Clears the mark set by beginSave. Always call from a finally block. */
  endSave(): void {
    this.saveInProgress = false;
  }

  reloadConfig(): void {
    this.config = readConfig();
    this.restartTimers();
    this._onDidChange.fire();
    if (!this.saveInProgress) {
      void this.pollAll();
      void this.probeAll();
    }
  }

  setViewVisible(visible: boolean): void {
    if (this.viewVisible === visible) {
      return;
    }
    this.viewVisible = visible;
    this.restartTimers();
    if (visible) {
      void this.pollAll();
    }
  }

  start(): void {
    this.restartTimers();
    void this.probeAll().then(() => this.pollAll());
  }

  private restartTimers(): void {
    if (this.disposed) {
      return;
    }
    const settings = readSettings();
    if (this.buildTimer) {
      clearInterval(this.buildTimer);
    }
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
    }
    const buildMs = (this.viewVisible ? settings.pollVisibleSec : settings.pollHiddenSec) * 1000;
    this.buildTimer = setInterval(() => void this.pollAll(), buildMs);
    this.livenessTimer = setInterval(() => void this.probeAll(), settings.livenessSec * 1000);
  }

  account(id: string): AccountConfig | undefined {
    return this.config.accounts.find((a) => a.id === id);
  }

  loginOf(accountId: string): string | undefined {
    return this.health.get(accountId)?.login;
  }

  // ---------- GitHub helpers ----------

  private async api(account: AccountConfig, url: string): Promise<{ status: number; json: unknown }> {
    const token = await this.tokens.get(account.id);
    return fetchJson(url, token);
  }

  /** Connection test: returns the own login. Throws on failure. */
  async testAccount(baseUrl: string, token: string | undefined): Promise<string> {
    const res = await fetchJson(userUrl(normaliseBaseUrl(baseUrl)), token);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HTTP ${res.status} (auth)`);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    const login = (res.json as { login?: string })?.login;
    if (!login) {
      throw new Error("no login in response");
    }
    return login;
  }

  async discoverWorkflows(account: AccountConfig, owner: string, repo: string): Promise<WorkflowSummary[]> {
    const res = await this.api(account, listWorkflowsUrl(account.baseUrl, owner, repo));
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    return parseWorkflows(res.json);
  }

  // ---------- Liveness ----------

  async probeAll(): Promise<void> {
    if (this.probing || this.disposed) {
      return;
    }
    this.probing = true;
    try {
      const settings = readSettings();
      for (const account of this.config.accounts) {
        const prev = this.health.get(account.id);
        let status: number | null = null;
        let networkFailed = false;
        let login: string | undefined;
        try {
          const res = await this.api(account, userUrl(account.baseUrl));
          status = res.status;
          if (status >= 200 && status < 300) {
            login = (res.json as { login?: string })?.login;
          }
        } catch {
          networkFailed = true;
        }
        const next = classifyProbe(status, networkFailed);
        const transition = livenessTransition(prev?.state, next);
        const now = Date.now();
        const health: AccountHealth = {
          state: next,
          since: prev && prev.state === next ? prev.since : now,
          lastOkAt: next === "reachable" ? now : prev?.lastOkAt,
          recoveredAt: transition.recovered ? now : prev?.recoveredAt,
          login: login ?? prev?.login,
        };
        if (next !== "reachable") {
          health.recoveredAt = prev?.recoveredAt;
        }
        this.health.set(account.id, health);
        if (transition.becameUnreachable && settings.notifyOnOutage) {
          void vscode.window.showWarningMessage(t("notify.outage", account.name));
        }
        if (transition.recovered && settings.notifyOnRecovery) {
          void vscode.window.showInformationMessage(t("notify.recovery", account.name));
        }
        if (transition.authChanged && next === "authError" && settings.notifyOnOutage) {
          void vscode.window.showWarningMessage(t("notify.authError", account.name));
        }
      }
      await writeHealth(this.globalState, this.health);
      this._onDidChange.fire();
    } finally {
      this.probing = false;
    }
  }

  // ---------- Build polling ----------

  async pollAll(): Promise<void> {
    if (this.polling || this.disposed) {
      return;
    }
    this.polling = true;
    try {
      // Dedupe: the same workflow watched in several groups is fetched once.
      const jobs = new Map<string, { account: AccountConfig; w: WatchedWorkflow }>();
      for (const group of this.config.groups) {
        const account = this.account(group.accountId);
        if (!account) {
          continue;
        }
        const h = this.health.get(account.id);
        if (h && h.state === "unreachable") {
          continue; // Do not hammer a server that is down; liveness owns it.
        }
        for (const w of group.workflows) {
          jobs.set(workflowKey(account.id, w), { account, w });
        }
      }
      const settings = readSettings();
      for (const [key, { account, w }] of jobs) {
        const prev = this.states.get(key);
        try {
          const res = await this.api(account, listRunsUrl(account.baseUrl, w.owner, w.repo, w.workflow));
          if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status}`);
          }
          const runs = parseRuns(res.json);
          const next: WorkflowState = {
            key,
            runs,
            branchRuns: selectBranchRuns(runs),
            latest: runs[0],
            // A poll that returns no runs must not erase the name an
            // earlier poll captured.
            workflowName: parseWorkflowName(res.json) ?? prev?.workflowName,
            jobsByRun: prev?.jobsByRun ?? {},
            fetchedAt: Date.now(),
          };
          this.states.set(key, next);
          if (prev && isFreshFailure(prev, next) && settings.notifyOnFailure && this.failureInScope(account, w, next)) {
            const latest = next.latest!;
            const open = t("notify.openRun");
            void vscode.window
              .showWarningMessage(t("notify.failure", workflowDisplayName(w, next.workflowName), `${w.owner}/${w.repo}`), open)
              .then((choice) => {
                if (choice === open && latest.htmlUrl) {
                  void vscode.env.openExternal(vscode.Uri.parse(latest.htmlUrl));
                }
              });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.states.set(key, {
            key,
            runs: prev?.runs ?? [],
            branchRuns: prev?.branchRuns ?? [],
            latest: prev?.latest,
            workflowName: prev?.workflowName,
            jobsByRun: prev?.jobsByRun ?? {},
            error: message,
            fetchedAt: prev?.fetchedAt,
          });
        }
      }
      this._onDidChange.fire();
    } finally {
      this.polling = false;
    }
  }

  private failureInScope(account: AccountConfig, w: WatchedWorkflow, state: WorkflowState): boolean {
    const scope = readSettings().notificationScope;
    switch (scope) {
      case "all":
        return true;
      case "starred":
        return this.config.groups.some(
          (g) =>
            g.accountId === account.id &&
            g.workflows.some(
              (x) => x.owner === w.owner && x.repo === w.repo && x.workflow === w.workflow && x.starred,
            ),
        );
      case "mine":
        return state.latest?.actorLogin !== undefined && state.latest.actorLogin === this.loginOf(account.id);
    }
  }

  /** Jobs of one run, fetched lazily when the run node is expanded. */
  async fetchJobs(account: AccountConfig, w: WatchedWorkflow, runId: number): Promise<JobInfo[]> {
    const key = workflowKey(account.id, w);
    const state = this.states.get(key);
    const cached = state?.jobsByRun[runId];
    if (cached) {
      return cached;
    }
    const res = await this.api(account, listJobsUrl(account.baseUrl, w.owner, w.repo, runId));
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    const jobs = parseJobs(res.json);
    if (state) {
      state.jobsByRun[runId] = jobs;
    }
    return jobs;
  }

  dispose(): void {
    this.disposed = true;
    if (this.buildTimer) {
      clearInterval(this.buildTimer);
    }
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
    }
    this._onDidChange.dispose();
  }
}
