# Changelog

## [0.1.3] - 2026-11-21

### Changed

- **Settings form: the Data section is gone.** Export / Import / Reset have been removed from the form, along with the corresponding commands. Accounts and groups live in your user settings (`actionsBoardDuo.*`), which you can edit and back up directly; tokens remain in SecretStorage only, as before.
- **Settings form: workflows are added from a repository only.** The "Add from URL" and "Add manually" flows have been removed — the free-form methods were too unconstrained and confusing. Repository discovery (list a repository's workflows, check the ones to watch, add) is the single way in.
- **Settings form: the add-from-repository area is now its own panel.** It has a visible border and its "Add from repository" heading inside the group card, so it is clear where a new repository's workflows get added — and that they land in that group.
- **Settings form: selects size to their content.** Dropdowns such as the failure-notification scope no longer stretch across the full form width.
- **Settings form: account cards carry a heading.** Each account card now starts with the account's name (or "(Unnamed account)"), so several registered accounts read as distinct entries at a glance.

### 日本語

- **設定フォームから「データ」セクションをなくしました。** エクスポート/インポート/すべてリセットを、対応するコマンドごと削除しました。アカウントとグループはユーザー設定（`actionsBoardDuo.*`）に保存されているので、直接編集やバックアップができます。トークンは従来どおり SecretStorage のみです。
- **設定フォームのワークフロー追加は、リポジトリからの一括追加だけにしました。** 「URL から追加」と「手動で追加」は、自由度が高すぎて設定時に戸惑うため削除しました。リポジトリのワークフロー一覧を取得し、監視するものにチェックを入れて追加する、という一つの方法に絞っています。
- **設定フォームの「リポジトリから追加」に区切りを付けました。** グループカードの中に、枠線と「リポジトリから追加」の見出しを持つ専用パネルとして独立させました。新しいリポジトリのワークフローをどこから追加するのか、そのグループに入ることも、分かりやすくなります。
- **設定フォームのプルダウンを内容に合った幅にしました。** 「失敗通知の範囲」などがフォームの幅いっぱいに広がらなくなります。
- **設定フォームのアカウントカードに見出しを付けました。** 各カードの先頭にアカウント名（空のときは「（名前なしアカウント）」）が出るので、アカウントが複数あっても、それぞれが独立した登録だと一目で分かります。

## [0.1.2] - 2026-11-21

### Fixed

- **Unnamed groups no longer look like numbers.** A group whose name was left empty rendered in the tree with an empty label, so only its workflow count showed — a group with 11 workflows appeared to be named "11". Empty or whitespace-only group names now display a localised placeholder, "(Unnamed group)", in the tree. This is a display-only change: stored settings are untouched, and naming a group remains optional.

### 日本語

- **名前のないグループが数字のように見える問題を直しました。** グループ名を空のままにすると、ツリーでラベルが空になり、ワークフローの件数だけが表示されていました（11件のグループが「11」という名前のように見えていました）。空、または空白のみのグループ名は、ツリーで「（名前なしグループ）」と表示されるようになりました。表示だけの変更で、保存されている設定は変わりません。グループ名は引き続き任意です。

## [0.1.1] - 2026-11-21

### Fixed

- **Title bar decluttered.** The four expansion buttons (failures only / running too / expand all / collapse all) used look-alike glyphs and crowded the view title bar. They are now consolidated into a single "Switch Expansion" button that cycles through the four modes in order; the individual commands remain available from the Command Palette. The title bar now carries five buttons: refresh, scope, display mode, expansion, settings.
- **View message is one line.** The board's message showed the current state plus the ★ / person mark legend on extra lines, permanently taking vertical space. It now shows only the one-line state (scope · display · expansion, including "adjusted manually"); the legend remains in the settings form and in row tooltips.

### 日本語

- **タイトルバーを整理しました。** 展開の4ボタン（エラーのみ/実行中も/すべて展開/すべて畳む）は似た形のグリフで並び、タイトルバーを圧迫していました。1つの「展開を切り替え」ボタンにまとめ、クリックで4つのモードを順に切り替えるようにしました。個別のコマンドはコマンドパレットから引き続き使えます。タイトルバーのボタンは、更新・スコープ・表示モード・展開・設定の5つになりました。
- **ビューのメッセージを1行にしました。** 状態表示に加えて ★/人の印の凡例まで常時表示され、縦の場所を取っていました。今は状態（スコープ · 表示 · 展開。「手動で調整中」も含みます）の1行だけを表示します。凡例は設定フォームと行のツールチップに残しています。

## [0.1.0] - 2026-11-21

### Added

- **First release (GitHub Actions only).** A tree-only CI board in the Activity Bar: account (server) → group → workflow → branch runs → jobs inside a run, including matrix breakdowns.
- **Status bar summary, always present.** Glyphs and counts for success / failure / running, with unreachable servers as their own count (normally 0) — an outage is never counted as a build failure. Clicking the item opens the board.
- **Scope filters and display mode.** Title-bar filters for All / Mine / Starred, plus a starred-only display mode that hides everything else, including groups and servers with nothing starred.
- **Expansion selectors.** Failures only (the initial state), Running too, Expand all, Collapse all; manual adjustments are shown as such.
- **Symbol marks.** ★ for starred workflows (toggle on the row), a person mark when the newest runs include one started by your own account (matched automatically from the run actor). Tooltips and the settings form carry the legend.
- **Server liveness monitoring.** Per-account probes on their own cycle, separate from build polling. Reachable / auth error / unreachable are kept distinct; unreachable servers switch their rows to an "unreachable" presentation with the last-confirmed time, and a recovery marker appears on return. Outage and recovery notifications are on by default and can each be switched off.
- **Notifications** for build failures, with scope (all / mine / starred).
- **Accounts and groups.** Multiple GitHub / GitHub Enterprise Server accounts (PAT + API base URL) with connection tests and automatic login fetch; groups bundle workflows across repositories; workflows are added by repository discovery, by pasting a GitHub Actions URL, or manually; aliases per workflow.
- **One-screen settings form** (Apply model) for accounts, groups, workflows, polling intervals and notifications. Tokens live only in SecretStorage; settings export/import (JSON) never includes them.

### 日本語

- **初回リリース（GitHub Actions のみ）。** アクティビティバーのツリー専用 CI ボード: アカウント（サーバ）→ グループ → ワークフロー → ブランチ別ラン → ランの中のジョブ（マトリクスの内訳を含む）。
- **常駐のステータスバー要約。** 成功/失敗/実行中のグリフと件数に、不通のサーバを独立の件数（通常は0）として並べます。不通をビルド失敗に数えることはありません。クリックで盤面が開きます。
- **スコープのフィルターと表示モード。** タイトルバーの「すべて / 自分の / 興味がある」に加え、星を付けたものだけを表示するモード（対象を含まないグループやサーバは丸ごと隠れます）。
- **展開セレクター。** 「エラーのみ展開」（初期表示）、「実行中も展開」、「すべて展開」、「すべて畳む」。手動で調整するとその旨が表示されます。
- **シンボルの印。** ★ は興味がある（行で付け外し）、人の印は最新の実行に自分のアカウントが起こしたものが含まれること（実行者との一致で自動判定）。ツールチップと設定フォームに凡例があります。
- **サーバの死活監視。** ビルド取得とは別周期で、アカウントごとに疎通を確認します。到達可/認証エラー/到達不可を区別し、到達できないサーバの行は「不通」の見た目（最終確認時刻つき）に切り替わり、復旧時には復旧の印が出ます。不通/復旧の通知は既定でオン、個別にオフできます。
- **ビルド失敗の通知。** 範囲は「すべて / 自分だけ / 星つきだけ」から選べます。
- **アカウントとグループ。** GitHub / GitHub Enterprise Server のアカウントを複数登録（PAT + API ベースURL、接続テストとログイン名の自動取得つき）。グループはリポジトリを跨いでワークフローを束ねます。追加方法はリポジトリから一括、URL 貼り付け、手動入力の3通り。ワークフローごとに別名を付けられます。
- **一画面の設定フォーム**（適用モデル）で、アカウント、グループ、ワークフロー、ポーリング間隔、通知を扱います。トークンは SecretStorage のみ。設定のエクスポート/インポート（JSON）にトークンは含まれません。
