import * as vscode from "vscode";
import {
  bambooCurrentUserUrl,
  bambooPlansUrl,
  bambooProjectsUrl,
  bambooResultDetailUrl,
  bambooResultsUrl,
  parseBambooCurrentUser,
  parseBambooPlanName,
  parseBambooPlans,
  parseBambooProjects,
  parseBambooResults,
  parseBambooStages,
  type BambooPlanSummary,
} from "./core/bamboo";
import {
  listJobsUrl,
  listRunsUrl,
  listWorkflowsUrl,
  normaliseBaseUrl,
  pagesDeploymentsUrl,
  parseJobs,
  parsePagesDeployment,
  parseRuns,
  parseWorkflows,
  parseWorkflowName,
  userUrl,
  type WorkflowSummary,
} from "./core/github";
import {
  classifyProbe,
  CONFIRM_PROBE_DELAY_MS,
  decideProbe,
  livenessTransition,
  nextRecoveredAt,
  withoutRecoveryMarker,
} from "./core/liveness";
import { isFreshFailure, selectBranchRuns } from "./core/model";
import type {
  AccountConfig,
  AccountHealth,
  AccountKind,
  AppConfig,
  JobInfo,
  PagesDeploymentState,
  WatchedItem,
  WatchedPlan,
  WatchedWorkflow,
  WorkflowState,
} from "./core/types";
import {
  accountKind,
  isPlanEntry,
  itemKey,
  pagesKey,
  planDisplayName,
  sameItem,
  workflowDisplayName,
} from "./core/types";
import { t } from "./i18n";
import { fetchJson } from "./net";
import { readConfig, readHealth, readSettings, TokenStore, writeHealth } from "./store";

/**
 * The board engine: build polling, liveness probing, state and notifications.
 * Timers: build polling adapts to view visibility (30 s visible / 300 s
 * hidden by default); liveness runs on its own separate cycle.
 * Two CI kinds share the machinery: GitHub (workflows) and Bamboo (plans).
 */
