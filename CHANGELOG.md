# Changelog

## [1.0.0] - 2026-11-21

### Added

- **First public release.** ActionsBoard-Duo is a quiet CI board for VS Code: it shows GitHub Actions and Bamboo (Data Center) build status as a tree in the Activity Bar — account (server) → group → workflow or plan → branch runs and builds → jobs, including matrix breakdowns.
- **Status bar summary, always present.** Glyphs and counts for success / failure / running, with unreachable servers as their own count — an outage is never counted as a build failure. Clicking the item opens the board; when something has failed or a server is unreachable, it opens with the failures expanded.
- **Notifications** for build failures, server outages, and recoveries — outage and recovery can each be switched off, failure notifications can be scoped to all / mine / starred, and authentication errors have their own setting.
- **Server liveness monitoring** on its own cycle, separate from build polling. Reachable / auth error / unreachable stay distinct; while a server is unreachable, its rows say so and show when it last answered, and a recovery marker appears for a while when it answers again.
- **Groups, marks, and filters.** Groups bundle workflows and plans across repositories and projects. Rows carry a ★ mark for starred entries and a ♟ mark when a workflow's newest runs include one started by your own account. Title-bar scope filters (All / Mine / Starred), a starred-only display mode, and expansion presets (failures only, failures and running, expand all, collapse all) keep the board focused.
- **Drag to reorder.** Drag a workflow or plan to reorder it or move it into another group of the same account; drag a group to reorder groups. The order is saved to settings and used everywhere.
- **GitHub Pages tracking.** When a workflow's newest run succeeds and its repository publishes a Pages site, the row also shows the deployment state (deploying / deployed / deployment failed).
- **One-screen settings form** (Apply model) for accounts, groups, watched entries, polling intervals, and notifications. Workflows are added from one shared discovery panel by pasting a repository URL; Bamboo plans are picked from a checklist grouped by project.
- **Read-only by design.** Polling is GET-only — the extension never changes anything on your CI servers and offers no rerun or cancel. Tokens live only in SecretStorage, never in settings files, and there is no tracking or telemetry.

### 日本語

- **初の公開リリース。** ActionsBoard-Duo は、GitHub Actions と Bamboo（Data Center）のビルド状態をアクティビティバーのツリーで示す、静かな CI ボードです: アカウント（サーバ）→ グループ → ワークフロー／プラン → ブランチ別の実行・ビルド → ジョブ（マトリクスの内訳を含む）。
- **常駐のステータスバー要約。** 成功/失敗/実行中のグリフと件数に、不通のサーバを独立の件数として並べます。不通をビルド失敗に数えることはありません。クリックで盤面が開き、失敗や不通があるときは「エラーのみ展開」で開きます。
- **通知。** ビルド失敗・サーバ不通・復旧を通知します。不通と復旧は個別にオフでき、失敗通知の範囲は「すべて / 自分が実行したものだけ / お気に入りだけ」から選べます。認証エラーの通知は独立した設定です。
- **サーバの死活監視。** ビルド取得とは別周期でアカウントごとに確認し、到達可/認証エラー/到達不可を区別します。到達できないサーバの行はその旨と最終確認時刻を示し、応答が戻るとしばらく復旧の印が出ます。
- **グループ・印・フィルター。** グループはリポジトリやプロジェクトを跨いでワークフローとプランを束ねます。行には、お気に入りの ★ と、最新の実行に自分のアカウントが起こしたものが含まれるときの ♟ の印が付きます。タイトルバーのスコープ（すべて / 自分の / お気に入り）、お気に入りだけを表示するモード、展開のプリセット（エラーのみ / 実行中も / すべて展開 / すべて畳む）で、盤面を絞り込めます。
- **ドラッグで並び替え。** ワークフローやプランをドラッグして並び替えたり、同じアカウントの別グループへ移したりできます。グループ自体の並び替えも可能です。順序は設定に保存され、どこでも同じ順序になります。
- **GitHub Pages の追跡。** ワークフローの最新の実行が成功し、そのリポジトリが Pages サイトを公開していると、行にデプロイの状態（デプロイ中 / デプロイ済み / デプロイ失敗）も表示します。
- **一画面の設定フォーム**（適用モデル）で、アカウント、グループ、監視対象、ポーリング間隔、通知を扱います。ワークフローは、リポジトリ URL を貼って使う共用の発見パネルから追加し、Bamboo のプランはプロジェクト別のチェックリストから選びます。
- **読み取り専用が前提です。** ポーリングは GET のみで、CI サーバ側に変更を加えることはなく、再実行やキャンセルもありません。トークンは SecretStorage のみに置き、設定ファイルには書きません。トラッキングやテレメトリもありません。

## [0.3.0] - 2026-11-21

### Security

