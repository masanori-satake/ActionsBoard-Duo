import * as vscode from "vscode";
import { Board } from "./board";
import { bambooBrowseUrl } from "./core/bamboo";
import { ExpansionEpoch, type ExpansionMode } from "./core/expansion";
import { workflowPageUrl } from "./core/github";
import { moveGroup, moveWatchedItem } from "./core/reorder";
import type { DisplayMode, ScopeFilter, WatchedItem } from "./core/types";
import { isPlanEntry, sameItem } from "./core/types";
import { SettingsPanel } from "./settingsPanel";
import { BoardStatusBar } from "./statusBar";
import { readConfig, TokenStore, writeConfig } from "./store";
import { BoardTreeProvider, type BoardNode } from "./treeProvider";

/** The tree's own drag & drop MIME type — drops from elsewhere are ignored. */
const DND_MIME = "application/vnd.actionsboardduo.node";

type DragPayload =
  | { type: "item"; groupId: string; item: WatchedItem }
  | { type: "group"; groupId: string };

/**
 * Drag & drop on the board tree: drag a workflow/plan to reorder it
 * within its group or move it into another group of the same account;
 * drag a group to reorder groups. The resulting order is written to the
 * settings arrays, whose order is the display order everywhere. The
 * pure move operations live in core/reorder; this controller only
 * translates between tree nodes and config entries.
 */
class BoardDragAndDropController implements vscode.TreeDragAndDropController<BoardNode> {
  readonly dropMimeTypes = [DND_MIME];
  readonly dragMimeTypes = [DND_MIME];

