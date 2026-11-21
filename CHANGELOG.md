# Changelog

## [0.1.10] - 2026-11-21

### Changed

- **The settings form's watched-workflows table no longer presents repository identity as something to type.** The heading now reads "監視対象ワークフロー" in Japanese. Owner and repo are shown together as one plain-text "Repository" column (`owner/repo`), and the workflow file is plain text too — since workflows are added by repository discovery, these values are always filled automatically and were never meant to be edited by hand. The alias field, the star checkbox, and the remove button are unchanged, and the saved data is exactly as before.

### 日本語

- **設定画面の監視対象ワークフロー表で、リポジトリの情報が入力するものには見えないようにしました。** 見出しを「監視対象ワークフロー」に改めました。owner と repo は「リポジトリ」列に `owner/repo` の形でテキスト表示にまとめ、ワークフローファイルもテキスト表示にしました。ワークフローはリポジトリから追加する方式のため、これらの値は常に自動で入るもので、手入力するものではありませんでした。別名の入力、星のチェック、削除ボタンは従来どおりで、保存されるデータにも変更はありません。

## [0.1.9] - 2026-11-21

### Fixed

- **The "No jobs recorded" row no longer reads as part of an error.** The placeholder sat directly under a failed run's red icon with no mark of its own, so it looked like an error detail — hard to reconcile with the workflow above showing success. The row now carries a gray info icon, marking it as "no information here, unrelated to success or failure". A placeholder for an actual jobs fetch failure keeps a yellow warning icon, so a real problem still stands apart.

### 日本語

- **「ジョブはありません」の行が、エラーの一部には見えないようにしました。** 失敗したランの赤いアイコンのすぐ下に、印のないまま表示されていたため、エラーの詳細のように読めてしまい、上の階層のワークフローが成功を示していることと理解がつながりませんでした。この行にグレーの情報アイコンを付け、「ここには情報がないだけであり、成否とは無関係」だと分かるようにしました。ジョブの取得そのものに失敗した場合の行は、黄色の警告アイコンのままにして、本当の問題とは区別がつくようにしています。

## [0.1.8] - 2026-11-21

### Fixed

- **A run with no jobs no longer says "no runs yet".** Expanding a run whose jobs list is empty — which legitimately happens when a run fails at startup before any job is created — showed the placeholder "no runs yet" under it. Under a failed run that read as if the run itself had never happened, contradicting its failure state. The jobs level now has its own text, "No jobs recorded". The workflow row's "no runs yet" (for a workflow with no runs at all) is unchanged.

### 日本語

- **ジョブがないランの下に「実行はまだありません」と出ないようにしました。** 起動直後に失敗してジョブが作られなかったランなど、ジョブ一覧が空になる正当なケースで、展開すると「実行はまだありません」と表示されていました。失敗したランの下では「そのラン自体がまだ実行されていない」ように読め、失敗の状態と矛盾して見えます。ジョブ階層専用の文言「ジョブはありません」に変えました。ワークフロー行の「実行はまだありません」（ランが1件もない場合）は従来どおりです。

## [0.1.7] - 2026-11-21

### Changed

- **The star button on a workflow row now shows the row's state.** The inline button used to render the same outline star whether the workflow was starred or not, so there was no way to tell the state from the button — and clicking a row that had been starred in the settings form silently removed the star. Unstarred rows now show an outline star that adds the star, and starred rows show a filled star that removes it; the two actions set the state explicitly instead of toggling it blind.

### 日本語

- **ワークフロー行の星ボタンが、その行の状態を表すようになりました。** これまでは星の有無にかかわらず輪郭だけの星が表示され、ボタンからは状態が分かりませんでした。設定フォームで星を付けた行を押すと、気づかないうちに星が外れてしまうこともありました。星がない行では輪郭の星（押すと付ける）、星がある行では塗りつぶしの星（押すと外す）にし、付け外しは状態を見て明示的に設定する形にしました。

## [0.1.6] - 2026-11-21

### Changed

- **Tree rows no longer repeat the status as a word.** Each workflow, run and job row already shows a status icon, and the same meaning written out next to it (a green check plus "Success") only ate into the narrow panel width. The descriptions now keep just the information the icon cannot say — marks, branch and time on workflow rows; title, actor and time on run rows; the failed step on job rows — and the status word stays one hover away in the tooltip. Account rows keep their "Unreachable" / "Auth error" texts: those describe exceptional states, not the icon.

### 日本語

- **ツリーの行で、状態を言葉で繰り返さないようにしました。** ワークフロー・ラン・ジョブの各行には状態アイコンがあり、その横に「成功」など同じ意味の言葉が並ぶのは、狭いパネルの幅を圧迫するだけでした。説明欄にはアイコンでは伝わらない情報だけを残し（ワークフロー行はマーク・ブランチ・時刻、ラン行はタイトル・実行者・時刻、ジョブ行は失敗したステップ）、状態の言葉はツールチップで確認できる形に寄せました。アカウント行の「不通」「認証エラー」は例外状態の説明なので、そのまま残しています。

## [0.1.5] - 2026-11-21

### Fixed

- **No more bogus "auth error" right after saving settings.** Pressing Save wrote the configuration before the tokens, and the resulting configuration-change event triggered an immediate liveness/build check that still used the old (or missing) token — so the tree briefly showed an authentication error and fetch errors, as if the settings had failed. Tokens are now written first, and the check that the configuration change triggers is held back while a save is in progress; the first check after a save runs once, after every write has landed, with the correct token. Editing settings.json directly still triggers an immediate check, as before.

### 日本語

- **設定を保存した直後に「認証エラー」と出る問題を直しました。** 保存時に設定がトークンより先に書かれ、その設定変更をきっかけに走る死活確認・ビルド取得が、古い（または未保存の）トークンのままで実行されてしまい、設定に失敗したような印象になっていました。トークンを先に書くようにし、保存の最中は設定変更に伴う即時チェックを抑えることで、保存後の初回チェックは、すべての書き込みが終わった後に正しいトークンで1回だけ走るようになりました。settings.json を直接編集した場合の即時チェックは従来どおりです。

## [0.1.4] - 2026-11-21

### Changed

- **Settings form: Save now has a Cancel partner, centred as a pair.** The lone Save button sat at the left edge of the form footer and looked out of place. Save and Cancel now sit side by side in the centre of the footer. Cancel discards every unsaved edit — including typed-but-unsaved tokens and accounts marked for removal — and restores the form to the last-saved state; the panel stays open. The form remains Apply-model: nothing is written until Save is pressed.

### 日本語

- **設定フォームの「保存（適用）」に「キャンセル」を対にして、中央に並べました。** フッターの左端に保存ボタンだけがあると変な印象だったためです。キャンセルは、入力途中のトークンや削除予定のアカウントを含む未保存の編集をすべて破棄し、最後に保存した状態にフォームを戻します。パネルは閉じません。フォームは引き続き適用モデルで、保存を押すまで何も書き込まれません。

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