- **Redirects can no longer carry the token to another host.** Redirects are now followed manually (at most 5 hops): the Authorization header is re-sent only while the target stays on the same host as the previous URL, and is dropped for good after any cross-host hop.
- **Response bodies are capped at 10 MB.** A declared Content-Length over the cap fails the request up front, and the byte count is enforced while the body streams in; an oversized response surfaces like any other failed fetch.
- **Only http/https URLs are usable, and only http/https links are opened.** A stored base URL that does not parse or uses another scheme is coerced to empty when the configuration is read (the settings form's connection test names an unusable URL plainly instead of failing generically), and every open-in-browser path — run rows, the failure notification's button, workflow and plan pages — goes through one shared guard.
- **Stored settings are validated on read.** Malformed account/group entries are coerced or dropped element-wise, duplicate account ids keep the first entry, and totals are capped (50 accounts, 100 groups, 500 watched entries), so a hand-edited settings.json can neither throw inside the tree nor blank the whole board.

### Changed

- **The tree tooltips' mark legend is now as simple as the settings form's.** It reads "Marks: ★ = Favorite · ♟ = Run by you" in both languages, with the pawn glyph instead of a description in words.
- **Authentication errors have their own notification setting.** "Notify on authentication errors" (on by default) replaces riding on the outage notification setting; existing settings without the key behave as on.
- **Wording was unified on "favorite" / 「お気に入り」.** The scope and display-toggle titles and the notification-scope label use it everywhere, and the scope's "mine" option now reads "Only runs I started" / 「自分が実行したものだけ」, matching the run-level check it performs. The settings legend's status line dropped its ✓/✗ glyphs, Japanese parentheses in the form are full-width throughout, and the package description was replaced.
- **Build polling fetches with bounded concurrency (6 in flight)** instead of strictly one entry at a time; the per-entry dedupe and the account skip rules are unchanged, and the resulting states are the same.
- **GitHub Pages checks are spaced out.** While a repository's newest run is unchanged, its Pages deployment is re-checked at most every 5 minutes; a new run always checks immediately.
- **A failed settings save now says so.** The form shows "Saved" only after the host confirms the write; a failure shows the error in place of the success message.

### Fixed

- **Deleted accounts no longer linger as phantom outages.** Reloading the configuration prunes health, workflow states and Pages states to the accounts and entries the config still has, and health is persisted only after pruning — no stale unreachable/auth-error counts in the status bar, and nothing resurrects on restart.
- **Accounts in an authentication-error state are skipped by build polling**, like unreachable ones; liveness probing continues and detects recovery.
- **HTTP 429 backs build polling off** until the server's Retry-After (capped at 15 minutes) or, without one, until the next liveness cycle would run. Liveness still classifies 429 as reachable.
- **Polling intervals are clamped at both ends** — visible 10–3600 s, hidden 30–86400 s, liveness 30–86400 s, with matching maximums in the settings schema; a non-numeric value falls back to the default. An unknown notification scope reads as "all".
- **Bamboo plan discovery pages through the whole plan list** (500 per page, up to 2,000 plans); when the cap cuts the list, the checklist says so.
- **Parser robustness:** null elements inside a job's steps no longer throw; Bamboo results whose id cannot be determined get distinct fallback ids instead of all collapsing to 0 (which collided in tree node ids and the jobs map); workflow page URLs now encode their owner/repo/workflow segments like the API URLs do.

### 日本語

### セキュリティ

- **リダイレクトでトークンが別のホストへ渡らなくなりました。** リダイレクトは自動追従に頼らず、手動で最大5回まで追います。Authorization ヘッダは、転送先が直前の URL と同じホストのときだけ再送し、別ホストへ移った時点でそのリクエストでは二度と送りません。
- **応答本文に 10 MB の上限を設けました。** Content-Length が上限を超える応答は最初から失敗とし、読み取り中もバイト数を数えて超えた時点で中断します。大きすぎる応答は、通常の取得失敗と同じに扱われます。
- **使える URL と開くリンクを http/https だけにしました。** 保存されたベース URL が解釈できない、または http/https 以外のスキームの場合、設定の読み取り時に空へ寄せます（設定フォームの接続テストでは、汎用的な失敗ではなく URL が使えない旨を明示します）。ブラウザで開く経路（実行の行、失敗通知のボタン、ワークフロー／プランのページ）はすべて1つの共通ガードを通ります。
- **保存された設定を、読み取り時に検証するようになりました。** アカウント／グループの要素は1つずつ検証し、不正なものは型を寄せるか落とします。重複したアカウント id は最初の要素を優先し、件数にも上限（アカウント50、グループ100、監視対象は合計500）を設けたので、settings.json を手で編集してもツリーの中で例外が出たり、盤面全体が空になったりしません。

### 変更

- **ツリーのツールチップの凡例を、設定フォームと同じシンプルな形にしました。** 両言語とも「★ = お気に入り · ♟ = 自身が実行」の形で、人の印はポーンの記号で示します。
- **認証エラーの通知が独立した設定になりました。** 「認証エラーを通知」（既定はオン）が、不通通知への便乗に代わります。キーのない既存の設定ではオンとして扱います。
- **文言を「お気に入り」に統一しました。** スコープと表示切替のタイトル、通知範囲の選択肢がすべて「お気に入り」表記になり、通知範囲の「自分の」選択肢は、実装どおりラン単位の判定に合わせて「自分が実行したものだけ」と言い換えました。設定の凡例の状態行からは ✓/✗ の記号を外し、フォームの日本語の括弧は全角に統一し、パッケージの説明文を差し替えました。
- **ビルド取得を上限付きの並行実行（同時6件）にしました。** 従来の1件ずつの直列取得をやめました。要素ごとの重複排除と、アカウント単位のスキップ規則は従来どおりで、結果の状態も同じです。
- **GitHub Pages の確認間隔を空けました。** リポジトリの最新の実行が変わらない間は、Pages デプロイの再確認は最大でも5分に1回です。新しい実行が出れば即座に確認します。
- **設定の保存が失敗したら、その旨が出るようになりました。** フォームの「保存しました」は、ホスト側が書き込みの成功を返したときだけ表示し、失敗時は代わりにエラー文を表示します。

### 修正

- **削除したアカウントが「不通の亡霊」として残らなくなりました。** 設定の再読み込み時に、死活・ワークフローの状態・Pages の状態を、現在の設定に残っているものだけへ剪定し、死活の永続化は剪定の後に行います。ステータスバーに古い不通／認証エラーの件数が残らず、再起動で復活することもありません。
- **認証エラー状態のアカウントを、ビルド取得でもスキップするようになりました**（到達不可と同じ扱い）。死活確認は継続し、復旧を検知します。
- **HTTP 429 の間はビルド取得を休止します。** 休止はサーバの Retry-After（上限15分）まで、無ければ次の死活確認周期までです。死活確認では 429 を従来どおり「到達可」と分類します。
- **ポーリング間隔を両端でクランプしました**（表示中 10〜3600 秒、非表示 30〜86400 秒、死活確認 30〜86400 秒）。設定スキーマにも対応する最大値を入れ、数値でない値は既定値に戻します。不明な通知範囲は「すべて」として読みます。
- **Bamboo のプラン発見が、全プランをページングして取得するようになりました**（1ページ500件、上限2,000件）。上限で打ち切られた場合は、チェックリストにその旨の注記が出ます。
- **パーサの頑健性を上げました。** ジョブのステップ内の null 要素で例外が出なくなりました。id を特定できない Bamboo の結果には、すべて 0 に潰れないよう互いに異なるフォールバック id を付けます（ツリーのノード id とジョブの対応付けの衝突を防ぎます）。ワークフローのページ URL は、API の URL と同じく各要素をエンコードします。

## [0.2.8] - 2026-11-21

### Changed

- **Clicking the status bar summary now opens the board with the failures expanded when something is wrong.** The status bar item has its own click command: it opens the board, and when the counts it displays include a build failure or an unreachable server, it applies the same "expand failures only" expansion as the title-bar button. When everything is healthy, the click only opens the panel and leaves the tree as it is. An authentication error alone does not trigger the expansion.

### 日本語

- **ステータスバーの要約をクリックしたとき、失敗や不通がある場合は「エラーのみ展開」で盤面が開くようになりました。** ステータスバーの項目に専用のクリック動作を持たせました。表示中の件数にビルド失敗か届かないサーバが含まれるときは、タイトルバーのボタンと同じ「エラーのみ展開」がかかります。すべて順調なときは、パネルが開くだけでツリーの展開状態は変わりません。認証エラーだけでは展開はかかりません。

## [0.2.7] - 2026-11-21

### Changed

- **The star toggle moved from an inline row button to the right-click menu.** The ★ toggle on workflow and plan rows was an inline button, and VS Code shows inline buttons on the selected row as well as the hovered one, so a star button sat on rows the pointer was nowhere near. "Add Star / Remove Star" now lives only in the row's right-click menu. The ★ and ♟ marks in the rows still show the state, and the settings form's star checkboxes are unchanged.

### 日本語

- **星の付け外しを、行のボタンから右クリックメニューに移しました。** ワークフローとプランの行にあった星ボタンはインラインボタンで、VS Code の仕様によりホバーした行だけでなく選択中の行にも表示され、ポインタのない行にまで星が出ていました。「星を付ける／星を外す」は行の右クリックメニューだけに移しました。行の ★ と ♟ の印（状態表示）と、設定フォームの星チェックは変わりません。

## [0.2.6] - 2026-11-21

### Fixed

- **"Expand failures only" no longer expands failed runs that have no jobs.** A run that failed before any job started was still expanded, revealing only the "No jobs recorded" placeholder row. The expansion now loads the failed runs' jobs first (the same lazy fetch used when a run is expanded by hand) and expands only the runs that actually have jobs; a jobless failed run stays collapsed, its row still showing under the workflow with its failure icon. Expanding such a run by hand still shows the placeholder, and the other expansion modes are unchanged.

### 日本語

- **「エラーのみ展開」で、ジョブのない失敗した実行まで展開されなくなりました。** ジョブが始まる前に失敗した実行も展開され、「ジョブはありません」のプレースホルダだけが見えていました。今は失敗した実行のジョブを先に読み込み（手動で展開したときと同じ遅延取得です）、実際にジョブのある実行だけを展開します。ジョブのない失敗した実行は折りたたまれたまま、ワークフローの下に失敗アイコン付きの行として残ります。手動で展開すればプレースホルダは従来どおり表示され、ほかの展開モードは変わりません。

## [0.2.5] - 2026-11-21

### Fixed

- **Renaming a group now updates the discovery panel's destination selector immediately.** The shared "add from repository" panel builds its destination options when the form is drawn, so a name typed into a group's name field never appeared there — the group kept showing as "(unnamed group)" until the form was reopened. The matching option's label is now patched in place as you type (no redraw, so the input keeps focus and the selector keeps its current choice). Account renames get the same treatment: the account dropdowns on the group cards follow the name being typed.

### 日本語

- **グループ名の変更が、追加パネルの追加先セレクターにその場で反映されるようになりました。** 共用の「リポジトリから追加」パネルの選択肢はフォーム描画時点の名前で作られていたため、グループ名欄に入力した名前がそこへ出ず、フォームを開き直すまで「（名前なしグループ）」のままになっていました。今は入力に合わせて該当する選択肢の表示だけをその場で書き換えます（再描画しないので、入力欄のフォーカスもセレクターの選択状態も保たれます）。アカウント名の変更も同様に、グループカードのアカウント選択へその場で反映されます。

## [0.2.4] - 2026-11-21

### Changed

- **The "mine" mark is now a chess pawn (♟) instead of the 👤 emoji.** The mark that flags workflows whose newest runs include one started by your account was the literal 👤 emoji, so it alone rendered in colour among the otherwise monochrome symbols. It is now the filled chess pawn ♟ (U+265F), a monochrome person-shaped silhouette that sits naturally next to the filled ★. The mark's meaning and the places it appears (tree rows and the settings legend) are unchanged.

### 日本語

- **「自分の」印を、絵文字の 👤 からチェスのポーン ♟ に変えました。** 最新の実行に自分のアカウントが起こしたものが含まれることを示す印は、文字としての絵文字 👤 が入っていたため、単色の記号の中でここだけ色付きで描画されていました。今は塗りつぶしのチェスのポーン ♟（U+265F）です。人の形をした単色のシルエットで、塗りつぶしの ★ とも並びが合います。印の意味と、出る場所（ツリーの行と設定の凡例）は変わりません。

## [0.2.3] - 2026-11-21

### Changed

- **The expansion buttons no longer turn into a plain ● when active.** Each of the four expansion buttons swapped to a filled-circle icon while its mode was active, which hid what the button does and which mode it belongs to. The buttons now keep one fixed, state-independent icon each: failures stays an error mark, running stays a sync mark, Expand All is a plus in a square, and Collapse All is a minus in a square. The trade-off is accepted: the current expansion mode is no longer marked on the buttons. (The scope buttons keep their filled active icons, which keep the same symbol.)

### 日本語

- **展開ボタンが、選択中でも ● に変わらなくなりました。** 4つの展開ボタンは、自分のモードが選ばれている間は塗りつぶしの丸に差し替わっていましたが、そのボタンの働きも、どのモードのボタンかも分からなくなる表示でした。今はボタンごとに固定のアイコンです。エラーはエラーの印、実行中は同期の印、すべて展開は四角に「+」、すべて折りたたむは四角に「−」で、状態によって変わりません。代わりに、現在の展開モードはボタン上では示されなくなります（スコープのボタンは、同じシンボルのまま塗りつぶしになる従来の示し方を続けます）。

## [0.2.2] - 2026-11-21

### Changed

- **The display toggle now uses a filter icon instead of a star.** The title bar showed two star icons in a row — the scope button "Starred" and the starred-only display toggle — which was easy to misread. The scope star stays; the display toggle is now a filter icon (an outline filter while everything is shown, a filled filter while only starred items are shown), so the two controls no longer look alike.

### 日本語

- **表示トグルのアイコンを、星ではなくフィルターにしました。** タイトルバーには星のアイコンが2つ並んでいました（スコープの「興味がある」と、お気に入りだけを表示する表示トグル）ため、見間違えやすい状態でした。スコープ側の星はそのままに、表示トグルをフィルターのアイコンに変えました（全体を表示しているときは輪郭だけのフィルター、お気に入りだけを表示しているときは塗りつぶしのフィルター）。2つの操作が同じ見た目ではなくなります。

## [0.2.1] - 2026-11-21

### Changed

- **One shared "add" panel for the whole settings form.** Until now every group card carried its own always-open discovery panel, which duplicated the same inputs once per group. The panel now sits once, after the groups section: a destination selector picks which group the ticked items land in (the selector is hidden when there is only one group, and a freshly added group becomes the destination). The panel's contents still follow the destination group's account — workflow discovery for GitHub, the plan checklist for Bamboo — and group cards keep just their name, account, and watched list.
- **Paste the repository URL instead of typing owner and repo.** The GitHub discovery panel now has a single repository field: paste the repository's URL and owner/repo are read out of it. The reading is tolerant — a trailing slash or none, extra path segments after the repo (such as /actions or /blob/...), a .git suffix, the SSH form (git@github.com:owner/repo.git), a bare owner/repo, and surrounding whitespace all work; the host part is ignored, since the account's API base URL decides where requests go. Text that cannot be read as a repository shows an inline explanation and nothing is fetched. Adding ticked workflows no longer creates duplicates of entries already in the group.
- **Notification wording.** The outage/recovery checkboxes now read "service unreachable" / "service recovered" in Japanese (サービス不通を通知 / サービス復旧を通知）, and the failure-notification scope's "mine" option now says 自分が実行したジョブだけ ("Only jobs I ran").
- **A shorter legend.** In the settings form's legend, the star now reads simply ★ = お気に入り (Favorite) and the person mark 👤 = 自身が実行 (Run by you), without the explanatory parentheses.

### 日本語

- **設定フォームの「追加」パネルを、フォーム全体で1つにしました。** これまではグループのカードごとに発見パネルが常時開いて付いていて、同じ入力欄がグループの数だけ並んでいました。今はグループの節の後に1つだけ置き、追加先のグループを選んで（グループが1つだけのときは選択欄自体を出さず、そのグループが追加先になります。新しく作ったグループは追加先になります）、チェックしたものをそこへ追加します。中身は追加先グループのアカウントに従い、GitHub ならワークフローの発見、Bamboo ならプランのチェックリストのままです。グループのカード側には名前・アカウント・監視リストだけが残ります。
- **owner と repo を打つ代わりに、リポジトリの URL を貼る形にしました。** GitHub の発見パネルはリポジトリ欄が1つになり、URL を貼れば owner/repo を読み取ります。読み取りは緩やかで、末尾の「/」の有無、リポジトリの後ろに続くパス（/actions や /blob/... など）、.git の接尾辞、SSH 形式（git@github.com:owner/repo.git）、owner/repo の直書き、前後の空白をどれも受け付けます。ホスト部分は見ません（リクエスト先はアカウントの API ベース URL で決まるため）。リポジトリとして読み取れない文字列では、欄の下に説明を出して取得はしません。チェックしたワークフローの追加では、すでにグループにあるものと同じものは重ねて追加しなくなりました。
- **通知まわりの文言を変えました。** チェックボックスは「サービス不通を通知」「サービス復旧を通知」に、失敗通知の範囲の「自分」の選択肢は「自分が実行したジョブだけ」になりました。
- **凡例を短くしました。** 設定フォームの凡例で、星は「★ = お気に入り」、人の印は「👤 = 自身が実行」とだけ書くようにし、括弧書きの説明を落としました。

## [0.2.0] - 2026-11-21

### Added

- **Bamboo (Data Center) support — the second CI service of stage 1.** An account now has a service kind (GitHub / Bamboo; accounts saved before this release keep working as GitHub). For a Bamboo account, the base URL is the server's base URL and the watched unit is a plan: in the settings form, a Bamboo group's editor lists the server's plans grouped by project, and you tick the ones to watch. Polling reads each plan's latest result plus up to 10 recent results; the tree shows plan → recent builds (build number, state icon, branch when the payload carries one, relative time), and expanding a build loads its stages/jobs with one lazy request — polling never fans out per build. Build rows open the build's page in the Bamboo web UI. Liveness uses the same machinery as GitHub (one light request per account per cycle, confirmation probes, silent baseline, recovery markers), and failure notifications apply under the same scope rules. One deliberate difference: Bamboo result payloads carry no reliable "who started this build", so plans never get the person mark (stars work as usual).
- **GitHub Pages two-stage tracking.** Mirroring the Chrome edition: when a watched workflow's newest run succeeds, the board also checks the repository's Pages deployments in the same poll cycle and shows the state as a quiet suffix on the workflow row — deploying, deployed, or deployment failed — with the site URL in the tooltip. The check runs only for repositories where a fresh success was just seen, and a failed check keeps the previously shown state. One refinement over the Chrome edition, which only distinguished "deliverable" from everything else: a failed deployment is shown as failed instead of reading as "still deploying" forever.
- **Drag to reorder.** Drag a workflow or plan to reorder it within its group, or drop it onto another group of the same account to move it there (dropping on a row inserts before that row; cross-account drops are rejected, since an entry only means something under its own account). Drag a group to reorder groups. The new order is written to the settings arrays, so the settings form shows the same order.

### Changed

- **The view title buttons are reordered, and the expansion buttons sit together.** Rarely used buttons now go to the left and frequent ones to the right: settings (gear) → refresh → scope (All / Mine / Starred) → starred-only toggle → the four expansion buttons, adjacent at the right end. Before this, a second "collapse all" button — the one VS Code itself adds — appeared apart from the extension's expansion group; the built-in button is now off, so the extension's own four buttons form one unbroken group in every state.
- **The README was rewritten for readability.** The whole text, in both English and Japanese: plainer wording, shorter sentences, concrete setup steps for both services, and the 0.2.0 features (Bamboo, Pages tracking, drag reorder) folded in.

### 日本語

- **Bamboo（Data Center）に対応しました — 第1段の2つ目の CI サービスです。** アカウントにサービスの種類（GitHub / Bamboo）が付きました（これまでの設定は GitHub としてそのまま動きます）。Bamboo アカウントでは、ベース URL はサーバのベース URL で、監視の単位はプランです。設定フォームでは、Bamboo のグループの編集でサーバのプラン一覧をプロジェクト別に取得し、見たいものにチェックを入れて追加します。取得は各プランの最新結果＋直近10件までで、ツリーはプラン → 直近のビルド（ビルド番号、状態アイコン、ペイロードに含まれればブランチ名、相対時刻）となり、ビルドを展開したときにだけ、そのステージ／ジョブを1リクエストで読みます（取得のたびにビルドごとのリクエストはしません）。ビルドの行からは Bamboo の Web 画面が開きます。死活確認は GitHub と同じ仕組み（1周期につきアカウントごとに軽いリクエスト1回、確認プローブ、無言のベースライン、復旧の印）で、失敗通知も同じ範囲ルールで効きます。意図的な違いが1つあります。Bamboo の結果ペイロードには「誰が起こしたビルドか」の確かな情報がないため、プランに人の印は付きません（星は通常どおり使えます）。
- **GitHub Pages の2段階追跡を追加しました。** Chrome 版と同じ考え方です。監視ワークフローの最新の実行が成功すると、同じ取得周期の中で、そのリポジトリの Pages デプロイも確認し、状態をワークフローの行に控えめな接尾辞として出します（デプロイ中／デプロイ完了／デプロイ失敗）。サイトの URL はツールチップに出ます。確認は、成功を新しく見たリポジトリについてだけ行い、確認に失敗したときは前に出ていた状態を保ちます。Chrome 版との違いが1つあります。Chrome 版は「公開可能になったか、まだか」の2分法でしたが、こちらではデプロイ失敗を「失敗」と分かる形で出します（いつまでも「デプロイ中」に見えるのを避けるため）。
- **ドラッグで並べ替えられるようになりました。** ワークフローやプランをドラッグして、グループ内での順序を変えたり、同じアカウントの別グループへ移したりできます（行の上に落とすと、その行の前に挿入されます。アカウントを跨ぐ移動は、そのアカウントの下でなければ意味を持たないため受け付けません）。グループ自体の並べ替えもできます。新しい順序は設定の配列に保存されるので、設定フォームでも同じ順序で出ます。
- **ビュータイトルのボタンの並びを変え、展開ボタンをひとまとまりにしました。** あまり使わないボタンを左へ、よく使うボタンを右へ: 設定（歯車）→ 更新 → スコープ（すべて／自分の／興味がある）→ 星だけ表示の切り替え → 展開ボタン4つ（右端に隣り合って）。これまで、VS Code 自身が付ける「すべてを折りたたむ」ボタンが、拡張の展開グループから離れた位置に出ていました。その内蔵ボタンは止めたので、どの状態でも拡張自身の4ボタンが切れ目なく並びます。
- **README を読みやすく全面改稿しました。** 英語・日本語の両方です。言い回しを平たくし、文を短くし、両サービスの設定手順を具体的に書き、0.2.0 の機能（Bamboo、Pages 追跡、ドラッグでの並べ替え）を織り込みました。

## [0.1.16] - 2026-11-21

### Changed

- **Scope and expansion are now one button per state in the view title.** The two cycling buttons ("Switch Scope", "Switch Expansion") were unpredictable: what a press would do was unclear, and jumping straight to a state — or comparing states — took repeated presses. Each scope state (All / Mine / Starred) and each expansion preset (Failures only / Running too / Expand All / Collapse All) now has its own title-bar button, and the current state's button is shown with a filled icon; when the tree has been adjusted by hand, no expansion button shows as current. The tree's state text line is gone — the buttons themselves are the state display now.
- **The settings form's Cancel button now closes the panel.** Cancel used to discard the unsaved edits and rebuild the form in place; it now discards the edits and closes the panel. Save (Apply) is unchanged.
- **The icon now follows the Duo series design.** ActionsBoard-Duo is a "-Duo", but its icon still used the "-Solo" colours. Following the series design guide, it now uses the Duo scheme: a deep blue (#1E4A7A) ground with the coral signal badge at the bottom-right — colour and badge together mark "this one talks to the outside". The bars-and-circles motif is drawn a touch smaller and thinner, with the three rows centred as a group (the middle row on the vertical centre line) and in white only, so the badge is the single accent.

### 日本語

- **スコープと展開が、状態ごとのボタンになりました。** 従来の循環ボタン（「スコープを切り替え」「展開を切り替え」）は、押すと何が起きるか分かりにくく、目的の状態へ一気に移ったり見比べたりするにも何度も押す必要がありました。今はスコープの各状態（すべて / 自分の / 興味がある）と展開の各プリセット（エラーのみ / 実行中も / すべて展開 / すべて畳む）に専用のタイトルバーボタンがあり、現在の状態のボタンは塗りつぶしのアイコンで示されます。ツリーを手動で調整したときは、どの展開ボタンも現在の状態としては示されません。ツリー上部の状態テキスト行は無くなり、状態の表示はボタンが担います。
- **設定フォームの「キャンセル」でパネルが閉じるようになりました。** 従来は未保存の編集を破棄してフォームを作り直していましたが、今は編集を破棄してパネル自体を閉じます。「保存（適用）」は変わりません。
- **アイコンが Duo シリーズのデザインになりました。** ActionsBoard-Duo は「-Duo」ですが、アイコンは「-Solo」の配色（ティール地）のままでした。シリーズのデザインガイドに沿って、深い青（#1E4A7A）の地に右下のコーラルの電波バッジという Duo の配色に変えました。色とバッジの両方で「外部とやり取りする」ことを示します。線と丸のモチーフは、少し小さく・細くし、3行をひとまとまりとして上下中央に置き（2行目が中心線に来ます）、色は白だけにして、アクセントはバッジ1点にしました。

## [0.1.15] - 2026-11-21

### Fixed

- **Switching to "collapsed" now stops an expansion that is still running.** Applying an expansion mode reveals its target runs one by one, and that loop used to run to completion no matter what: switching to the collapsed mode mid-expansion collapsed the tree once, but the still-running loop kept revealing and re-expanding nodes behind it, so the tree grew again. Expansion work is now generation-based — every new expansion instruction supersedes the previous one, the running loop checks before each reveal whether it is still the current instruction and stops immediately when it is not, and switching to collapsed takes effect at once. The expansion modes, the nodes each mode expands, and the reveal order are unchanged.

### 日本語

- **展開の途中で「すべてを折りたたむ」に切り替えても展開が止まらない問題を直しました。** 展開モードの適用は対象のランを1つずつ開いていくため時間がかかりますが、その処理が最後まで止まりませんでした。途中で折りたたむモードに切り替えるとツリーは一度畳まれても、裏で続いている展開処理がノードを開き直し続けて、ツリーがまた伸びていきました。今は展開の指示ごとに世代が進み、実行中の処理は次のノードを開く前に自分が最新の指示かどうかを確認して、そうでなければ即座に止まります。折りたたむモードへの切り替えはその場で効きます。展開モードの種類、各モードが開く対象、開く順序は変わりません。


## [0.1.14] - 2026-11-21

### Fixed

- **No more 復旧 marker after a restart.** The recovery marker is only meaningful for an outage and recovery the user could have witnessed in the current session, but it leaked across restarts two ways: health persisted by a previous session could still carry a marker, and the first (silent baseline) probe of a new session set the marker again when it found a previously unreachable server reachable — so the tree greeted the user with 復旧 even though, from their point of view, nothing had happened. Persisted health now has the marker stripped when it is loaded at startup, and a recovery applied during the baseline cycle applies the reachable state without the marker. Mid-session behaviour is unchanged: a server that goes down and comes back during the same session still shows 復旧.

### Changed

- **The settings form's remove buttons are now red trash-can icons.** The three text "Remove" controls (account, group, workflow row) are icon buttons showing a trash can in the same danger red the text had, with the remove label kept as the tooltip and accessible name. Click behaviour is unchanged.
- **The settings form's add buttons now look like buttons.** "Add account" and "Add group" rendered as plain text and were easy to miss as actions; they — and the discovery panel's "List workflows" and "Add selected" — now have an outline-button look with accent-coloured text, and the add actions carry a leading "+".

### 日本語

- **再起動後に「復旧」と表示される問題を直しました。** 復旧の印は、そのセッションで利用者が見ていられた不通と復旧に対してだけ意味がありますが、2つの経路で再起動を越えて残っていました。前のセッションが保存した死活状態に印が残っている場合と、新しいセッションの最初の（通知を出さない基準決めの）確認で、以前不通だったサーバへの到達が分かったときに印が付き直す場合です。そのため、何も起きていないはずなのにツリーに「復旧」と出ていました。今は、起動時に読み込む保存済みの状態から印を取り除き、基準決めの周期で復旧が分かった場合も、到達可の状態だけを反映して印は付けません。セッションの途中で落ちて戻ったサーバには、従来どおり「復旧」が出ます。
- **設定画面の「削除」を、赤いゴミ箱のアイコンにしました。** アカウント・グループ・ワークフロー行の3つの削除操作は、文字のときと同じ危険色の赤でゴミ箱のシンボルを表示するアイコンボタンになりました。「削除」の文言はツールチップと読み上げ用の名前として残しています。クリック時の動作は変わりません。
- **設定画面の追加ボタンが、ボタンらしく見えるようになりました。** 「アカウントを追加」「グループを追加」はただの文字列のように見えて、押せることに気づきにくい状態でした。これらと、リポジトリから追加の「ワークフロー一覧を取得」「選択したものを追加」に、アクセント色の文字と控えめな枠線のボタンらしい見た目を与え、追加の操作には先頭に「+」を付けました。

## [0.1.13] - 2026-11-21

### Fixed

- **A single failed liveness probe no longer marks a server unreachable.** Right after the editor starts, the network path (proxy/VPN) may not be ready yet, and one failed probe used to flip the account to "unreachable", fire the outage toast, and pause build polling for that account until the next liveness cycle — so a healthy server looked down until a manual Refresh. Entering the unreachable state now takes two consecutive unreachable results: the first failure is held (the displayed state and notifications stay untouched) and an automatic confirmation probe runs about 10 seconds later; only if it also fails is the outage applied and notified. Auth errors (401/403) are deterministic and still apply immediately.
- **The first liveness cycle after startup no longer fires toasts.** It establishes the baseline — state is applied and persisted, so the tree and the status bar show it exactly as before — but outage, recovery and auth-error notifications are suppressed for that one cycle. Later cycles notify exactly as before.

### 日本語

- **死活確認が1回失敗しただけでは、サーバを「不通」にしないようにしました。** エディタ起動直後はプロキシや VPN などの経路がまだ整っておらず、1回の失敗でアカウントが「不通」になって通知が出て、そのアカウントのビルド取得まで次の死活確認周期まで止まってしまい、正常なサーバが落ちているように見えていました。今は到達不可の結果が2回続いた場合にだけ「不通」へ移ります。最初の失敗は保留され（表示も通知も変わりません）、約10秒後に自動でもう一度確認し、それも失敗した場合にだけ「不通」として適用し通知します。認証エラー（401/403）は確定的な結果なので、従来どおり即時に反映します。
- **起動直後の最初の死活確認では、通知を出さないようにしました。** 最初の1周期は基準となる状態を記録するだけとし、状態そのものは適用・永続化されるためツリーとステータスバーの表示は従来どおりですが、不通・復旧・認証エラーの通知だけを抑えます。2周期目以降は従来どおり通知します。

## [0.1.12] - 2026-11-21

### Changed

- **Branch runs other than the workflow's newest run are shown muted.** A workflow row's status colour reflects its newest run overall, but every branch-run row under it used to carry its own full status colour — so an old failed run on a side branch showed a full red ✗ under a green, successful workflow, which read as a contradiction. Now only the newest run keeps its status colour; the other branch runs keep the same status glyph but in gray. Job rows are unchanged.
- **Workflows added via repository discovery now start as favorites.** A workflow the user explicitly picked to watch is registered with the star on, so it shows up under the starred scope and the favorites-only display right away. Existing saved workflows are untouched.
- **The settings form's star column is headed "Favorite" (お気に入り).** The column that toggles each workflow's star was labelled just "Star" / 「星」; it now says what the mark means.
- **The status bar tooltip's Japanese wording for unreachable servers now reads 「サーバ不通」.** The previous 「不通のサーバ」 phrasing was inverted; the counts and the behaviour are unchanged.

### 日本語

- **ワークフロー全体の最新実行以外のブランチ別ランを、淡い表示にしました。** ワークフロー行の状態色は全体の最新実行を表しますが、その下のブランチ別ランは各々が状態色を持っていたため、脇のブランチの古い失敗が、成功しているワークフローの下に赤い ✗ のままで並び、矛盾して見えていました。今は最新実行だけが状態色を持ち、他のブランチ別ランは同じ形のアイコンのままグレーで示します。ジョブ行は従来どおりです。
- **リポジトリから追加したワークフローは、最初から「お気に入り」になりました。** 利用者が選んで監視対象に入れたワークフローには星が付いた状態で登録されるので、星のスコープや「お気に入りだけ」の表示にそのまま現れます。既に保存されているワークフローには影響しません。
- **設定画面の星の列の見出しを「お気に入り」にしました。** ワークフローごとの星を切り替える列は「星」とだけ出ていましたが、その印の意味が分かる文言にしました。
- **ステータスバーのツールチップで、到達できないサーバの日本語表記を「サーバ不通」にしました。** 従来の「不通のサーバ」は語順が不自然だったための文言修正で、件数や動作は変わりません。

## [0.1.11] - 2026-11-21

### Changed

- **Tree rows now show the workflow's own name, not just its file name.** The list-runs response carries the workflow name on every run, so polling captures it and the tree labels each workflow with that name as soon as it is known — no configuration change needed. Until the first successful fetch (or while a workflow has no runs), the file name is shown as before, and the tooltip still lists the file name so the file stays identifiable.
- **The per-workflow alias has been removed.** With the workflow's real name now displayed, a separate hand-written alias is unnecessary. The settings form's workflows table loses the alias column (repository and workflow file as text, star checkbox, remove button only), and the `alias` property is gone from the configuration schema; any `alias` values left in existing settings are simply ignored.
- **The discovery checklist in the settings form is labelled by workflow name too.** After "List workflows", each checkbox shows the workflow's name (with the file name alongside), falling back to the file name alone for workflows that declare no name. What gets saved is still the workflow file, exactly as before — this is label display only.

### 日本語

- **ツリーの表示名が、ファイル名ではなくワークフロー名になりました。** 実行一覧の応答には各実行にワークフロー名が含まれているため、ポーリングのついでにそれを取り込み、判明した時点でツリーの表示名に使います。設定の変更は要りません。初回の取得が成功するまで（および実行が1件もない間）は従来どおりファイル名を表示し、ツールチップにはファイル名も残すので、どのファイルかは引き続き分かります。
- **ワークフローごとの別名（alias）を廃止しました。** ワークフロー名そのものが表示されるようになったため、手書きの別名は不要と判断しました。設定画面の監視対象ワークフロー表から別名の列がなくなり（リポジトリとワークフローファイルのテキスト表示、星のチェック、削除ボタンだけになります）、設定スキーマからも `alias` プロパティを除きました。既存の設定に残っている `alias` の値は、そのまま無視されます。
- **設定画面の「リポジトリから追加」のチェックリストも、ワークフロー名で表示するようにしました。** 「ワークフロー一覧を取得」のあとの各チェックには、ワークフロー名（併せてファイル名）を示し、名前を持たないワークフローではファイル名だけを示します。保存されるのは従来どおりワークフローファイルで、これは表示だけの変更です。

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
