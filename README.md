# ActionsBoard-Duo

[![Version](https://img.shields.io/badge/version-v0.1.14-blue.svg)](package.json)
[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version/masanori-satake.actionsboard-duo.svg?label=Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=masanori-satake.actionsboard-duo)
[![Open VSX](https://img.shields.io/open-vsx/v/masanori-satake/actionsboard-duo?label=Open%20VSX)](https://open-vsx.org/extension/masanori-satake/actionsboard-duo)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/masanori-satake/ActionsBoard-Duo)](https://github.com/masanori-satake/ActionsBoard-Duo/releases)

<p align="center">
  <strong>Language / 言語:</strong> <a href="#english">English</a> | <a href="#japanese">日本語</a>
</p>

---

<a id="english"></a>
## English

**ActionsBoard-Duo** is the VS Code edition of ActionsBoard (originally a Chrome extension). It watches GitHub Actions and answers one question at a glance: *is everything running smoothly?*

The board is a quiet tree in the Activity Bar: **account (server) → group → workflow → branch runs → jobs**. You do not need to open it while things are fine — an always-present status bar item carries the first layer of the gaze (success / failure / running counts, plus unreachable servers counted separately), and notifications tell you about failures, server outages and recoveries.

It is a "-Duo": where a "-Solo" is complete on its own and fully local, a "-Duo" works by pairing with something else — here, the CI servers you configure. The pairing stays minimal and read-only: polling of the APIs you configured, nothing more. Tokens live only in SecretStorage, never in settings files.

Current version: **v0.1.14**

---

<a id="en-key-features"></a>
### 💡 Key Features

- **Tree-only board** — accounts, groups, workflows, branch runs, and the jobs inside a run (matrix breakdowns included). Success rows stay quiet; failures are marked at the row head.
- **Scope filters** — title-bar filters for All / Mine / Starred, plus a "starred only" display mode that hides everything else, groups and servers included.
- **Expansion selectors** — "Failures only" (the initial state), "Running too", "Expand all", "Collapse all". If you adjust expansion by hand, the view says so.
- **Symbol marks** — ★ means starred (a workflow you are interested in; toggle it on the row). A person mark means the newest runs include one started by your own account (matched automatically from the run actor).
- **Status bar summary** — always present: glyphs and counts for success, failure and running, and unreachable servers as their own count (normally 0). An outage is never counted as a build failure. Clicking it opens the board.
- **Server liveness** — each account is probed on its own cycle, separate from build polling. Reachable / auth error / unreachable are kept distinct; an unreachable server's rows switch to an "unreachable" presentation with the last-confirmed time, and a recovery marker appears when it comes back.
- **Notifications** — build failures, server outages and recoveries (outage and recovery can each be switched off; failure notifications can be scoped to all / mine / starred).
- **Accounts** — multiple GitHub / GitHub Enterprise Server accounts (PAT + API base URL), each with a connection test; your login is fetched automatically for the "Mine" matching.
- **Groups** — bundle workflows across repositories by purpose. Add workflows by discovering them from a repository: list the repository's workflows and check the ones to watch. Workflows are labelled with their own GitHub workflow name once it is known (the file name until the first fetch). Stars per workflow.
- **One-screen settings form** — accounts, groups, workflows, polling and notifications on a single page with an Apply (Save) button. No serial wizard dialogs.
- **View-only** — no re-run or cancel operations. It is a tool for watching.

<a id="en-how-to-use"></a>
### 🚀 How to Use

1. Install the extension and open the ActionsBoard-Duo icon in the Activity Bar.
2. Open Settings (gear in the view title) and add an account: a name, the API base URL (`https://api.github.com`, or `https://<host>/api/v3` for GitHub Enterprise Server) and a personal access token. Use "Test connection" to check it.
3. Add a group, choose its account, and add workflows by discovering them from a repository.
4. Press Save. Polling starts; the tree fills in and the status bar shows the counts.
5. Star the workflows you care about; use the title-bar filters and expansion selectors to shape the view.

<a id="en-commands"></a>
### ⌨️ Commands

- **Refresh** — poll builds and liveness now.
- **Switch Scope (All / Mine / Starred)** — cycle the scope filter.
- **Show Starred Only / Show All** — toggle the display mode.
- **Expand Failures Only / Expand Running Too / Expand All / Collapse All** — expansion selectors.
- **Open Settings (Accounts, Groups, Workflows)** — the one-screen settings form.

<a id="en-settings"></a>
### 🔧 Settings

Polling defaults to 30 seconds while the view is visible and 300 seconds while it is hidden; the liveness cycle defaults to 120 seconds. All three are configurable (`actionsBoardDuo.*`). Accounts and groups are stored in user settings (without tokens); tokens are stored in SecretStorage only.

<a id="en-requirements"></a>
### 📋 Requirements

- VS Code 1.90 or later.
- A personal access token for each GitHub / GitHub Enterprise Server account you watch (read access to Actions is enough).

<a id="en-privacy"></a>
### 🔒 Data Storage & Privacy

- Read-only polling of the APIs you configured. No telemetry, no tracking, nothing is sent anywhere else.
- Tokens live only in SecretStorage, never in settings files. Accounts and groups live in your user settings (`actionsBoardDuo.*`), which you can edit or back up directly.

<a id="en-roadmap"></a>
### 🧭 Roadmap

- Bamboo (Data Center) adapter — stage 1 continues with a second CI service on the same board.
- GitHub Pages two-stage tracking (carried over from the Chrome edition's design).

<a id="en-license"></a>
### 📄 License

MIT — see [LICENSE](LICENSE).

---

<a id="japanese"></a>
## 日本語

**ActionsBoard-Duo** は、ActionsBoard（もともと Chrome 拡張版）の VS Code 版です。GitHub Actions を監視して、「順調にいっているか」を一目で答えるための道具です。

盤面はアクティビティバーの静かなツリーです: **アカウント（サーバ）→ グループ → ワークフロー → ブランチ別ラン → ジョブ**。順調な間は開く必要はありません。第1層の眺めは常駐のステータスバー項目が担い（成功/失敗/実行中の件数と、不通のサーバを独立に数えた件数）、失敗・不通・復旧は通知で知らせます。

これは「-Duo」です。「-Solo」が単体で完結し完全ローカルであるのに対し、「-Duo」は何かと組になって働きます。ここでは、あなたが設定した CI サーバです。連携は最小限かつ読み取り専用に保ちます。設定した API へのポーリングだけで、それ以外は何もしません。トークンは SecretStorage のみに置き、設定ファイルには書きません。

現在のバージョン: **v0.1.14**

---

<a id="ja-key-features"></a>
### 💡 特長

- **ツリー専用の盤面** — アカウント、グループ、ワークフロー、ブランチ別ラン、ランの中のジョブ（マトリクスの内訳を含む）。成功の行は静かに、失敗は行頭の印で示します。
- **スコープのフィルター** — タイトルバーの「すべて / 自分の / 興味がある」に加え、星を付けたものだけを表示するモード（対象を含まないグループやサーバは丸ごと隠れます）。
- **展開セレクター** — 「エラーのみ展開」（初期表示）、「実行中も展開」、「すべて展開」、「すべて畳む」。手動で開閉を変えると、その旨が表示に出ます。
- **シンボルの印** — ★ は「興味がある」（行で付け外しできます）。人の印は、最新の実行に自分のアカウントが起こしたものが含まれること（実行者との一致で自動判定）。
- **ステータスバーの要約** — 常駐。成功/失敗/実行中のグリフと件数に加え、不通のサーバを独立の件数として並べます（通常は0）。不通をビルド失敗に数えることはありません。クリックで盤面が開きます。
- **サーバの死活監視** — アカウントごとに、ビルド取得とは別周期で疎通を確認します。到達可/認証エラー/到達不可を区別し、到達できないサーバの行は「不通」の見た目（最終確認時刻つき）に切り替わり、復旧したら復旧の印が出ます。
- **通知** — ビルド失敗、サーバの不通、復旧（不通と復旧は個別にオフ可。失敗通知は「すべて / 自分だけ / 星つきだけ」に範囲を絞れます）。
- **アカウント** — GitHub / GitHub Enterprise Server のアカウントを複数登録（PAT + API ベースURL）。接続テストつき。自分のログイン名は自動取得し、「自分の」の判定に使います。
- **グループ** — リポジトリを跨いで、ワークフローを目的別に束ねます。追加はリポジトリからの一括追加のみ: リポジトリのワークフロー一覧を取得し、監視するものにチェックを入れて追加します。ワークフローの表示名は、取得でき次第 GitHub 上のワークフロー名になります（初回取得まではファイル名）。ワークフローごとに星を付けられます。
- **一画面の設定フォーム** — アカウント、グループ、ワークフロー、ポーリング、通知を1ページにまとめ、保存（適用）ボタンで反映します。逐次ウィザードは使いません。
- **見るだけ** — 再実行やキャンセルの操作は持ちません。眺めるための道具です。

<a id="ja-how-to-use"></a>
### 🚀 使い方

1. 拡張機能をインストールし、アクティビティバーの ActionsBoard-Duo アイコンを開きます。
2. 設定（ビュータイトルの歯車）を開き、アカウントを追加します: 名前、API ベースURL（`https://api.github.com`、GitHub Enterprise Server は `https://<ホスト>/api/v3`）、アクセストークン。「接続テスト」で確認できます。
3. グループを追加してアカウントを選び、ワークフローを追加します（リポジトリから一括追加）。
4. 保存を押すとポーリングが始まり、ツリーとステータスバーに状態が出ます。
5. 気になるワークフローに星を付け、タイトルバーのフィルターと展開セレクターで見え方を整えます。

<a id="ja-commands"></a>
### ⌨️ コマンド

- **更新** — ビルドと死活を今すぐ取得。
- **スコープを切り替え（すべて / 自分の / 興味がある）** — スコープフィルターの循環切り替え。
- **興味があるものだけ表示 / 全体を表示** — 表示モードの切り替え。
- **エラーのみ展開 / 実行中も展開 / すべて展開 / すべて畳む** — 展開セレクター。
- **設定を開く（アカウント・グループ・ワークフロー）** — 一画面の設定フォーム。

<a id="ja-settings"></a>
### 🔧 設定

ポーリングの既定は、表示中30秒/非表示300秒、死活確認は120秒です。いずれも `actionsBoardDuo.*` で変更できます。アカウントとグループはユーザー設定に保存されます（トークンは除く）。トークンは SecretStorage のみに置きます。

<a id="ja-requirements"></a>
### 📋 動作環境

- VS Code 1.90 以降。
- 監視する GitHub / GitHub Enterprise Server アカウントごとのアクセストークン（Actions の読み取り権限で十分です）。

<a id="ja-privacy"></a>
### 🔒 データの保存とプライバシー

- 設定した API への読み取り専用ポーリングのみ。テレメトリもトラッキングもなく、他のどこへも送信しません。
- トークンは SecretStorage のみに置き、設定ファイルには書きません。アカウントとグループはユーザー設定（`actionsBoardDuo.*`）に保存されるので、直接編集やバックアップができます。

<a id="ja-roadmap"></a>
### 🧭 ロードマップ

- Bamboo（Data Center）アダプタ — 第1段の続きとして、同じ盤面に2つ目の CI サービスを並べます。
- GitHub Pages の2段階追跡（Chrome 版の設計からの継承）。

<a id="ja-license"></a>
### 📄 ライセンス

MIT — [LICENSE](LICENSE) を参照してください。
