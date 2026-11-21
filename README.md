# ActionsBoard-Duo

[![Version](https://img.shields.io/badge/version-v0.2.5-blue.svg)](package.json)
[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version/masanori-satake.actionsboard-duo.svg?label=Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=masanori-satake.actionsboard-duo)
[![Open VSX](https://img.shields.io/open-vsx/v/masanori-satake/actionsboard-duo?label=Open%20VSX)](https://open-vsx.org/extension/masanori-satake/actionsboard-duo)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/masanori-satake/ActionsBoard-Duo)](https://github.com/masanori-satake/ActionsBoard-Duo/releases)

<p align="center">
  <strong>Language / 言語:</strong> <a href="#english">English</a> | <a href="#japanese">日本語</a>
</p>

---

<a id="english"></a>
## English

**ActionsBoard-Duo** watches your CI so you can tell at a glance whether everything is running smoothly. It works with GitHub Actions and Bamboo (Data Center).

The board is a tree in the Activity Bar: **account (server) → group → workflow or plan → runs and builds → jobs**. You rarely need to open it. The status bar always shows how many of the newest runs succeeded, failed, or are still running. A notification tells you when a build fails, when a server stops responding, and when it comes back.

The name ends in "-Duo" because the extension works together with your CI servers. (The "-Solo" series works entirely on its own, locally.) The connection is read-only: the extension polls the servers you configure and never changes anything on them. Tokens are stored only in SecretStorage, never in settings files.

Current version: **v0.2.5**

---

<a id="en-key-features"></a>
### 💡 Key Features

- **Two CI services** — GitHub Actions (github.com and GitHub Enterprise Server) and Bamboo (Data Center), side by side on the same board.
- **A tree you can read at a glance** — account → group → workflow or plan → runs → jobs, matrix jobs included. Each row's icon shows its state, and a workflow's colour comes from its newest run.
- **Status bar summary** — the counts of success, failure, and running across everything you watch, always visible. Servers that cannot be reached are counted separately, never as build failures. Click the item to open the board.
- **Filters** — show All, only Mine (runs your account started), or only Starred. A separate toggle shows starred entries only and hides everything else, groups included.
- **Expansion buttons** — open failures only, failures and running, everything, or collapse everything. Each button keeps one fixed icon whatever the current state: a plus in a square for Expand All, a minus in a square for Collapse All.
- **Marks** — ★ marks entries you star (toggle it with the star button on the row). A person mark appears on a GitHub workflow when its newest runs include one your account started. Bamboo builds do not say who started them, so plans never get the person mark.
- **GitHub Pages** — when a workflow's newest run succeeds and its repository publishes a Pages site, the row also shows the deployment state (deploying / deployed / deployment failed), so you can follow the site update after the green run.
- **Server health** — each account is checked on its own schedule, separate from build polling. The board tells apart "reachable", "authentication error", and "unreachable". While a server is unreachable, its rows say so and show when it last answered; when it answers again, a recovery mark appears for a while.
- **Notifications** — for build failures, server outages, and recoveries. Outage and recovery can each be turned off. Failure notifications can be limited to all, mine, or starred.
- **Groups** — bundle workflows and plans across repositories and projects by purpose: one group for releases, one for the services you look after, and so on.
- **Drag to reorder** — drag a workflow or plan to change its order, or to move it into another group of the same account. Drag a group to reorder groups. The order is saved to settings and used everywhere, including the settings form.
- **One settings screen** — accounts, groups, polling, and notifications on a single page. Nothing is applied until you press Save. Cancel closes the page and discards your edits.
- **Watching only** — no re-run and no cancel buttons. The extension never writes to your CI servers.

<a id="en-how-to-use"></a>
### 🚀 How to Use

1. Install the extension, then click the ActionsBoard-Duo icon in the Activity Bar.
2. Click the gear in the view title to open Settings, and add an account:
   - Pick the service: GitHub or Bamboo.
   - GitHub: the API base URL — `https://api.github.com`, or `https://<host>/api/v3` for GitHub Enterprise Server — and a personal access token that can read Actions.
   - Bamboo: the server's base URL (for example `https://bamboo.example.com`) and a personal access token.
   - "Test connection" checks the URL and token, and shows the name it signed in as.
3. Add a group and choose its account.
4. Add what to watch, in the panel below the groups. Pick the group to add to, then: for GitHub, paste the repository's URL, list its workflows, and tick the ones you want; for Bamboo, list the server's plans and tick the ones you want. New entries start out starred.
5. Press Save. Polling starts, the tree fills in, and the status bar shows the counts.
6. Shape the view: star the entries you care about, use the filter and expansion buttons in the view title, and drag rows to reorder them.

<a id="en-commands"></a>
### ⌨️ Commands

- **Refresh** — fetch builds and server health now.
- **Scope: All / Scope: Mine / Scope: Starred** — the scope filter. There is one button per state in the view title, and the current state is shown filled.
- **Show Starred Only / Show All** — switch the display mode.
- **Expand Failures Only / Expand Running Too / Expand All / Collapse All** — the expansion buttons. Their icons do not change with the current state.
- **Open Workflow Page in Browser / Open Plan in Browser** — on a row's right-click menu; opens that workflow or plan on its server.
- **Open Settings (Accounts, Groups, Workflows)** — the one-screen settings form.

<a id="en-settings"></a>
### 🔧 Settings

Builds are fetched every 30 seconds while the board is visible and every 300 seconds while it is hidden. Server health is checked every 120 seconds. You can change all three on the settings screen or in settings JSON (`actionsBoardDuo.pollIntervalVisibleSeconds`, `actionsBoardDuo.pollIntervalHiddenSeconds`, `actionsBoardDuo.livenessIntervalSeconds`).

Accounts and groups are stored in your user settings (`actionsBoardDuo.accounts`, `actionsBoardDuo.groups`), so you can read, edit, and back them up as JSON. Tokens are not in there — they are kept in SecretStorage only.

<a id="en-requirements"></a>
### 📋 Requirements

- VS Code 1.90 or later.
- For each account, a personal access token with read access: Actions read access for GitHub, and a token for a user who can view the plans for Bamboo.

<a id="en-privacy"></a>
### 🔒 Data Storage & Privacy

- Read-only. The extension fetches from the servers you configured with GET requests. It never posts, re-runs, or cancels anything.
- No telemetry and no tracking. The only requests it makes are to your own CI servers.
- Tokens live only in SecretStorage. They never appear in settings files, and nothing exports them.

<a id="en-roadmap"></a>
### 🧭 Roadmap

- More CI services on the same board — GitLab CI and Jenkins are under study (stage 2).

<a id="en-license"></a>
### 📄 License

MIT — see [LICENSE](LICENSE).

---

<a id="japanese"></a>
## 日本語

**ActionsBoard-Duo** は、CI が順調に回っているかを一目で確かめるための拡張機能です。GitHub Actions と Bamboo（Data Center）に対応します。

盤面はアクティビティバーのツリーです: **アカウント（サーバ）→ グループ → ワークフロー／プラン → 実行・ビルド → ジョブ**。普段は開く必要はありません。ステータスバーには、監視中の最新の実行について、成功・失敗・実行中の件数が常に出ます。ビルドが失敗したとき、サーバに届かなくなったとき、復旧したときは、通知で知らせます。

名前の「-Duo」は、CI サーバと組になって働くという意味です（「-Solo」シリーズは単体で、完全ローカルに動きます）。サーバへは読み取りだけです。設定したサーバを定期的に取得しに行くだけで、サーバ側のものを変更することはありません。トークンは SecretStorage のみに置き、設定ファイルには書きません。

現在のバージョン: **v0.2.5**

---

<a id="ja-key-features"></a>
### 💡 特長

- **2つの CI サービス** — GitHub Actions（github.com と GitHub Enterprise Server）と Bamboo（Data Center）を、同じ盤面に並べて見られます。
- **一目で読めるツリー** — アカウント → グループ → ワークフロー／プラン → 実行 → ジョブ（マトリクスの内訳を含む）。行のアイコンが状態を示し、ワークフローの色は最新の実行で決まります。
- **ステータスバーの要約** — 監視中の成功・失敗・実行中の件数が常に出ます。届かないサーバは別の件数として数え、ビルド失敗には数えません。クリックすると盤面が開きます。
- **フィルター** — 「すべて」「自分の（自分のアカウントが起こした実行）」「興味がある」の切り替えと、星を付けたものだけを表示する切り替え（それ以外はグループごと隠れます）。
- **展開ボタン** — エラーだけ開く、実行中も開く、すべて開く、すべて畳む。アイコンは状態によって変わりません（すべて開くは四角に「+」、すべて畳むは四角に「−」）。
- **印** — ★ は星を付けたもの（行の星ボタンで付け外しできます）。人の印は、GitHub のワークフローで、最新の実行に自分のアカウントが起こしたものが含まれるときに付きます。Bamboo のビルドには「誰が起こしたか」の情報がないため、プランに人の印は付きません。
- **GitHub Pages** — ワークフローの最新の実行が成功し、そのリポジトリが Pages を公開している場合、行にデプロイの状態（デプロイ中／デプロイ完了／デプロイ失敗）も出ます。緑になったあと、サイトの更新が終わるまでを見届けられます。
- **サーバの死活** — アカウントごとに、ビルド取得とは別の周期で確認します。「到達可」「認証エラー」「到達不可」を区別します。届かない間は、行にその旨と、最後に応答した時刻が出ます。復旧すると、しばらくの間、復旧の印が出ます。
- **通知** — ビルド失敗、サーバの不通、復旧。不通と復旧は個別にオフにできます。失敗通知は「すべて／自分だけ／星つきだけ」に範囲を絞れます。
- **グループ** — リポジトリやプロジェクトを跨いで、目的別に束ねられます（リリース用、担当サービス用など）。
- **ドラッグで並べ替え** — ワークフローやプランをドラッグして、順序を変えたり、同じアカウントの別グループへ移したりできます。グループ自体の並べ替えもできます。順序は設定に保存され、設定フォームでも同じ順序で出ます。
- **一画面の設定** — アカウント、グループ、ポーリング、通知を1ページで編集します。「保存」を押すまで反映されません。「キャンセル」で閉じると、変更は破棄されます。
- **見るだけ** — 再実行やキャンセルのボタンはありません。サーバへ書き込むことはありません。

<a id="ja-how-to-use"></a>
### 🚀 使い方

1. 拡張機能をインストールし、アクティビティバーの ActionsBoard-Duo アイコンを開きます。
2. ビュータイトルの歯車から設定を開き、アカウントを追加します。
   - サービスの種類で GitHub か Bamboo を選びます。
   - GitHub: API ベースURL（`https://api.github.com`、GitHub Enterprise Server は `https://<ホスト>/api/v3`）と、Actions を読み取れるアクセストークン。
   - Bamboo: サーバのベース URL（例: `https://bamboo.example.com`）とアクセストークン。
   - 「接続テスト」を押すと、URL とトークンを確認し、サインインできた名前を表示します。
3. グループを追加し、アカウントを選びます。
4. 監視するものを追加します。グループの下にあるパネルで追加先のグループを選び、GitHub はリポジトリの URL を貼ってワークフロー一覧を取得し、見たいものにチェックを入れます。Bamboo は、サーバのプラン一覧を取得し、見たいものにチェックを入れます。追加したものには最初から星が付きます。
5. 「保存」を押すと取得が始まり、ツリーとステータスバーに状態が出ます。
6. 見え方を整えます。気になるものに星を付け、タイトルバーのフィルターと展開ボタンを使い、行をドラッグして並べ替えます。

<a id="ja-commands"></a>
### ⌨️ コマンド

- **更新** — ビルドとサーバの死活を今すぐ取得します。
- **スコープ: すべて／スコープ: 自分の／スコープ: 興味がある** — スコープフィルター。状態ごとにタイトルバーのボタンがあり、現在の状態は塗りつぶしで示されます。
- **興味があるものだけ表示／全体を表示** — 表示モードの切り替え。
- **エラーのみ展開／実行中も展開／すべて展開／すべて畳む** — 展開ボタン。アイコンは状態によって変わりません。
- **ワークフローのページをブラウザで開く／プランをブラウザで開く** — 行の右クリックメニューから、そのワークフローやプランのページをサーバ側で開きます。
- **設定を開く（アカウント・グループ・ワークフロー）** — 一画面の設定フォーム。

<a id="ja-settings"></a>
### 🔧 設定

ビルドの取得は、盤面の表示中が30秒ごと、非表示の間が300秒ごとです。サーバの死活確認は120秒ごとです。いずれも設定画面か、設定 JSON（`actionsBoardDuo.pollIntervalVisibleSeconds`、`actionsBoardDuo.pollIntervalHiddenSeconds`、`actionsBoardDuo.livenessIntervalSeconds`）で変更できます。

アカウントとグループはユーザー設定（`actionsBoardDuo.accounts`、`actionsBoardDuo.groups`）に保存されるので、JSON のまま読んだり、編集したり、バックアップしたりできます。トークンはそこには入っていません。SecretStorage のみに置きます。

<a id="ja-requirements"></a>
### 📋 動作環境

- VS Code 1.90 以降。
- アカウントごとに、読み取り権限のアクセストークン（GitHub は Actions の読み取り、Bamboo はプランを見られるユーザのトークン）。

<a id="ja-privacy"></a>
### 🔒 データの保存とプライバシー

- 読み取りだけです。設定したサーバへ GET で取得しに行くだけで、投稿、再実行、キャンセルなどはしません。
- テレメトリもトラッキングもありません。リクエストの送信先は、設定した自分の CI サーバだけです。
- トークンは SecretStorage のみに置きます。設定ファイルに出ることはなく、トークンを含む書き出し機能もありません。

<a id="ja-roadmap"></a>
### 🧭 ロードマップ

- 同じ盤面への CI サービスの追加 — GitLab CI と Jenkins を検討中です（第2段）。

<a id="ja-license"></a>
### 📄 ライセンス

MIT — [LICENSE](LICENSE) を参照してください。
