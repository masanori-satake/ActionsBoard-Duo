import * as vscode from "vscode";
import { showsRecoveryMarker } from "./core/liveness";
import { visibleGroups, workflowIsMine } from "./core/model";
import { isMutedRun } from "./core/status";
import type {
  AccountConfig,
  DisplayMode,
  GroupConfig,
  JobInfo,
  PagesStatus,
  RunInfo,
  RunStatus,
  ScopeFilter,
  WatchedItem,
} from "./core/types";
import {
  accountKind,
  groupDisplayName,
  isPlanEntry,
  itemKey,
  pagesKey,
  planDisplayName,
  workflowDisplayName,
} from "./core/types";
import { isJa, t } from "./i18n";
import type { Board } from "./board";

export type NodeKind = "account" | "group" | "workflow" | "run" | "job" | "info";

export interface BoardNode {
  kind: NodeKind;
  id: string;
  parent?: BoardNode;
  children?: BoardNode[];
  account?: AccountConfig;
  group?: GroupConfig;
  workflow?: WatchedItem;
  run?: RunInfo;
  /** Row label override (Bamboo builds: branch name, or "#<build number>"). */
  label?: string;
  job?: JobInfo;
  infoText?: string;
  /** Tone for "info" placeholder rows: neutral = no information (gray), warning = a real problem (yellow). */
  infoTone?: "neutral" | "warning";
  jobsLoaded?: boolean;
  /** Job count once the jobs are loaded; null when the jobs fetch failed. */
  jobCount?: number | null;
}

const STATUS_ICON: Record<RunStatus, { icon: string; color: string }> = {
  success: { icon: "pass", color: "charts.green" },
  failure: { icon: "error", color: "charts.red" },
  running: { icon: "sync", color: "charts.blue" },
  other: { icon: "circle-outline", color: "charts.gray" },
};

export function statusText(status: RunStatus): string {
  switch (status) {
    case "success":
      return t("status.success");
    case "failure":
      return t("status.failure");
    case "running":
      return t("status.running");
    case "other":
      return t("status.other");
  }
}

export function formatTime(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) {
    return isJa() ? "たった今" : "just now";
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return isJa() ? `${min}分前` : `${min}m ago`;
  }
  const hour = Math.floor(min / 60);
  if (hour < 24) {
    return isJa() ? `${hour}時間前` : `${hour}h ago`;
  }
  const day = Math.floor(hour / 24);
  return isJa() ? `${day}日前` : `${day}d ago`;
}

/** Short Pages state word for the workflow row suffix and tooltip. */
export function pagesText(status: PagesStatus): string {
  switch (status) {
    case "deliverable":
      return t("pages.deliverable");
    case "deploying":
      return t("pages.deploying");
    case "error":
      return t("pages.error");
  }
}

/** ★ = starred （興味がある）, ♟ = mine （自分の）. Both may appear. */
export function marksFor(starred: boolean, mine: boolean): string {
  const marks: string[] = [];
  if (starred) {
    marks.push("★");
  }
  if (mine) {
    marks.push("♟");
  }
  return marks.join(" ");
}

