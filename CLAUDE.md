# claude-code-dashboard

Claude Code での作業を記録・管理する**個人専用のローカルダッシュボード**。
Next.js 15 (App Router) / React 19 / TypeScript。認証なし・ローカルファイル保存・単一ユーザー。

## 基本方針
- **個人専用・ローカル前提**。認証やマルチユーザー対応は作らない（意図的に無し）。
- データは外部DBではなく**ローカルファイル**（`data/*.json` と `posts/*.md`）に保存する。
- UI コピー・コメント・コミットメッセージは**日本語**で書く。
- git は**ソロ運用で main に直コミット**。コミットメッセージは日本語＋末尾に
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` を付ける慣習。

## コマンド
- `npm run dev` … 開発サーバ（http://localhost:3000）。現在はこれで起動して閲覧する。
- `npm run build` / `npm run start` … 本番ビルド／本番配信。
- `npm run import-notion` … 旧 Notion からの移行スクリプト（`scripts/migrate-from-notion.ts`、レガシー）。
- テストランナーは未設定（`package.json` に `test` script なし）。

## 構成
- `app/` … App Router。`layout.tsx`（共通シェル）、`page.tsx`（タブ切替）、`globals.css`（ダークテーマ・単一）、`api/*/route.ts`。
- `components/` … 各タブの client パネル（`'use client'`）。
- `lib/storage.ts` … **ストレージ層兼・型の正本**。
- `lib/collector.ts` … 作業ログの自動収集・要約。
- `data/` … JSON データ（`logs.json` / `tasks.json` / `messages.json` / `achievements.json`）。
- `posts/` … ブログ記事の Markdown（`YYYY-MM-DD-slug.md`）。
- `tests/` … 現状は placeholder のみ（後述の TDD ゲート用）。

### タブ（`app/page.tsx`）
| ラベル | key | コンポーネント | データ |
|---|---|---|---|
| 作業ログ | `logs` | `LogsPanel` | `data/logs.json`（自動収集） |
| 成果 | `achievements` | `AchievementsPanel` | `data/achievements.json` |
| ブログ記事 | `posts` | `PostsPanel` | `posts/*.md` |
| タスク | `dm` | `DmPanel` | `data/messages.json`（実体は Slack 風の自分宛 DM/メモ） |

> 補足: 「タスク」タブは以前タスク管理UIだったが DM/メモに作り替えた経緯があり、`app/api/tasks` と `Task` 型は残置されている（現状 UI からは未使用）。

### 作業ログの収集（`lib/collector.ts`）
- `~/.claude/projects` 配下の `*.jsonl` から当日の活動セッションを抽出 → `claude -p` でテーマ分類・要約 → `data/logs.json` に保存。
- `LogsPanel` マウント時に `POST /api/logs/collect` が走る（キャッシュ即表示 → 裏で収集 → 更新）。
- `data/_collect-meta.json` に日次署名を持ち、変化のない日は再要約をスキップ。

### スキル
- `/blog`（`.claude/commands/blog.md`）… 記事を生成して `posts/` に保存。
- `/seika`（`.claude/commands/seika.md`）… プロジェクトの成果をまとめて「成果」タブに保存。

## コーディング規約
- **型は `lib/storage.ts` が正本**（`LogEntry` / `Task` / `Message` / `PostMeta` / `Achievement`）。新規コードは再定義せず参照する方針（一部コンポーネントに歴史的なインライン再定義が残っているが、増やさない）。
- **API ルート**は各 `route.ts` の先頭で `export const runtime = 'nodejs'` と `export const dynamic = 'force-dynamic'` を宣言する。入力は必ず検証し、失敗は `NextResponse.json({ error }, { status })` で返す。
- **ストレージ**は `lib/storage.ts` の read/write ヘルパ経由（`data/` は JSON、記事は `posts/` の `.md`）。
- **タイムスタンプ**は ISO8601（`new Date().toISOString()`）。
- **ブログの slug** はファイル操作前に `isValidSlug`（パストラバーサル対策）で検証する。
- **クライアント状態**は localStorage を補助的に使う（例: お気に入り `ccd-fav-*`、既読 `ccd-read-posts`）。壊れた値を握り潰す try/catch を添える。

## TDD companion-test ゲート（編集時の必須ルール）
このリポジトリには project-bootstrap フックが効いており、**ソースファイル（`components/*.tsx` や `lib/*.ts` など）を Write/Edit する前に対になるテストファイルが無いとブロックされる**。
- 例: `components/Foo.tsx` を作る前に `tests/Foo.test.tsx` を用意する。
- 現状の慣習は **placeholder テスト**（`node:test` の空 test）でゲートを満たす形（テストランナー未導入のため）。
  ```ts
  // project-bootstrap の test-companion gate を満たすための placeholder。
  import { test } from 'node:test';
  test('Foo placeholder', () => {});
  ```
- 既存ファイルの編集は、対の placeholder が既にあればそのまま通る。

## 環境メモ
- ダッシュボードの閲覧は `npm run dev`（:3000）。本番ビルド配信に切り替える場合、コード編集の反映には再ビルドが必要（Fast Refresh は効かない）。
- 作業ログの元データは `~/.claude/projects` の Claude Code セッションログ。別途 `~/claude-notion-logger`（launchd）がログを Notion にも投稿しているが、本アプリの `data/logs.json` は `lib/collector.ts` が独立して生成する。