  handleDrag(source: readonly BoardNode[], dataTransfer: vscode.DataTransfer): void {
    const node = source[0];
    if (!node) {
      return;
    }
    let payload: DragPayload | undefined;
    if (node.kind === "workflow" && node.group && node.workflow) {
      payload = { type: "item", groupId: node.group.id, item: node.workflow };
    } else if (node.kind === "group" && node.group) {
      payload = { type: "group", groupId: node.group.id };
    }
    if (payload) {
      dataTransfer.set(DND_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
    }
  }

  async handleDrop(target: BoardNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const raw = dataTransfer.get(DND_MIME)?.value;
    if (typeof raw !== "string") {
      return;
    }
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    // Job nodes carry no group/entry of their own; their parent run does.
    const anchor = target?.kind === "job" ? target.parent : target;
    const config = readConfig();
    let changed = false;
    if (payload.type === "item") {
      let targetGroupId: string | undefined;
      let beforeItem: WatchedItem | undefined;
      if (anchor?.kind === "workflow" && anchor.group && anchor.workflow) {
        // Dropped on an entry: insert before it.
        targetGroupId = anchor.group.id;
        beforeItem = anchor.workflow;
      } else if (anchor?.group) {
        // Dropped on a group (append) or on a run (insert before its entry).
        targetGroupId = anchor.group.id;
        beforeItem = anchor.kind === "run" ? anchor.workflow : undefined;
      }
      if (!targetGroupId) {
        return;
      }
      if (beforeItem && targetGroupId === payload.groupId && sameItem(beforeItem, payload.item)) {
        return; // Dropped onto itself.
      }
      changed = moveWatchedItem(config.groups, payload.groupId, payload.item, targetGroupId, beforeItem);
    } else {
      // Group drag: reorder only against another group of the same account.
      const anchorGroup = anchor?.group;
      if (!anchorGroup || anchorGroup.id === payload.groupId) {
        return;
      }
      const dragged = config.groups.find((g) => g.id === payload.groupId);
      if (!dragged || dragged.accountId !== anchorGroup.accountId) {
        return;
      }
      changed = moveGroup(config.groups, payload.groupId, anchorGroup.id);
    }
    if (changed) {
      // Writing the config fires the configuration-change handler,
      // which reloads the board and refreshes the tree.
      await writeConfig(config);
    }
  }
}

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
    dragAndDropController: new BoardDragAndDropController(),
    // No built-in collapse-all button: the extension's own collapse
    // control sits inside the expansion button group in the view title.
    // With showCollapseAll on, VS Code renders its own collapse button
    // apart from that group, which reads as a stray duplicate.
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView, board, statusBar);

  let expansionMode: ExpansionMode = "failures";
  let programmaticUntil = 0;
  let initialExpansionDone = false;
  // Generation counter for expansion work: a new instruction supersedes
  // any reveal loop still running, and disposal ends the last generation.
  const expansionEpoch = new ExpansionEpoch();
  context.subscriptions.push({ dispose: () => expansionEpoch.advance() });

  // The view carries no state text line: the current scope / display mode /
  // expansion mode are shown by the title-bar buttons themselves. These
  // context keys drive the paired menu entries that swap each state button
  // to its filled "active" icon while it is the current state. Expansion
  // "manual" matches no preset, so no expansion button shows active.
  const syncStateContexts = () => {
    void vscode.commands.executeCommand("setContext", "actionsBoardDuo.scope", provider.scope);
    void vscode.commands.executeCommand("setContext", "actionsBoardDuo.displayMode", provider.displayMode);
    void vscode.commands.executeCommand("setContext", "actionsBoardDuo.expansion", expansionMode);
  };

  const refreshUi = () => {
    provider.refresh();
    statusBar.update(board);
    syncStateContexts();
  };

  const guardProgrammatic = (ms = 1500) => {
    programmaticUntil = Date.now() + ms;
  };

  const collapseAllInternal = async () => {
    guardProgrammatic();
    try {
      await vscode.commands.executeCommand("workbench.actions.treeView.actionsBoardDuo.tree.collapseAll");
    } catch {
      // The workbench collapse command is registered for the tree view
      // itself (not tied to the title button); if it is ever missing,
      // collapsing is a no-op rather than an error in the caller.
    }
  };

  const applyExpansion = async (mode: ExpansionMode) => {
    // Every new instruction supersedes expansion work still in flight:
    // advancing the epoch makes a running reveal loop stop at its next
    // step instead of re-expanding nodes behind the newer instruction.
    const epoch = expansionEpoch.advance();
    expansionMode = mode;
    syncStateContexts();
    if (mode === "collapsed") {
      await collapseAllInternal();
      syncStateContexts();
      return;
    }
    await collapseAllInternal();
    if (!expansionEpoch.isCurrent(epoch)) {
      return; // Superseded while collapsing; the newer instruction owns the tree.
    }
    const targets =
      mode === "failures"
        ? provider.runNodesWith(["failure"])
        : mode === "running"
          ? provider.runNodesWith(["failure", "running"])
          : provider.runNodesWith(["failure", "running", "other", "success"]);
    guardProgrammatic(2000 + targets.length * 120);
    for (const node of targets) {
      if (!expansionEpoch.isCurrent(epoch)) {
        return; // Superseded mid-expansion (e.g. switched to collapsed).
      }
      try {
        await treeView.reveal(node, { expand: true, focus: false, select: false });
      } catch {
        // Node may have been rebuilt by a refresh in the meantime; skip it.
      }
    }
    if (expansionEpoch.isCurrent(epoch)) {
      syncStateContexts();
    }
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
      syncStateContexts();
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

  const setScope = async (scope: ScopeFilter) => {
    provider.scope = scope;
    await context.workspaceState.update("actionsBoardDuo.scope", scope);
    refreshUi();
  };

  // One command per scope state, plus an "Active" twin of each: a menu
  // entry cannot override its command's icon, so the title bar swaps
  // between the two commands (via the scope context key) to show the
  // current state with a filled icon. Both twins run the same setter.
  register("actionsBoardDuo.scopeAll", () => setScope("all"));
  register("actionsBoardDuo.scopeAllActive", () => setScope("all"));
  register("actionsBoardDuo.scopeMine", () => setScope("mine"));
  register("actionsBoardDuo.scopeMineActive", () => setScope("mine"));
  register("actionsBoardDuo.scopeStarred", () => setScope("starred"));
  register("actionsBoardDuo.scopeStarredActive", () => setScope("starred"));

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

  // Same pairing as the scope buttons: each expansion preset has a normal
  // command and an "Active" twin with a filled icon, swapped by the
  // expansion context key. In "manual" no twin matches, so no expansion
  // button shows active.
  register("actionsBoardDuo.expandFailures", () => applyExpansion("failures"));
  register("actionsBoardDuo.expandFailuresActive", () => applyExpansion("failures"));
  register("actionsBoardDuo.expandRunning", () => applyExpansion("running"));
  register("actionsBoardDuo.expandRunningActive", () => applyExpansion("running"));
  register("actionsBoardDuo.expandAll", () => applyExpansion("all"));
  register("actionsBoardDuo.expandAllActive", () => applyExpansion("all"));
  register("actionsBoardDuo.collapseAll", () => applyExpansion("collapsed"));
  register("actionsBoardDuo.collapseAllActive", () => applyExpansion("collapsed"));

  const setStarred = async (node: BoardNode | undefined, starred: boolean): Promise<void> => {
    if (!node?.workflow || !node.group) {
      return;
    }
    const config = readConfig();
    const group = config.groups.find((g) => g.id === node.group!.id);
    const target = group?.workflows.find((w) => sameItem(w, node.workflow!));
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
    if (!node?.workflow || !node.account || isPlanEntry(node.workflow)) {
      return;
    }
    const url = workflowPageUrl(node.workflow.owner, node.workflow.repo, node.workflow.workflow, node.account.baseUrl);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });

  register("actionsBoardDuo.openPlanPage", async (node?: BoardNode) => {
    if (!node?.workflow || !node.account || !isPlanEntry(node.workflow)) {
      return;
    }
    const url = bambooBrowseUrl(node.account.baseUrl, node.workflow.planKey);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });

  refreshUi();
  board.start();
}

export function deactivate(): void {}
