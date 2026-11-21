import * as vscode from "vscode";
import { aggregateStatusBar, type StatusBarCounts } from "./core/model";
import { t } from "./i18n";
import type { Board } from "./board";

/**
 * The always-present status bar summary — layer 1 of the gaze.
 * Glyphs + counts for success / failure / running, and unreachable servers
 * counted separately (per account, normally 0, never a "failure").
 */
export class BoardStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  /** The counts the item currently displays; the click decision reads these. */
  private counts: StatusBarCounts = {
    success: 0,
    failure: 0,
    running: 0,
    unreachableServers: 0,
    authErrorServers: 0,
  };

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    // The item has its own click command: the plain "focus" command only
    // opens the board, while a click additionally expands the failures
    // when the displayed counts say something is wrong.
    this.item.command = "actionsBoardDuo.statusBarClick";
    this.item.show();
  }

  /** The counts from the latest update — what the item displays now. */
  get currentCounts(): StatusBarCounts {
    return this.counts;
  }

  update(board: Board): void {
    const counts = aggregateStatusBar(board.config.groups, board.states, board.health);
    this.counts = counts;
    const parts = [
      `$(pass) ${counts.success}`,
      `$(error) ${counts.failure}`,
      `$(sync) ${counts.running}`,
      `$(debug-disconnect) ${counts.unreachableServers}`,
    ];
    if (counts.authErrorServers > 0) {
      parts.push(`$(key) ${counts.authErrorServers}`);
    }
    this.item.text = parts.join("  ");
    this.item.tooltip = new vscode.MarkdownString(
      `**ActionsBoard-Duo**\n\n${t(
        "statusbar.tooltip",
        counts.success,
        counts.failure,
        counts.running,
        counts.unreachableServers,
      )}`,
    );
    if (counts.failure > 0) {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else if (counts.unreachableServers > 0 || counts.authErrorServers > 0) {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
