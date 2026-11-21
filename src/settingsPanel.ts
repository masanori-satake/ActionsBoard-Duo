import * as vscode from "vscode";
import { listWorkflowsUrl, normaliseBaseUrl, parseWorkflows } from "./core/github";
import { fetchJson } from "./net";
import type { AppConfig } from "./core/types";
import { isJa, t } from "./i18n";
import { readConfig, readSettings, writeConfig, writeSettings, type BoardSettings } from "./store";
import type { Board } from "./board";

const STRINGS = isJa()
  ? {
      accounts: "アカウント（サーバ）",
      accountName: "名前",
      unnamedAccount: "（名前なしアカウント）",
      baseUrl: "API ベースURL",
      baseUrlHint: "GitHub.com は https://api.github.com、Enterprise は https://<ホスト>/api/v3",
      token: "アクセストークン (PAT)",
      tokenKept: "保存済み — 変更するときだけ入力",
      tokenNew: "トークンを入力",
      test: "接続テスト",
      testing: "確認中…",
      addAccount: "アカウントを追加",
      remove: "削除",
      groups: "グループ",
      groupName: "グループ名",
      groupAccount: "アカウント",
      addGroup: "グループを追加",
      workflows: "監視ワークフロー",
      owner: "owner",
      repo: "repo",
      workflowFile: "ワークフローファイル",
      alias: "別名（任意）",
      starred: "星",
      addByDiscovery: "リポジトリから追加",
      listWorkflows: "ワークフロー一覧を取得",
      addSelected: "選択したものを追加",
      polling: "ポーリング",
      pollVisible: "表示中の間隔（秒）",
      pollHidden: "非表示の間隔（秒）",
      liveness: "死活確認の間隔（秒）",
      notifications: "通知",
      notifyFailure: "ビルド失敗を通知",
      notifyOutage: "不通を通知",
      notifyRecovery: "復旧を通知",
      notifyScope: "失敗通知の範囲",
      scopeAll: "すべて",
      scopeMine: "自分が起こした実行だけ",
      scopeStarred: "星を付けたワークフローだけ",
      legend: "印の凡例",
      legendStar: "★ = 興味がある（星を付けたワークフロー）",
      legendMine: "👤 = 自分の（最新の実行に、自分のアカウントが起こしたものが含まれる）",
      legendStatus: "状態: ✓ 成功 · ✗ 失敗 · 実行中 · 不通（サーバに到達できない。失敗には数えません）",
      save: "保存（適用）",
      saved: "保存しました",
      noAccounts: "アカウントがありません。まずアカウントを追加してください。",
      noGroups: "グループがありません。",
      noWorkflows: "ワークフローはまだありません。",
      discoverNeedsRepo: "owner と repo を入力してください。",
    }
  : {
      accounts: "Accounts (servers)",
      accountName: "Name",
      unnamedAccount: "(Unnamed account)",
      baseUrl: "API base URL",
      baseUrlHint: "GitHub.com: https://api.github.com · Enterprise: https://<host>/api/v3",
      token: "Access token (PAT)",
      tokenKept: "Saved — type only to replace",
      tokenNew: "Enter a token",
      test: "Test connection",
      testing: "Testing…",
      addAccount: "Add account",
      remove: "Remove",
      groups: "Groups",
      groupName: "Group name",
      groupAccount: "Account",
      addGroup: "Add group",
      workflows: "Watched workflows",
      owner: "owner",
      repo: "repo",
      workflowFile: "Workflow file",
      alias: "Alias (optional)",
      starred: "Star",
      addByDiscovery: "Add from repository",
      listWorkflows: "List workflows",
      addSelected: "Add selected",
      polling: "Polling",
      pollVisible: "Interval while visible (sec)",
      pollHidden: "Interval while hidden (sec)",
      liveness: "Liveness check interval (sec)",
      notifications: "Notifications",
      notifyFailure: "Notify build failures",
      notifyOutage: "Notify server outage",
      notifyRecovery: "Notify server recovery",
      notifyScope: "Failure notification scope",
      scopeAll: "All",
      scopeMine: "Only runs started by me",
      scopeStarred: "Only starred workflows",
      legend: "Legend",
      legendStar: "★ = starred (interested)",
      legendMine: "👤 = mine (the newest runs include one started by your account)",
      legendStatus: "Status: ✓ success · ✗ failure · running · unreachable (server down; never counted as a failure)",
      save: "Save (Apply)",
      saved: "Saved",
      noAccounts: "No accounts yet. Add an account first.",
      noGroups: "No groups yet.",
      noWorkflows: "No workflows yet.",
      discoverNeedsRepo: "Enter owner and repo.",
    };

