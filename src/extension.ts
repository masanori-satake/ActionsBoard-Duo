import * as vscode from "vscode";
import { Board } from "./board";
import { buildExport, parseImport } from "./core/config";
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
    SettingsPanel.show(context, board, {
      exportSettings,
      importSettings,
      resetAll,
    });
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

  register("actionsBoardDuo.toggleStar", async (node?: BoardNode) => {
    if (!node?.workflow || !node.group) {
      return;
    }
    const config = readConfig();
    const group = config.groups.find((g) => g.id === node.group!.id);
    const target = group?.workflows.find(
      (w) =>
        w.owner === node.workflow!.owner && w.repo === node.workflow!.repo && w.workflow === node.workflow!.workflow,
    );
    if (target) {
      target.starred = target.starred !== true;
      await writeConfig(config);
    }
  });

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

  const exportSettings = async (): Promise<void> => {
    const config = readConfig();
    const json = JSON.stringify(buildExport(config), null, 2);
    const uri = await vscode.window.showSaveDialog({
      filters: { JSON: ["json"] },
      defaultUri: vscode.Uri.file("actionsboard-duo-settings.json"),
    });
    if (!uri) {
      return;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, "utf8"));
    void vscode.window.showInformationMessage(t("msg.exported"));
  };

  const importSettings = async (): Promise<boolean> => {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ["json"] },
    });
    if (!uris || uris.length === 0) {
      return false;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uris[0]);
      const config = parseImport(Buffer.from(bytes).toString("utf8"));
      await writeConfig(config);
      void vscode.window.showInformationMessage(t("msg.imported"));
      return true;
    } catch {
      void vscode.window.showErrorMessage(t("msg.testFailed", "import"));
      return false;
    }
  };

  const resetAll = async (): Promise<void> => {
    const choice = await vscode.window.showWarningMessage(t("msg.resetConfirm"), { modal: true }, t("msg.resetButton"));
    if (choice !== t("msg.resetButton")) {
      return;
    }
    const config = readConfig();
    for (const account of config.accounts) {
      await tokens.delete(account.id);
    }
    await writeConfig({ accounts: [], groups: [] });
    void vscode.window.showInformationMessage(t("msg.resetDone"));
  };

  register("actionsBoardDuo.exportSettings", exportSettings);
  register("actionsBoardDuo.importSettings", () => importSettings());
  register("actionsBoardDuo.resetAll", resetAll);

  refreshUi();
  board.start();
}

export function deactivate(): void {}
