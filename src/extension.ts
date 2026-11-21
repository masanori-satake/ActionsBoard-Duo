import * as vscode from "vscode";
import { Board } from "./board";
import { nextExpansionMode, type ExpansionMode } from "./core/expansion";
import { workflowPageUrl } from "./core/github";
import type { DisplayMode, ScopeFilter } from "./core/types";
import { t } from "./i18n";
import { SettingsPanel } from "./settingsPanel";
import { BoardStatusBar } from "./statusBar";
import { readConfig, TokenStore, writeConfig } from "./store";
import { BoardTreeProvider, type BoardNode } from "./treeProvider";

const SCOPE_ORDER: ScopeFilter[] = ["all", "mine", "starred"];

export function activate(context: vscode.ExtensionContext): void {
  const tokens = new TokenStore(context.secrets);
  const board = new Board(context.globalState, tokens);
  const provider = new BoardTreeProvider(board);
  const statusBar = new BoardStatusBar();

  const savedScope = context.workspaceState.get<ScopeFilter>("actionsBoardDuo.scope", "all");
  const savedMode = context.workspaceState.get<DisplayMode>("actionsBoardDuo.displayMode", "all");
  provider.scope = savedScope;
  provider.displayMode = savedMode;

  const treeView = vscode.window.createTreeView("actionsBoardDuo.tree", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView, board, statusBar);

  let expansionMode: ExpansionMode = "failures";
  let programmaticUntil = 0;
  let initialExpansionDone = false;

  const syncViewChrome = () => {
    void vscode.commands.executeCommand("setContext", "actionsBoardDuo.scope", provider.scope);
    void vscode.commands.executeCommand("setContext", "actionsBoardDuo.displayMode", provider.displayMode);
    const scopeText =
      provider.scope === "all" ? t("scope.all") : provider.scope === "mine" ? t("scope.mine") : t("scope.starred");
    const displayText = provider.displayMode === "all" ? t("display.all") : t("display.starred");
    const expansionText =
      expansionMode === "failures"
        ? t("expansion.failures")
        : expansionMode === "running"
          ? t("expansion.running")
          : expansionMode === "all"
            ? t("expansion.all")
            : expansionMode === "collapsed"
              ? t("expansion.collapsed")
              : t("expansion.manual");
    treeView.message = `${scopeText} · ${displayText} · ${expansionText}`;
  };

  const refreshUi = () => {
    provider.refresh();
    statusBar.update(board);
    syncViewChrome();
  };

  const guardProgrammatic = (ms = 1500) => {
    programmaticUntil = Date.now() + ms;
  };

  const collapseAllInternal = async () => {
    guardProgrammatic();
    await vscode.commands.executeCommand("workbench.actions.treeView.actionsBoardDuo.tree.collapseAll");
  };

  const applyExpansion = async (mode: ExpansionMode) => {
    expansionMode = mode;
    if (mode === "collapsed") {
      await collapseAllInternal();
      syncViewChrome();
      return;
    }
    await collapseAllInternal();
    const targets =
      mode === "failures"
        ? provider.runNodesWith(["failure"])
        : mode === "running"
          ? provider.runNodesWith(["failure", "running"])
          : provider.runNodesWith(["failure", "running", "other", "success"]);
    guardProgrammatic(2000 + targets.length * 120);
    for (const node of targets) {
      try {
        await treeView.reveal(node, { expand: true, focus: false, select: false });
      } catch {
        // Node may have been rebuilt by a refresh in the meantime; skip it.
      }
    }
    syncViewChrome();
  };

  const maybeApplyInitialExpansion = () => {
    if (initialExpansionDone || !treeView.visible) {
      return;
    }
    if (board.states.size === 0 && board.config.groups.length > 0) {
      return; // Still waiting for the first data.
    }
    initialExpansionDone = true;
    void applyExpansion("failures");
  };

  context.subscriptions.push(
    board.onDidChange(() => {
      refreshUi();
      maybeApplyInitialExpansion();
    }),
  );

  treeView.onDidChangeVisibility((e) => {
    board.setViewVisible(e.visible);
    if (e.visible) {
      maybeApplyInitialExpansion();
    }
  });
  board.setViewVisible(treeView.visible);

  const markManual = () => {
    if (Date.now() <= programmaticUntil) {
      return;
    }
    if (expansionMode !== "manual") {
      expansionMode = "manual";
      syncViewChrome();
    }
  };
  treeView.onDidExpandElement(markManual);
  treeView.onDidCollapseElement(markManual);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("actionsBoardDuo")) {
        board.reloadConfig();
      }
    }),
  );

  const register = (id: string, handler: (...args: never[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register("actionsBoardDuo.refresh", async () => {
    await board.probeAll();
    await board.pollAll();
  });

  register("actionsBoardDuo.focus", async () => {
    await vscode.commands.executeCommand("actionsBoardDuo.tree.focus");
  });

  register("actionsBoardDuo.openSettings", () => {
    SettingsPanel.show(context, board);
  });

  register("actionsBoardDuo.cycleScope", async () => {
    const next = SCOPE_ORDER[(SCOPE_ORDER.indexOf(provider.scope) + 1) % SCOPE_ORDER.length];
    provider.scope = next;
    await context.workspaceState.update("actionsBoardDuo.scope", next);
    refreshUi();
  });

  register("actionsBoardDuo.showStarredOnly", async () => {
    provider.displayMode = "starred";
    await context.workspaceState.update("actionsBoardDuo.displayMode", "starred");
    refreshUi();
  });

  register("actionsBoardDuo.showAll", async () => {
    provider.displayMode = "all";
    await context.workspaceState.update("actionsBoardDuo.displayMode", "all");
    refreshUi();
  });

  register("actionsBoardDuo.cycleExpansion", () => applyExpansion(nextExpansionMode(expansionMode)));
  register("actionsBoardDuo.expandFailures", () => applyExpansion("failures"));
  register("actionsBoardDuo.expandRunning", () => applyExpansion("running"));
  register("actionsBoardDuo.expandAll", () => applyExpansion("all"));
  register("actionsBoardDuo.collapseAll", () => applyExpansion("collapsed"));

  const setStarred = async (node: BoardNode | undefined, starred: boolean): Promise<void> => {
    if (!node?.workflow || !node.group) {
      return;
    }
    const config = readConfig();
    const group = config.groups.find((g) => g.id === node.group!.id);
    const target = group?.workflows.find(
      (w) =>
        w.owner === node.workflow!.owner && w.repo === node.workflow!.repo && w.workflow === node.workflow!.workflow,
    );
    if (target && (target.starred === true) !== starred) {
      target.starred = starred;
      await writeConfig(config);
    }
  };

  register("actionsBoardDuo.addStar", async (node?: BoardNode) => setStarred(node, true));
  register("actionsBoardDuo.removeStar", async (node?: BoardNode) => setStarred(node, false));

  register("actionsBoardDuo.openRun", async (url?: string) => {
    if (url) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  });

  register("actionsBoardDuo.openWorkflowPage", async (node?: BoardNode) => {
    if (!node?.workflow || !node.account) {
      return;
    }
    const url = workflowPageUrl(node.workflow.owner, node.workflow.repo, node.workflow.workflow, node.account.baseUrl);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });

  refreshUi();
  board.start();
}

export function deactivate(): void {}