interface InitPayload {
  config: AppConfig;
  settings: BoardSettings;
  hasToken: Record<string, boolean>;
  logins: Record<string, string>;
}

export class SettingsPanel {
  private static current: SettingsPanel | undefined;

  static show(context: vscode.ExtensionContext, board: Board): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    SettingsPanel.current = new SettingsPanel(context, board);
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly board: Board,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "actionsBoardDuo.settings",
      t("settings.title"),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => {
      SettingsPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg: Record<string, unknown>) => {
      void this.onMessage(msg);
    });
  }

  private html(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "settings.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "settings.css"));
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `<!DOCTYPE html>
<html lang="${isJa() ? "ja" : "en"}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
<title>${t("settings.title")}</title>
</head>
<body>
<div id="app"></div>
<div class="footer">
  <button id="save" class="primary"></button>
  <span id="save-status" role="status"></span>
</div>
<script nonce="${nonce}">window.ABD_STRINGS = ${JSON.stringify(STRINGS)};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async initPayload(): Promise<InitPayload> {
    const config = readConfig();
    const hasToken: Record<string, boolean> = {};
    const logins: Record<string, string> = {};
    for (const account of config.accounts) {
      hasToken[account.id] = (await this.board.tokens.get(account.id)) !== undefined;
      const login = this.board.loginOf(account.id);
      if (login) {
        logins[account.id] = login;
      }
    }
    return { config, settings: readSettings(), hasToken, logins };
  }

  private async postInit(): Promise<void> {
    await this.panel.webview.postMessage({ type: "init", payload: await this.initPayload() });
  }

  private async onMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case "ready": {
        await this.postInit();
        break;
      }
      case "save": {
        const config = msg.config as AppConfig;
        const settings = msg.settings as BoardSettings;
        const tokens = (msg.tokens ?? {}) as Record<string, string>;
        const removed = (msg.removedAccountIds ?? []) as string[];
        await writeConfig(config);
        await writeSettings(settings);
        for (const [accountId, token] of Object.entries(tokens)) {
          if (token.trim() !== "") {
            await this.board.tokens.set(accountId, token.trim());
          }
        }
        for (const accountId of removed) {
          await this.board.tokens.delete(accountId);
        }
        void vscode.window.showInformationMessage(t("msg.saved"));
        await this.postInit();
        await this.board.probeAll();
        await this.board.pollAll();
        break;
      }
      case "test": {
        const requestId = msg.requestId as string;
        const baseUrl = normaliseBaseUrl(String(msg.baseUrl ?? ""));
        let token = typeof msg.token === "string" && msg.token.trim() !== "" ? msg.token.trim() : undefined;
        if (!token && typeof msg.accountId === "string") {
          token = await this.board.tokens.get(msg.accountId);
        }
        try {
          const login = await this.board.testAccount(baseUrl, token);
          await this.panel.webview.postMessage({
            type: "testResult",
            requestId,
            ok: true,
            message: t("msg.testOk", login),
          });
        } catch (err) {
          await this.panel.webview.postMessage({
            type: "testResult",
            requestId,
            ok: false,
            message: t("msg.testFailed", err instanceof Error ? err.message : String(err)),
          });
        }
        break;
      }
      case "discover": {
        const requestId = msg.requestId as string;
        const groupId = msg.groupId as string;
        try {
          const owner = String(msg.owner ?? "").trim();
          const repo = String(msg.repo ?? "").trim();
          if (!owner || !repo) {
            throw new Error("owner/repo");
          }
          let account = this.board.account(String(msg.accountId ?? ""));
          let workflows;
          if (account && !(typeof msg.token === "string" && msg.token.trim() !== "")) {
            workflows = await this.board.discoverWorkflows(account, owner, repo);
          } else {
            // Unsaved account: build a transient one from the form values.
            const transient = {
              id: String(msg.accountId ?? "transient"),
              name: "transient",
              baseUrl: normaliseBaseUrl(String(msg.baseUrl ?? "")),
            };
            const token = typeof msg.token === "string" ? msg.token.trim() : undefined;
            const res = await fetchJson(listWorkflowsUrl(transient.baseUrl, owner, repo), token);
            if (res.status < 200 || res.status >= 300) {
              throw new Error(`HTTP ${res.status}`);
            }
            workflows = parseWorkflows(res.json);
            account = transient;
          }
          await this.panel.webview.postMessage({
            type: "discovered",
            requestId,
            groupId,
            workflows: workflows.map((w) => ({ name: w.name, file: w.path.split("/").pop() ?? w.path })),
          });
        } catch (err) {
          await this.panel.webview.postMessage({
            type: "discovered",
            requestId,
            groupId,
            error: err instanceof Error ? err.message : String(err),
            workflows: [],
          });
        }
        break;
      }
    }
  }
}