export class Board implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  config: AppConfig = { accounts: [], groups: [] };
  readonly states = new Map<string, WorkflowState>();
  readonly health = new Map<string, AccountHealth>();
  /** Latest GitHub Pages deployment per repository (accountId:owner/repo). */
  readonly pagesStates = new Map<string, PagesDeploymentState>();

  private buildTimer: NodeJS.Timeout | undefined;
  private livenessTimer: NodeJS.Timeout | undefined;
  private confirmTimer: NodeJS.Timeout | undefined;
  /** Consecutive unreachable-classified probes per account (runtime only). */
  private readonly unreachableStreak = new Map<string, number>();
  /**
   * True until the first probe cycle after activation has run. That cycle
   * only establishes the baseline: state is applied and persisted, but no
   * liveness toasts fire — at startup the network path may still be
   * warming up, and a state the user never saw change is not news.
   */
  private baselinePending = true;
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
      // A recovery marker never survives a restart: it is only meaningful
      // for an outage and recovery witnessed within this session.
      this.health.set(id, withoutRecoveryMarker(h));
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

  // ---------- API helpers ----------

  private async api(account: AccountConfig, url: string): Promise<{ status: number; json: unknown }> {
    const token = await this.tokens.get(account.id);
    return fetchJson(url, token, { bamboo: accountKind(account) === "bamboo" });
  }

  /** Connection test: returns the own login / user name. Throws on failure. */
  async testAccount(baseUrl: string, token: string | undefined, kind: AccountKind = "github"): Promise<string> {
    if (kind === "bamboo") {
      const res = await fetchJson(bambooCurrentUserUrl(baseUrl), token, { bamboo: true });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`HTTP ${res.status} (auth)`);
      }
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const name = parseBambooCurrentUser(res.json);
      if (!name) {
        throw new Error("no user name in response");
      }
      return name;
    }
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

  /**
   * Discovery for Bamboo accounts: the server's plan list, with project
   * names enriched from the project list when a plan payload does not
   * carry its project's name. `tokenOverride` covers accounts that are
   * not saved yet (the settings form passes the typed token).
   */
  async discoverPlans(account: AccountConfig, tokenOverride?: string): Promise<BambooPlanSummary[]> {
    const token = tokenOverride ?? (await this.tokens.get(account.id));
    const res = await fetchJson(bambooPlansUrl(account.baseUrl), token, { bamboo: true });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    const plans = parseBambooPlans(res.json);
    try {
      const projRes = await fetchJson(bambooProjectsUrl(account.baseUrl), token, { bamboo: true });
      if (projRes.status >= 200 && projRes.status < 300) {
        const names = new Map(parseBambooProjects(projRes.json).map((p) => [p.key, p.name]));
        for (const plan of plans) {
          const projectName = names.get(plan.projectKey);
          if (projectName && plan.projectName === plan.projectKey) {
            plan.projectName = projectName;
          }
        }
      }
    } catch {
      // Project names only group the checklist; the plans stand on their own.
    }
    return plans;
  }

  // ---------- Liveness ----------

  async probeAll(): Promise<void> {
    if (this.probing || this.disposed) {
      return;
    }
    this.probing = true;
    // The first cycle after activation is the silent baseline (see the
    // baselinePending field): state is applied and persisted, toasts are not.
    const silent = this.baselinePending;
    this.baselinePending = false;
    try {
      const settings = readSettings();
      for (const account of this.config.accounts) {
        const prev = this.health.get(account.id);
        let status: number | null = null;
        let networkFailed = false;
        let login: string | undefined;
        try {
          // One request per account per cycle. GitHub's /user and
          // Bamboo's /currentUser both double as the login source.
          const probeUrl =
            accountKind(account) === "bamboo" ? bambooCurrentUserUrl(account.baseUrl) : userUrl(account.baseUrl);
          const res = await this.api(account, probeUrl);
          status = res.status;
          if (status >= 200 && status < 300) {
            login =
              accountKind(account) === "bamboo"
                ? parseBambooCurrentUser(res.json)
                : (res.json as { login?: string })?.login;
          }
        } catch {
          networkFailed = true;
        }
        const next = classifyProbe(status, networkFailed);
        // A single unreachable result never flips an account into the
        // unreachable state: it is held until a confirmation probe agrees
        // (see decideProbe). While held, the recorded health — and with it
        // the display, the notifications and build polling — is untouched.
        const decision = decideProbe(prev?.state, next, this.unreachableStreak.get(account.id) ?? 0);
        this.unreachableStreak.set(account.id, decision.consecutiveUnreachable);
        if (decision.needsConfirmation) {
          this.scheduleConfirmationProbe();
        }
        if (decision.applyState === undefined) {
          continue;
        }
        const transition = livenessTransition(prev?.state, next);
        const now = Date.now();
        const health: AccountHealth = {
          state: next,
          since: prev && prev.state === next ? prev.since : now,
          lastOkAt: next === "reachable" ? now : prev?.lastOkAt,
          // The baseline cycle is silent about markers as well as toasts:
          // a recovery it applies was not witnessed, so it sets no 復旧
          // marker (see nextRecoveredAt).
          recoveredAt: nextRecoveredAt(transition, prev?.recoveredAt, now, !silent),
          login: login ?? prev?.login,
        };
        this.health.set(account.id, health);
        if (!silent && transition.becameUnreachable && settings.notifyOnOutage) {
          void vscode.window.showWarningMessage(t("notify.outage", account.name));
        }
        if (!silent && transition.recovered && settings.notifyOnRecovery) {
          void vscode.window.showInformationMessage(t("notify.recovery", account.name));
        }
        if (!silent && transition.authChanged && next === "authError" && settings.notifyOnOutage) {
          void vscode.window.showWarningMessage(t("notify.authError", account.name));
        }
      }
      await writeHealth(this.globalState, this.health);
      this._onDidChange.fire();
    } finally {
      this.probing = false;
    }
  }

  /**
   * Schedules the one-shot confirmation probe that decideProbe asked for.
   * Board-level, not per account: probeAll covers every account, so one
   * pending timer is enough no matter how many accounts are being held.
   */
  private scheduleConfirmationProbe(): void {
    if (this.disposed || this.confirmTimer) {
      return;
    }
    this.confirmTimer = setTimeout(() => {
      this.confirmTimer = undefined;
      void this.probeAll();
    }, CONFIRM_PROBE_DELAY_MS);
  }

  // ---------- Build polling ----------

  async pollAll(): Promise<void> {
    if (this.polling || this.disposed) {
      return;
    }
    this.polling = true;
    try {
      // Dedupe: the same entry watched in several groups is fetched once.
      // Entries whose shape does not match the account kind are inert.
      const jobs = new Map<string, { account: AccountConfig; item: WatchedItem }>();
      for (const group of this.config.groups) {
        const account = this.account(group.accountId);
        if (!account) {
          continue;
        }
        const h = this.health.get(account.id);
        if (h && h.state === "unreachable") {
          continue; // Do not hammer a server that is down; liveness owns it.
        }
        for (const item of group.workflows) {
          if (isPlanEntry(item) !== (accountKind(account) === "bamboo")) {
            continue;
          }
          jobs.set(itemKey(account.id, item), { account, item });
        }
      }
      // Repositories whose Pages deployment this cycle should check:
      // the Chrome edition checks a repository's Pages status in a poll
      // cycle only when a watched workflow in it freshly succeeded.
      const pagesRepos = new Map<string, { account: AccountConfig; owner: string; repo: string }>();
      for (const [key, { account, item }] of jobs) {
        if (isPlanEntry(item)) {
          await this.pollPlan(account, item, key);
        } else {
          const next = await this.pollWorkflow(account, item, key);
          if (next?.latest?.status === "success") {
            pagesRepos.set(pagesKey(account.id, item.owner, item.repo), {
              account,
              owner: item.owner,
              repo: item.repo,
            });
          }
        }
      }
      for (const [key, { account, owner, repo }] of pagesRepos) {
        try {
          const res = await this.api(account, pagesDeploymentsUrl(account.baseUrl, owner, repo));
          if (res.status < 200 || res.status >= 300) {
            continue; // Keep the previously known state, like the Chrome edition.
          }
          const parsed = parsePagesDeployment(res.json);
          if (parsed) {
            this.pagesStates.set(key, parsed);
          }
        } catch {
          // A failed Pages check never disturbs the board; the previous
          // state (if any) stays.
        }
      }
      this._onDidChange.fire();
    } finally {
      this.polling = false;
    }
  }

  /** Poll one GitHub workflow. Returns the fresh state, or undefined when the fetch failed. */
  private async pollWorkflow(
    account: AccountConfig,
    w: WatchedWorkflow,
    key: string,
  ): Promise<WorkflowState | undefined> {
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
      this.maybeNotifyFailure(account, w, workflowDisplayName(w, next.workflowName), `${w.owner}/${w.repo}`, prev, next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.states.set(key, {
        key,
        runs: prev?.runs ?? [],
        branchRuns: prev?.branchRuns ?? [],
        latest: prev?.latest,
        workflowName: prev?.workflowName,
        planName: prev?.planName,
        jobsByRun: prev?.jobsByRun ?? {},
        error: message,
        fetchedAt: prev?.fetchedAt,
      });
      return undefined;
    }
  }

  /** Poll one Bamboo plan: its latest result plus the recent results (up to 10). */
  private async pollPlan(account: AccountConfig, plan: WatchedPlan, key: string): Promise<void> {
    const prev = this.states.get(key);
    try {
      const res = await this.api(account, bambooResultsUrl(account.baseUrl, plan.planKey));
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const runs = parseBambooResults(res.json, account.baseUrl);
      const next: WorkflowState = {
        key,
        runs,
        // The tree's run level for a plan is its recent builds as
        // returned (newest first) — not newest-per-branch.
        branchRuns: runs,
        latest: runs[0],
        planName: parseBambooPlanName(res.json) ?? prev?.planName,
        jobsByRun: prev?.jobsByRun ?? {},
        fetchedAt: Date.now(),
      };
      this.states.set(key, next);
      this.maybeNotifyFailure(account, plan, planDisplayName(plan, next.planName), plan.planKey, prev, next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.states.set(key, {
        key,
        runs: prev?.runs ?? [],
        branchRuns: prev?.branchRuns ?? [],
        latest: prev?.latest,
        workflowName: prev?.workflowName,
        planName: prev?.planName,
        jobsByRun: prev?.jobsByRun ?? {},
        error: message,
        fetchedAt: prev?.fetchedAt,
      });
    }
  }

  private maybeNotifyFailure(
    account: AccountConfig,
    item: WatchedItem,
    displayName: string,
    subtitle: string,
    prev: WorkflowState | undefined,
    next: WorkflowState,
  ): void {
    const settings = readSettings();
    if (!prev || !isFreshFailure(prev, next) || !settings.notifyOnFailure || !this.failureInScope(account, item, next)) {
      return;
    }
    const latest = next.latest!;
    const open = t("notify.openRun");
    void vscode.window
      .showWarningMessage(t("notify.failure", displayName, subtitle), open)
      .then((choice) => {
        if (choice === open && latest.htmlUrl) {
          void vscode.env.openExternal(vscode.Uri.parse(latest.htmlUrl));
        }
      });
  }

  private failureInScope(account: AccountConfig, item: WatchedItem, state: WorkflowState): boolean {
    const scope = readSettings().notificationScope;
    switch (scope) {
      case "all":
        return true;
      case "starred":
        return this.config.groups.some(
          (g) => g.accountId === account.id && g.workflows.some((x) => sameItem(x, item) && x.starred),
        );
      case "mine":
        // Bamboo builds carry no actor, so they never match "mine".
        return (
          state.latest?.actorLogin !== undefined &&
          state.latest.actorLogin !== "" &&
          state.latest.actorLogin === this.loginOf(account.id)
        );
    }
  }

  /** Jobs of one run/build, fetched lazily when the run node is expanded. */
  async fetchJobs(account: AccountConfig, item: WatchedItem, runId: number): Promise<JobInfo[]> {
    const key = itemKey(account.id, item);
    const state = this.states.get(key);
    const cached = state?.jobsByRun[runId];
    if (cached) {
      return cached;
    }
    let jobs: JobInfo[];
    if (isPlanEntry(item)) {
      // Bamboo: one lazy request for the build's detail, whose stages
      // carry the job results. Polling never fans out per build.
      const run = state?.runs.find((r) => r.id === runId);
      if (!run?.key) {
        return [];
      }
      const res = await this.api(account, bambooResultDetailUrl(account.baseUrl, run.key));
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      jobs = parseBambooStages(res.json);
    } else {
      const res = await this.api(account, listJobsUrl(account.baseUrl, item.owner, item.repo, runId));
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      jobs = parseJobs(res.json);
    }
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
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
    }
    this._onDidChange.dispose();
  }
}
