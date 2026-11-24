import * as vscode from "vscode";
import {
  bambooCurrentUserUrl,
  bambooPlanBranchesUrl,
  bambooPlanCount,
  bambooPlanDetailUrl,
  bambooPlansUrl,
  bambooProjectsUrl,
  bambooResultDetailUrl,
  bambooResultsUrl,
  BAMBOO_PLANS_CAP,
  BAMBOO_PLANS_PAGE_SIZE,
  parseBambooCurrentUser,
  parseBambooPlanBranches,
  parseBambooPlanJobs,
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
  shouldCheckPages,
  userUrl,
  type PagesCheckRecord,
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
import { mapPool } from "./core/pool";
import { isRateLimited, rateLimitResetAt } from "./core/ratelimit";
import type {
  AccountConfig,
  AccountHealth,
  AccountKind,
  AppConfig,
  JobInfo,
  PagesDeploymentState,
  PlanBranchState,
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
import { fetchJson, type FetchResult } from "./net";
import { openExternalUrl } from "./openUrl";
import { readConfig, readHealth, readSettings, TokenStore, writeHealth } from "./store";

/** Build polling fetches at most this many watched entries at once. */
const POLL_CONCURRENCY = 6;

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
  /** Last Pages check per repository, for the re-check cadence (P2). */
  private readonly pagesChecked = new Map<string, PagesCheckRecord>();
  /** Build polling pauses per account until this time after a 429 (E2). */
  private readonly rateLimitedUntil = new Map<string, number>();

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
    this.pruneToConfig();
    this.restartTimers();
    this._onDidChange.fire();
    if (!this.saveInProgress) {
      void this.pollAll();
      void this.probeAll();
    }
  }

  /**
   * Drop runtime state that belongs to accounts or watched entries the
   * current config no longer has. Without this, a deleted account would
   * leave a phantom 不通/認証エラー in the status bar counts — and in
   * the persisted health, resurrecting on every restart. Health is
   * persisted only after pruning, so what is stored matches the board.
   */
  private pruneToConfig(): void {
    const accountIds = new Set(this.config.accounts.map((a) => a.id));
    for (const id of [...this.health.keys()]) {
      if (!accountIds.has(id)) {
        this.health.delete(id);
      }
    }
    for (const id of [...this.unreachableStreak.keys()]) {
      if (!accountIds.has(id)) {
        this.unreachableStreak.delete(id);
      }
    }
    for (const id of [...this.rateLimitedUntil.keys()]) {
      if (!accountIds.has(id)) {
        this.rateLimitedUntil.delete(id);
      }
    }
    const stateKeys = new Set<string>();
    const pageKeys = new Set<string>();
    for (const group of this.config.groups) {
      for (const item of group.workflows) {
        stateKeys.add(itemKey(group.accountId, item));
        if (!isPlanEntry(item)) {
          pageKeys.add(pagesKey(group.accountId, item.owner, item.repo));
        }
      }
    }
    for (const key of [...this.states.keys()]) {
      if (!stateKeys.has(key)) {
        this.states.delete(key);
      }
    }
    for (const key of [...this.pagesStates.keys()]) {
      if (!pageKeys.has(key)) {
        this.pagesStates.delete(key);
      }
    }
    for (const key of [...this.pagesChecked.keys()]) {
      if (!pageKeys.has(key)) {
        this.pagesChecked.delete(key);
      }
    }
    void writeHealth(this.globalState, this.health);
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

  private async api(account: AccountConfig, url: string): Promise<FetchResult> {
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
   * The plan list is paged with start-index until a short page arrives,
   * up to a hard cap; `truncated` reports that the cap cut the list.
   */
  async discoverPlans(
    account: AccountConfig,
    tokenOverride?: string,
  ): Promise<{ plans: BambooPlanSummary[]; truncated: boolean }> {
    const token = tokenOverride ?? (await this.tokens.get(account.id));
    const plans: BambooPlanSummary[] = [];
    let truncated = false;
    for (let startIndex = 0; ; startIndex += BAMBOO_PLANS_PAGE_SIZE) {
      const res = await fetchJson(bambooPlansUrl(account.baseUrl, startIndex), token, { bamboo: true });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      plans.push(...parseBambooPlans(res.json));
      if (plans.length >= BAMBOO_PLANS_CAP) {
        // The cap is reached; whether the server has more is unknown
        // unless the page was short — a full page at the cap means the
        // list was cut.
        truncated = bambooPlanCount(res.json) >= BAMBOO_PLANS_PAGE_SIZE;
        plans.length = BAMBOO_PLANS_CAP;
        break;
      }
      if (bambooPlanCount(res.json) < BAMBOO_PLANS_PAGE_SIZE) {
        break; // Short page: the list is exhausted.
      }
    }
    // Pages arrive sorted per page; the checklist groups by project, so
    // the accumulated list is sorted as one (same order parseBambooPlans
    // uses).
    plans.sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.planKey.localeCompare(b.planKey));
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
    return { plans, truncated };
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
        if (!silent && transition.authChanged && next === "authError" && settings.notifyOnAuthError) {
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
        if (h && (h.state === "unreachable" || h.state === "authError")) {
          continue; // Do not hammer a server that is down or rejecting the token; liveness owns it.
        }
        if (isRateLimited(this.rateLimitedUntil.get(account.id), Date.now())) {
          continue; // A 429 pause is in effect for this account (liveness still probes it).
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
      const pagesRepos = new Map<string, { account: AccountConfig; owner: string; repo: string; runId: number }>();
      // Bounded concurrency: a long watch list must not fetch strictly
      // one round-trip at a time, nor fan out without limit. Dedupe and
      // the per-account skips happened above, at collection time; each
      // task writes only its own state key, so the resulting states are
      // the same as the serial order's.
      await mapPool([...jobs.entries()], POLL_CONCURRENCY, async ([key, { account, item }]) => {
        if (isPlanEntry(item)) {
          await this.pollPlan(account, item, key);
        } else {
          const next = await this.pollWorkflow(account, item, key);
          if (next?.latest?.status === "success") {
            pagesRepos.set(pagesKey(account.id, item.owner, item.repo), {
              account,
              owner: item.owner,
              repo: item.repo,
              runId: next.latest.id,
            });
          }
        }
      });
      for (const [key, { account, owner, repo, runId }] of pagesRepos) {
        // Cadence: while the newest run is unchanged, re-checking every
        // poll cycle only adds load — a deployment takes minutes. A new
        // run id always checks immediately.
        if (!shouldCheckPages(this.pagesChecked.get(key), runId, Date.now())) {
          continue;
        }
        this.pagesChecked.set(key, { runId, at: Date.now() });
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

  /**
   * Record a build-poll response for rate limiting: a 429 pauses the
   * account's build polling until the server's Retry-After (capped) or,
   * without one, until the next liveness cycle would run. Liveness is
   * unaffected — it keeps probing and classifies 429 as reachable.
   */
  private noteRateLimit(account: AccountConfig, res: FetchResult): void {
    const resetAt = rateLimitResetAt(res.status, res.retryAfterMs, Date.now(), readSettings().livenessSec * 1000);
    if (resetAt !== undefined) {
      this.rateLimitedUntil.set(account.id, resetAt);
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
      this.noteRateLimit(account, res);
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
      this.noteRateLimit(account, res);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const runs = parseBambooResults(res.json, account.baseUrl);
      const branches = await this.pollBranches(account, plan, prev);
      const next: WorkflowState = {
        key,
        runs,
        // The tree's run level for a plan is its recent builds as
        // returned (newest first) — not newest-per-branch.
        branchRuns: runs,
        latest: runs[0],
        planName: parseBambooPlanName(res.json) ?? prev?.planName,
        branches,
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
        branches: prev?.branches,
        jobsByRun: prev?.jobsByRun ?? {},
        error: message,
        fetchedAt: prev?.fetchedAt,
      });
    }
  }

  /**
   * Poll one plan's branch plans: the branch list, then each branch
   * plan's recent builds. Branch trouble never fails the master's
   * poll — a failed list fetch keeps the previous branches (and still
   * refreshes their builds), and a failed branch keeps its previous
   * builds. Failure notifications stay with the master plan; branch
   * states are display-only.
   */
  private async pollBranches(
    account: AccountConfig,
    plan: WatchedPlan,
    prev: WorkflowState | undefined,
  ): Promise<PlanBranchState[]> {
    const prevByKey = new Map((prev?.branches ?? []).map((b) => [b.planKey, b]));
    let summaries: { planKey: string; name: string }[] | undefined;
    try {
      const res = await this.api(account, bambooPlanBranchesUrl(account.baseUrl, plan.planKey));
      if (res.status >= 200 && res.status < 300) {
        summaries = parseBambooPlanBranches(res.json);
      }
    } catch {
      // Keep the previous branch list; its builds are still refreshed below.
    }
    if (!summaries) {
      summaries = (prev?.branches ?? []).map((b) => ({ planKey: b.planKey, name: b.name }));
    }
    return Promise.all(
      summaries.map(async (s): Promise<PlanBranchState> => {
        const prevBranch = prevByKey.get(s.planKey);
        try {
          const res = await this.api(account, bambooResultsUrl(account.baseUrl, s.planKey));
          if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status}`);
          }
          const runs = parseBambooResults(res.json, account.baseUrl);
          // The branch's own builds name their VCS branch; that is the
          // label the branch list could only guess at.
          const branchName = runs[0]?.branch ?? "";
          const name = branchName !== "" ? branchName : s.name;
          return {
            planKey: s.planKey,
            name,
            runs,
            latest: runs[0],
            jobsByRun: prevBranch?.jobsByRun ?? {},
          };
        } catch {
          return (
            prevBranch ?? { planKey: s.planKey, name: s.name, runs: [], latest: undefined, jobsByRun: {} }
          );
        }
      }),
    );
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
        if (choice === open) {
          // The run URL comes from the server; the shared guard only
          // ever opens http/https.
          void openExternalUrl(latest.htmlUrl);
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
    if (isPlanEntry(item)) {
      // Bamboo: one lazy request for the build's detail, whose stages
      // carry the job results. Polling never fans out per build. The
      // build may belong to the master plan or to one of its branch
      // plans; each keeps its own jobs cache.
      let owner: { jobsByRun: Record<number, JobInfo[]>; jobNames?: Record<string, string> } | undefined = state;
      let ownerPlanKey = item.planKey;
      let run = state?.runs.find((r) => r.id === runId);
      if (!run) {
        for (const branch of state?.branches ?? []) {
          const found = branch.runs.find((r) => r.id === runId);
          if (found) {
            run = found;
            owner = branch;
            ownerPlanKey = branch.planKey;
            break;
          }
        }
      }
      const cached = owner?.jobsByRun[runId];
      if (cached) {
        return cached;
      }
      if (!run?.key) {
        return [];
      }
      // Job results often carry no display name, only the job key
      // (JOB1 and friends). The plan definition names its jobs, so
      // fetch it once per plan and resolve names from it. A failure
      // here must never block the jobs themselves: the key-segment
      // fallback still applies.
      if (owner && owner.jobNames === undefined) {
        let names: Record<string, string> = {};
        try {
          const planRes = await this.api(account, bambooPlanDetailUrl(account.baseUrl, ownerPlanKey));
          if (planRes.status >= 200 && planRes.status < 300) {
            names = parseBambooPlanJobs(planRes.json);
          }
        } catch {
          // Keep the empty map: names are an enhancement only.
        }
        owner.jobNames = names;
      }
      const res = await this.api(account, bambooResultDetailUrl(account.baseUrl, run.key));
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}`);
      }
      const jobs = parseBambooStages(res.json, account.baseUrl, owner?.jobNames);
      if (owner) {
        owner.jobsByRun[runId] = jobs;
      }
      return jobs;
    }
    const cached = state?.jobsByRun[runId];
    if (cached) {
      return cached;
    }
    const res = await this.api(account, listJobsUrl(account.baseUrl, item.owner, item.repo, runId));
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
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
    }
    this._onDidChange.dispose();
  }
}
