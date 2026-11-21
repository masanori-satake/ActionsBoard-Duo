import * as vscode from "vscode";

/** Runtime UI strings (tree rows, notifications, the settings form).
 * Manifest strings live in package.nls*.json; these cover dynamic text. */

const en = {
  "status.success": "Success",
  "status.failure": "Failure",
  "status.running": "Running",
  "status.other": "Other",
  "status.unreachable": "Unreachable",
  "status.authError": "Auth error",
  "status.recovered": "Recovered",
  "tree.noAccounts": "No accounts yet — open Settings to add one.",
  "tree.unnamedGroup": "(Unnamed group)",
  "tree.noWorkflows": "No watched workflows yet — open Settings to add some.",
  "tree.lastConfirmed": "last confirmed {0}",
  "tree.noRuns": "no runs yet",
  "tree.noJobs": "No jobs recorded",
  "tree.fetchError": "fetch failed",
  "tree.jobsNotLoaded": "expand to load jobs",
  "tree.failedStep": "failed step: {0}",
  "tree.legend": "Marks: ★ = starred (interested) · person = the newest runs include one started by your account",
  "pages.deliverable": "Pages deployed",
  "pages.deploying": "Pages deploying",
  "pages.error": "Pages deployment failed",
  "statusbar.tooltip": "ActionsBoard-Duo — success {0} · failure {1} · running {2} · unreachable servers {3}",
  "notify.failure": "Build failed: {0} ({1})",
  "notify.openRun": "Open run",
  "notify.outage": "CI server unreachable: {0}",
  "notify.recovery": "CI server recovered: {0}",
  "notify.authError": "CI server auth error (check the token): {0}",
  "settings.title": "ActionsBoard-Duo Settings",
  "msg.saved": "ActionsBoard-Duo settings saved.",
  "msg.testOk": "Connection OK — signed in as {0}.",
  "msg.testFailed": "Connection failed: {0}",
};

const ja: typeof en = {
  "status.success": "成功",
  "status.failure": "失敗",
  "status.running": "実行中",
  "status.other": "その他",
  "status.unreachable": "不通",
  "status.authError": "認証エラー",
  "status.recovered": "復旧",
  "tree.noAccounts": "アカウントがまだありません — 設定を開いて追加してください。",
  "tree.unnamedGroup": "（名前なしグループ）",
  "tree.noWorkflows": "監視ワークフローがまだありません — 設定を開いて追加してください。",
  "tree.lastConfirmed": "最終確認 {0}",
  "tree.noRuns": "実行はまだありません",
  "tree.noJobs": "ジョブはありません",
  "tree.fetchError": "取得に失敗",
  "tree.jobsNotLoaded": "開くとジョブを読み込みます",
  "tree.failedStep": "失敗したステップ: {0}",
  "tree.legend": "印: ★ = 興味がある（星） · 人の印 = 最新の実行に自分のアカウントが起こしたものが含まれる",
  "pages.deliverable": "Pages デプロイ完了",
  "pages.deploying": "Pages デプロイ中",
  "pages.error": "Pages デプロイ失敗",
  "statusbar.tooltip": "ActionsBoard-Duo — 成功 {0} · 失敗 {1} · 実行中 {2} · サーバ不通 {3}",
  "notify.failure": "ビルドが失敗しました: {0}（{1}）",
  "notify.openRun": "実行を開く",
  "notify.outage": "CI サーバに到達できません: {0}",
  "notify.recovery": "CI サーバが復旧しました: {0}",
  "notify.authError": "CI サーバの認証エラーです（トークンを確認してください）: {0}",
  "settings.title": "ActionsBoard-Duo 設定",
  "msg.saved": "ActionsBoard-Duo の設定を保存しました。",
  "msg.testOk": "接続できました — {0} としてログインしています。",
  "msg.testFailed": "接続に失敗しました: {0}",
};

export type MsgKey = keyof typeof en;

const dict = vscode.env.language.toLowerCase().startsWith("ja") ? ja : en;

export function t(key: MsgKey, ...args: (string | number)[]): string {
  let s: string = dict[key] ?? en[key] ?? key;
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, String(a));
  });
  return s;
}

export function isJa(): boolean {
  return dict === ja;
}