export class BoardTreeProvider implements vscode.TreeDataProvider<BoardNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BoardNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  scope: ScopeFilter = "all";
  displayMode: DisplayMode = "all";

  private roots: BoardNode[] = [];

  constructor(private readonly board: Board) {}

  refresh(): void {
    this.roots = this.buildRoots();
    this._onDidChangeTreeData.fire();
  }

  private buildRoots(): BoardNode[] {
    const { accounts, groups } = this.board.config;
    if (accounts.length === 0) {
      return [{ kind: "info", id: "info:no-accounts", infoText: t("tree.noAccounts"), infoTone: "neutral" }];
    }
    const logins = new Map<string, string | undefined>();
    for (const a of accounts) {
      logins.set(a.id, this.board.loginOf(a.id));
    }
    const roots: BoardNode[] = [];
    for (const account of accounts) {
      const accountNode: BoardNode = { kind: "account", id: `account:${account.id}`, account };
      const vg = visibleGroups(
        groups,
        account.id,
        this.board.states,
        logins,
        this.scope,
        this.displayMode,
        accountKind(account),
      );
      const groupNodes: BoardNode[] = vg.map(({ group, workflows }) => {
        const groupNode: BoardNode = {
          kind: "group",
          id: `group:${group.id}`,
          group,
          parent: accountNode,
        };
        groupNode.children = workflows.map((w) => this.buildWorkflowNode(account, group, w, groupNode));
        return groupNode;
      });
      accountNode.children = groupNodes;
      roots.push(accountNode);
    }
    if (groups.length > 0 && roots.every((r) => (r.children ?? []).length === 0)) {
      // Accounts exist but the current filter hides everything.
      return roots;
    }
    return roots;
  }

  private buildWorkflowNode(
    account: AccountConfig,
    group: GroupConfig,
    w: WatchedItem,
    parent: BoardNode,
  ): BoardNode {
    const node: BoardNode = {
      kind: "workflow",
      id: `workflow:${itemKey(account.id, w)}`,
      workflow: w,
      account,
      group,
      parent,
    };
    const health = this.board.health.get(account.id);
    if (health?.state === "unreachable") {
      node.children = [];
      return node;
    }
    const state = this.board.states.get(itemKey(account.id, w));
    node.children = (state?.branchRuns ?? []).map((run) => ({
      kind: "run" as const,
      id: `run:${itemKey(account.id, w)}:${run.id}`,
      run,
      workflow: w,
      account,
      group,
      parent: node,
      // Bamboo builds are labelled by branch when the payload carries
      // one, else by build number; GitHub runs use the branch as-is.
      label: isPlanEntry(w) ? (run.branch !== "" ? run.branch : `#${run.runNumber}`) : undefined,
    }));
    return node;
  }

  getTreeItem(node: BoardNode): vscode.TreeItem {
    switch (node.kind) {
      case "info": {
        const item = new vscode.TreeItem(node.infoText ?? "");
        item.contextValue = "info";
        item.iconPath =
          node.infoTone === "warning"
            ? new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.yellow"))
            : new vscode.ThemeIcon("info", new vscode.ThemeColor("charts.gray"));
        return item;
      }
      case "account":
        return this.accountItem(node);
      case "group": {
        const item = new vscode.TreeItem(
          groupDisplayName(node.group!, t("tree.unnamedGroup")),
          (node.children ?? []).length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "group";
        item.iconPath = new vscode.ThemeIcon("folder");
        item.description = `${node.children?.length ?? 0}`;
        return item;
      }
      case "workflow":
        return isPlanEntry(node.workflow!) ? this.planItem(node) : this.workflowItem(node);
      case "run":
        return this.runItem(node);
      case "job": {
        const job = node.job!;
        const item = new vscode.TreeItem(job.name, vscode.TreeItemCollapsibleState.None);
        item.contextValue = "job";
        const s = STATUS_ICON[job.status];
        item.iconPath = new vscode.ThemeIcon(s.icon, new vscode.ThemeColor(s.color));
        // The icon already carries the status; the word lives in the tooltip.
        // The description keeps only the failed step, when there is one.
        const tooltipParts = [statusText(job.status)];
        if (job.failedStep) {
          tooltipParts.push(t("tree.failedStep", job.failedStep));
          item.description = t("tree.failedStep", job.failedStep);
        }
        item.tooltip = `${job.name}\n${tooltipParts.join(" · ")}`;
        if (job.htmlUrl) {
          item.command = { command: "actionsBoardDuo.openRun", title: "", arguments: [job.htmlUrl] };
        }
        return item;
      }
    }
  }

  private accountItem(node: BoardNode): vscode.TreeItem {
    const account = node.account!;
    const health = this.board.health.get(account.id);
    const hasChildren = (node.children ?? []).length > 0;
    const item = new vscode.TreeItem(
      account.name,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.contextValue = "account";
    const parts: string[] = [];
    if (health) {
      if (health.state === "unreachable") {
        item.iconPath = new vscode.ThemeIcon("debug-disconnect", new vscode.ThemeColor("charts.red"));
        parts.push(t("status.unreachable"));
        if (health.lastOkAt) {
          parts.push(t("tree.lastConfirmed", formatTime(health.lastOkAt)));
        }
      } else if (health.state === "authError") {
        item.iconPath = new vscode.ThemeIcon("key", new vscode.ThemeColor("charts.yellow"));
        parts.push(t("status.authError"));
      } else {
        item.iconPath = new vscode.ThemeIcon("server");
        if (showsRecoveryMarker(health.recoveredAt, Date.now())) {
          parts.push(t("status.recovered"));
        }
      }
      if (health.login) {
        parts.push(`@${health.login}`);
      }
    } else {
      item.iconPath = new vscode.ThemeIcon("server");
    }
    item.description = parts.join(" · ");
    item.tooltip = `${account.name}\n${account.baseUrl}${parts.length ? `\n${parts.join(" · ")}` : ""}`;
    return item;
  }

  private workflowItem(node: BoardNode): vscode.TreeItem {
    const w = node.workflow!;
    if (isPlanEntry(w)) {
      return this.planItem(node);
    }
    const account = node.account!;
    const key = itemKey(account.id, w);
    const state = this.board.states.get(key);
    const health = this.board.health.get(account.id);
    const unreachable = health?.state === "unreachable";
    const login = this.board.loginOf(account.id);
    const mine = workflowIsMine(state, login);
    const marks = marksFor(w.starred === true, mine);
    const collapsible = !unreachable && (state?.branchRuns.length ?? 0) > 0;
    const item = new vscode.TreeItem(
      workflowDisplayName(w, state?.workflowName),
      collapsible ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    // The context value carries the star state so the inline action can show
    // an outline star (add) or a filled star (remove) for this row.
    item.contextValue = w.starred === true ? "workflowStarred" : "workflow";
    const parts: string[] = [];
    if (marks) {
      parts.push(marks);
    }
    if (unreachable) {
      item.iconPath = new vscode.ThemeIcon("debug-disconnect", new vscode.ThemeColor("charts.gray"));
      parts.push(t("status.unreachable"));
      if (health?.lastOkAt) {
        parts.push(t("tree.lastConfirmed", formatTime(health.lastOkAt)));
      }
    } else if (state?.error && !state.latest) {
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.yellow"));
      parts.push(t("tree.fetchError"));
    } else if (state?.latest) {
      const s = STATUS_ICON[state.latest.status];
      item.iconPath = new vscode.ThemeIcon(s.icon, new vscode.ThemeColor(s.color));
      // No status word here: the icon says it, and the word is in the tooltip.
      parts.push(state.latest.branch);
      parts.push(relativeTime(state.latest.updatedAt));
    } else {
      item.iconPath = new vscode.ThemeIcon("circle-outline", new vscode.ThemeColor("charts.gray"));
      parts.push(t("tree.noRuns"));
    }
    // Two-stage Pages tracking: while the workflow's newest run is a
    // success, the repository's Pages deployment state rides along as a
    // quiet suffix (the Chrome edition shows the same state as a badge,
    // under the same condition).
    const pages =
      state?.latest?.status === "success"
        ? this.board.pagesStates.get(pagesKey(account.id, w.owner, w.repo))
        : undefined;
    if (pages) {
      parts.push(`🌐 ${pagesText(pages.status)}`);
    }
    item.description = parts.join(" · ");
    const tooltipLines = [
      `${workflowDisplayName(w, state?.workflowName)} — ${w.owner}/${w.repo}`,
      `${w.workflow}`,
    ];
    if (state?.latest) {
      tooltipLines.push(`${statusText(state.latest.status)} · ${state.latest.title}`);
      if (state.latest.actorLogin) {
        tooltipLines.push(`@${state.latest.actorLogin}`);
      }
    }
    if (pages) {
      tooltipLines.push(`GitHub Pages: ${pagesText(pages.status)}${pages.pageUrl ? ` · ${pages.pageUrl}` : ""}`);
    }
    if (state?.error) {
      tooltipLines.push(`${t("tree.fetchError")}: ${state.error}`);
    }
    tooltipLines.push(t("tree.legend"));
    item.tooltip = tooltipLines.join("\n");
    return item;
  }

  private planItem(node: BoardNode): vscode.TreeItem {
    const plan = node.workflow!;
    if (!isPlanEntry(plan)) {
      return this.workflowItem(node);
    }
    const account = node.account!;
    const key = itemKey(account.id, plan);
    const state = this.board.states.get(key);
    const health = this.board.health.get(account.id);
    const unreachable = health?.state === "unreachable";
    // Bamboo builds carry no actor, so the person mark never applies.
    const marks = marksFor(plan.starred === true, false);
    const collapsible = !unreachable && (state?.branchRuns.length ?? 0) > 0;
    const item = new vscode.TreeItem(
      planDisplayName(plan, state?.planName),
      collapsible ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.contextValue = plan.starred === true ? "planStarred" : "plan";
    const parts: string[] = [];
    if (marks) {
      parts.push(marks);
    }
    if (unreachable) {
      item.iconPath = new vscode.ThemeIcon("debug-disconnect", new vscode.ThemeColor("charts.gray"));
      parts.push(t("status.unreachable"));
      if (health?.lastOkAt) {
        parts.push(t("tree.lastConfirmed", formatTime(health.lastOkAt)));
      }
    } else if (state?.error && !state.latest) {
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.yellow"));
      parts.push(t("tree.fetchError"));
    } else if (state?.latest) {
      const s = STATUS_ICON[state.latest.status];
      item.iconPath = new vscode.ThemeIcon(s.icon, new vscode.ThemeColor(s.color));
      parts.push(state.latest.branch !== "" ? state.latest.branch : `#${state.latest.runNumber}`);
      parts.push(relativeTime(state.latest.updatedAt));
    } else {
      item.iconPath = new vscode.ThemeIcon("circle-outline", new vscode.ThemeColor("charts.gray"));
      parts.push(t("tree.noRuns"));
    }
    item.description = parts.join(" · ");
    const tooltipLines = [`${planDisplayName(plan, state?.planName)} — ${plan.projectKey}`, `${plan.planKey}`];
    if (state?.latest) {
      tooltipLines.push(`${statusText(state.latest.status)} · ${state.latest.title}`);
    }
    if (state?.error) {
      tooltipLines.push(`${t("tree.fetchError")}: ${state.error}`);
    }
    tooltipLines.push(t("tree.legend"));
    item.tooltip = tooltipLines.join("\n");
    return item;
  }

  private runItem(node: BoardNode): vscode.TreeItem {
    const run = node.run!;
    const item = new vscode.TreeItem(node.label ?? run.branch, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = "run";
    const s = STATUS_ICON[run.status];
    // Only the workflow's newest run overall carries its status colour;
    // branch runs for other runs keep the glyph but are muted to gray, so a
    // stale failure on a side branch does not read as the current state.
    const state =
      node.account && node.workflow ? this.board.states.get(itemKey(node.account.id, node.workflow)) : undefined;
    const color = isMutedRun(state?.latest, run) ? "charts.gray" : s.color;
    item.iconPath = new vscode.ThemeIcon(s.icon, new vscode.ThemeColor(color));
    const parts: string[] = [];
    if (run.title) {
      parts.push(run.title);
    }
    if (run.actorLogin) {
      parts.push(`@${run.actorLogin}`);
    }
    parts.push(relativeTime(run.updatedAt));
    item.description = parts.join(" · ");
    // The status word moves to the tooltip; the icon carries it in the row.
    item.tooltip = `#${run.runNumber} ${run.title}\n${[statusText(run.status), ...parts].join(" · ")}`;
    return item;
  }

  async getChildren(node?: BoardNode): Promise<BoardNode[]> {
    if (!node) {
      if (this.roots.length === 0) {
        this.roots = this.buildRoots();
      }
      return this.roots;
    }
    if (node.kind === "run") {
      return this.jobChildren(node);
    }
    return node.children ?? [];
  }

  private async jobChildren(node: BoardNode): Promise<BoardNode[]> {
    await this.ensureJobsLoaded(node);
    return node.children ?? [];
  }

  /**
   * Load a run node's jobs if they are not loaded yet — the same lazy
   * fetch the tree performs when a run is expanded by hand — and report
   * how many jobs the run has. Returns null when the fetch failed (the
   * node then holds the fetch-error placeholder instead of job rows).
   * The "failures" expansion uses the count to leave failed runs that
   * have no jobs at all collapsed.
   */
  async ensureJobsLoaded(node: BoardNode): Promise<number | null> {
    if (node.jobsLoaded) {
      return node.jobCount ?? null;
    }
    node.jobsLoaded = true;
    try {
      const jobs = await this.board.fetchJobs(node.account!, node.workflow!, node.run!.id);
      node.jobCount = jobs.length;
      node.children = jobs.map((job) => ({
        kind: "job" as const,
        id: `job:${node.id}:${job.id}`,
        job,
        parent: node,
      }));
      if (node.children.length === 0) {
        node.children = [
          { kind: "info", id: `info:no-jobs:${node.id}`, infoText: t("tree.noJobs"), infoTone: "neutral", parent: node },
        ];
      }
    } catch (err) {
      node.jobCount = null;
      const message = err instanceof Error ? err.message : String(err);
      node.children = [
        {
          kind: "info",
          id: `info:jobs-error:${node.id}`,
          infoText: `${t("tree.fetchError")}: ${message}`,
          infoTone: "warning",
          parent: node,
        },
      ];
    }
    return node.jobCount;
  }

  getParent(node: BoardNode): BoardNode | undefined {
    return node.parent;
  }

  /** All currently built nodes, depth-first. */
  allNodes(): BoardNode[] {
    const out: BoardNode[] = [];
    const walk = (nodes: BoardNode[]) => {
      for (const n of nodes) {
        out.push(n);
        if (n.children) {
          walk(n.children);
        }
      }
    };
    walk(this.roots);
    return out;
  }

  /** Run nodes whose status matches, for the expansion selectors. */
  runNodesWith(statuses: RunStatus[]): BoardNode[] {
    return this.allNodes().filter((n) => n.kind === "run" && n.run && statuses.includes(n.run.status));
  }

  /** Workflow nodes that carry failures anywhere below them. */
  failureWorkflowNodes(): BoardNode[] {
    return this.allNodes().filter(
      (n) => n.kind === "workflow" && (n.children ?? []).some((c) => c.run?.status === "failure"),
    );
  }
}
