# AGENTS.md

このファイルは、本リポジトリで作業を行うAIエージェント向けの開発・運用ガイドラインです。

## 📌 バージョン更新およびリリースルール（必須）

コードやドキュメント（VSIXに含まれる全ファイル）に修正・機能拡張・不具合修正を行う際、**必ず適切なバージョン昇格（インクリメント）を行うこと**。

- **マイナーバージョン (`X.Y.Z` -> `X.(Y+1).0`)**: 新機能の追加、既存機能の拡張、仕様変更
- **パッチバージョン (`X.Y.Z` -> `X.Y.(Z+1)`)**: 不具合修正、軽微なUI調整、`README.md` などのパッケージ包含ドキュメントの更新

※例外：`.vscode/`, `.github/`, `scripts/`, `.gitignore` 等のVSIXパッケージ外の開発用設定・ドキュメントのみの更新は昇格不要。

`package.json` の `version`、`package-lock.json`、`README.md`（バッジと本文の表記）、`CHANGELOG.md`（`## [X.Y.Z] - YYYY-MM-DD` 見出し、英語の箇条書きの後に日本語）を揃えること。整合は `npm run check-version` で検証する。

## 🔒 設計原則（Duo の約束）

- **読み取り専用連携**: ネットワーク通信は、利用者が設定した CI サーバへのポーリング（GET）のみ。送信・トラッキング・テレメトリは行わない。再実行やキャンセルのような操作系も持たない（見る道具に徹する）。
- **トークンは SecretStorage**: PAT は settings.json に書かせない。設定にはアカウントの { id, name, baseUrl } だけを置き、実物は SecretStorage に保管する。設定のエクスポート/インポートにトークンを含めない。
- **不通は失敗に数えない**: サーバの死活はビルド取得とは別周期で確認し、到達可/認証エラー/到達不可を区別する。不通のサーバ配下の状態は古い状態を現在として見せず、「不通」＋最終確認時刻で示す。
- **依存ゼロ**: 実行時依存パッケージを持たない。VS Code API と Node 標準のみ。
- **軽さ**: ポーリングは表示中/非表示で間隔を変え、同じワークフローの重複取得をしない。死活確認は1周期1アカウント1リクエスト。

## 🏗️ プロジェクト構成

- `src/extension.ts` — 拡張ホスト: コマンド、ツリービューの配線、展開セレクター、ビュー見出しの状態表示
- `src/board.ts` — 取得エンジン: ビルド取得、死活確認、通知、状態の保持
- `src/treeProvider.ts` — CIボードのツリー（アカウント → グループ → ワークフロー → ブランチ別ラン → ジョブ）
- `src/statusBar.ts` — 常駐のステータスバー要約（成功/失敗/実行中＋不通は独立の件数）
- `src/settingsPanel.ts` / `media/settings.js` / `media/settings.css` — 一画面の設定フォーム（Webview、適用モデル）
- `src/store.ts` — 設定の読み書き、SecretStorage のトークン、死活状態の永続化
- `src/net.ts` — 取得層（GET のみ、絶対タイムアウト）
- `src/core/` — 純粋モジュール（vscode に依存させない）: 状態の正規化、GitHub REST の解釈、ブランチ別ランの選択、スコープ絞り込み、ステータスバー集計、死活の状態遷移、設定の入出力
- `src/test/` — `src/core/` の単体テスト（node:test）

## ⚙️ 開発コマンド

```bash
npm run compile   # 版チェック + 型チェック + esbuild バンドル
npm test          # tsc で out/ にコンパイルして node --test
npm run package   # 本番バンドル（vsce package で VSIX 化）
```

## 📝 コーディング規約

- 言語は TypeScript（strict）。ビルドは esbuild で `dist/extension.js` にバンドルする。
- `src/core/` は `vscode` に依存させない（単体テスト可能に保つ）。
- ユーザー向け文字列は package.nls.json / package.nls.ja.json（マニフェスト分）と src/i18n.ts（実行時分）に置く。
- README / CHANGELOG の体裁はシリーズ共通の型に従う（英語→日本語）。
- 公開文書で「職場」とは書かない（必要なら「他環境」）。
