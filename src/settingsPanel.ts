import * as vscode from "vscode";
import { listWorkflowsUrl, normaliseBaseUrl, parseRepoUrl, parseWorkflows } from "./core/github";
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
      kind: "サービスの種類",
      kindGitHub: "GitHub (Actions)",
      kindBamboo: "Bamboo",
      baseUrl: "API ベースURL",
      baseUrlHint: "GitHub.com は https://api.github.com、Enterprise は https://<ホスト>/api/v3",
      baseUrlBamboo: "サーバの URL",
      baseUrlBambooHint: "Bamboo サーバのベース URL（例: https://bamboo.example.com）。REST API はこの下の /rest/api/latest を使います",
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
      workflows: "監視対象ワークフロー",
      plans: "監視対象プラン",
      project: "プロジェクト",
      planKey: "プランキー",
      repository: "リポジトリ",
      workflowFile: "ワークフローファイル",
      starred: "お気に入り",
      addByDiscovery: "リポジトリから追加",
      listWorkflows: "ワークフロー一覧を取得",
      addByDiscoveryPlans: "サーバから追加",
      listPlans: "プラン一覧を取得",
      addSelected: "選択したものを追加",
      polling: "ポーリング",
      pollVisible: "表示中の間隔（秒）",
      pollHidden: "非表示の間隔（秒）",
      liveness: "死活確認の間隔（秒）",
      notifications: "通知",
      notifyFailure: "ビルド失敗を通知",
      notifyOutage: "サービス不通を通知",
      notifyRecovery: "サービス復旧を通知",
      notifyScope: "失敗通知の範囲",
      scopeAll: "すべて",
      scopeMine: "自分が実行したジョブだけ",
      scopeStarred: "星を付けたワークフローだけ",
      legend: "印の凡例",
      legendStar: "★ = お気に入り",
      legendMine: "♟ = 自身が実行",
      legendStatus: "状態: ✓ 成功 · ✗ 失敗 · 実行中 · 不通（サーバに到達できない。失敗には数えません）",
      save: "保存（適用）",
      cancel: "キャンセル",
      saved: "保存しました",
      noAccounts: "アカウントがありません。まずアカウントを追加してください。",
      noGroups: "グループがありません。",
      noWorkflows: "ワークフローはまだありません。",
      noPlans: "プランはまだありません。",
      addToGroup: "追加先のグループ",
      unnamedGroup: "（名前なしグループ）",
      repoUrlPlaceholder: "https://github.com/owner/repo",
      discoverBadUrl:
        "リポジトリを読み取れませんでした。リポジトリの URL（https://github.com/owner/repo のような形）を貼り付けてください。",
      plansNeedsServer: "先にサーバの URL とトークンを入力してください。",
    }
  : {
      accounts: "Accounts (servers)",
      accountName: "Name",
      unnamedAccount: "(Unnamed account)",
      kind: "Service",
      kindGitHub: "GitHub (Actions)",
      kindBamboo: "Bamboo",
      baseUrl: "API base URL",
      baseUrlHint: "GitHub.com: https://api.github.com · Enterprise: https://<host>/api/v3",
      baseUrlBamboo: "Server URL",
      baseUrlBambooHint: "The Bamboo server's base URL (e.g. https://bamboo.example.com). The REST API lives under /rest/api/latest below it.",
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
      plans: "Watched plans",
      project: "Project",
      planKey: "Plan key",
      repository: "Repository",
      workflowFile: "Workflow file",
      starred: "Favorite",
      addByDiscovery: "Add from repository",
      listWorkflows: "List workflows",
      addByDiscoveryPlans: "Add from server",
      listPlans: "List plans",
      addSelected: "Add selected",
      polling: "Polling",
      pollVisible: "Interval while visible (sec)",
      pollHidden: "Interval while hidden (sec)",
      liveness: "Liveness check interval (sec)",
      notifications: "Notifications",
      notifyFailure: "Notify build failures",
      notifyOutage: "Notify when a service becomes unreachable",
      notifyRecovery: "Notify when a service recovers",
      notifyScope: "Failure notification scope",
      scopeAll: "All",
      scopeMine: "Only jobs I ran",
      scopeStarred: "Only starred workflows",
      legend: "Legend",
      legendStar: "★ = Favorite",
      legendMine: "♟ = Run by you",
      legendStatus: "Status: ✓ success · ✗ failure · running · unreachable (server down; never counted as a failure)",
      save: "Save (Apply)",
      cancel: "Cancel",
      saved: "Saved",
      noAccounts: "No accounts yet. Add an account first.",
      noGroups: "No groups yet.",
      noWorkflows: "No workflows yet.",
      noPlans: "No plans yet.",
      addToGroup: "Add to group",
      unnamedGroup: "(Unnamed group)",
      repoUrlPlaceholder: "https://github.com/owner/repo",
      discoverBadUrl: "Could not read that as a repository. Paste the repository URL (like https://github.com/owner/repo).",
      plansNeedsServer: "Enter the server URL and a token first.",
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
  <div class="footer-buttons">
    <button id="save" class="primary"></button>
    <button id="cancel"></button>
  </div>
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
      case "cancel": {
        // Discard every unsaved edit by closing the panel: the edits live
        // only in the webview, so disposing it drops them with no config
        // write and no re-render.
        this.panel.dispose();
        break;
      }
      case "save": {
        const config = msg.config as AppConfig;
        const settings = msg.settings as BoardSettings;
        const tokens = (msg.tokens ?? {}) as Record<string, string>;
        const removed = (msg.removedAccountIds ?? []) as string[];
        // Tokens go first: writing the config fires a configuration-change
        // event whose reload must never check with a stale token. A token
        // stored for an account whose config write then fails is harmless.
        // beginSave suppresses reloadConfig's immediate poll/probe for the
        // whole write sequence, so the probe/poll below — after every
        // write has landed — is the single first check.
        this.board.beginSave();
        try {
          for (const [accountId, token] of Object.entries(tokens)) {
            if (token.trim() !== "") {
              await this.board.tokens.set(accountId, token.trim());
            }
          }
          for (const accountId of removed) {
            await this.board.tokens.delete(accountId);
          }
          await writeConfig(config);
          await writeSettings(settings);
        } finally {
          this.board.endSave();
        }
        void vscode.window.showInformationMessage(t("msg.saved"));
        await this.postInit();
        await this.board.probeAll();
        await this.board.pollAll();
        break;
      }
      case "test": {
        const requestId = msg.requestId as string;
        const kind = msg.kind === "bamboo" ? ("bamboo" as const) : ("github" as const);
        // GitHub's normaliser must never touch a Bamboo server URL (it
        // would append /api/v3); the Bamboo URL builder trims instead.
        const baseUrl = kind === "bamboo" ? String(msg.baseUrl ?? "") : normaliseBaseUrl(String(msg.baseUrl ?? ""));
        let token = typeof msg.token === "string" && msg.token.trim() !== "" ? msg.token.trim() : undefined;
        if (!token && typeof msg.accountId === "string") {
          token = await this.board.tokens.get(msg.accountId);
        }
        try {
          const login = await this.board.testAccount(baseUrl, token, kind);
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
        // The form sends the pasted repository text raw; the tolerant
        // parse lives in core (unit-tested). Unparseable input is
        // reported back with a code so the form can show its own
        // localised guidance instead of a raw error.
        const parsed = parseRepoUrl(String(msg.repoText ?? ""));
        if (!parsed) {
          await this.panel.webview.postMessage({
            type: "discovered",
            requestId,
            groupId,
            code: "badRepoUrl",
            workflows: [],
          });
          break;
        }
        const { owner, repo } = parsed;
        try {
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
            owner,
            repo,
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
      case "discoverPlans": {
        const requestId = msg.requestId as string;
        const groupId = msg.groupId as string;
        try {
          const typedToken =
            typeof msg.token === "string" && msg.token.trim() !== "" ? msg.token.trim() : undefined;
          // A saved account is used as-is; an unsaved one becomes a
          // transient Bamboo account from the form values. Without a
          // typed token, discoverPlans falls back to the stored token.
          const account = this.board.account(String(msg.accountId ?? "")) ?? {
            id: String(msg.accountId ?? "transient"),
            name: "transient",
            baseUrl: String(msg.baseUrl ?? ""),
            kind: "bamboo" as const,
          };
          const plans = await this.board.discoverPlans(account, typedToken);
          await this.panel.webview.postMessage({
            type: "discoveredPlans",
            requestId,
            groupId,
            plans: plans.map((p) => ({
              projectKey: p.projectKey,
              projectName: p.projectName,
              planKey: p.planKey,
              name: p.name,
            })),
          });
        } catch (err) {
          await this.panel.webview.postMessage({
            type: "discoveredPlans",
            requestId,
            groupId,
            error: err instanceof Error ? err.message : String(err),
            plans: [],
          });
        }
        break;
      }
    }
  }
}
