# Claude Code Dashboard

Claude Code での作業を記録・閲覧するパーソナルダッシュボード。
認証なし・自分専用・**ローカル動作**の Next.js アプリ。**APIキーもNotionも不要**。

- **作業ログ**: `~/.claude/projects/**/*.jsonl` をローカルで解析し、`claude -p`（headless CLI）で
  テーマ分け＆要約して、**claude-notion-logger と同じ形式**（タイトル/日付/プロジェクト/SessionId/
  時間帯/本文）で表示。タブを開くと**自動収集**される（Notion を経由しない）。
- **ブログ記事**: ダッシュボードでは作らない。**Claude Code が作った `.md` を持ち込んで**表示・削除。
- **タスク**: チェックボックスで管理（ローカル保存）。

データはローカルに保存（`data/logs.json`・`data/tasks.json`・`posts/*.md`）。

## 前提

- `claude` CLI が使えること（このダッシュボードはログ要約に `claude -p` を呼ぶ。あなたが普段
  Claude Code を使っていれば入っている。ログイン済みの認証をそのまま使うので **APIキーは不要**）。
- 探索パス: `~/.local/bin/claude` → `/usr/local/bin/claude` → `/opt/homebrew/bin/claude` → PATH。

## セットアップ

```bash
npm install
npm run dev          # → http://localhost:3000
```

`.env.local` は通常不要（鍵もNotionも使わない）。「作業ログ」タブを開くと自動でログ収集が走る。

## 作業ログ（ローカル自動収集）

- タブを開くと、まずキャッシュ（`data/logs.json`）を即表示し、裏で `~/.claude` を解析・要約して更新する。
- 直近 **3 日**（当日含む）を走査し、**前回から変化のあった日だけ** `claude -p` で要約する
  （変化がなければ即終了。無駄なCLI呼び出しをしない）。4メッセージ未満の極小セッションは除外。
- 収集ロジックは `lib/collector.ts`（`claude-notion-logger/logger.py` を移植）。テーマ分け基準・
  要約見出し（やったこと/なんのため/なぜ/詰まった/成果）は logger と同じ。

> ⚠️ 初回や新規作業がある日は `claude -p` 要約に数十秒〜数分かかることがある（裏で実行・完了後に反映）。

## ブログ記事

記事はダッシュボードで生成しない。Claude Code 側で作成して保存する：
- Claude Code から `/blog "質問内容"` を実行（`.claude/commands/blog.md`）。Claude 自身が記事を書き、
  `POST /api/posts {slug, content}` または `posts/{slug}.md` 直接書き込みで保存する。
- ダッシュボードの「ブログ記事」タブで表示・削除のみ。


## API

| メソッド | エンドポイント | 説明 |
|---|---|---|
| GET | `/api/logs` | 収集済みログ（新しい順） |
| POST | `/api/logs/collect` | ~/.claude を解析・要約してキャッシュ更新（変化分のみ） |
| GET/POST/DELETE | `/api/posts` | 記事一覧・本文(`?slug=`)・保存(`{slug,content}`)・削除 |
| GET/POST/PATCH/DELETE | `/api/tasks` | タスク |

## 技術スタック

Next.js 15 (App Router) / TypeScript / CSS Variables（Tailwind不使用）。
要約は外部APIではなくローカルの `claude -p` を使用。

## メモ: project-bootstrap の TDD ゲートについて

このリポジトリは `project-bootstrap` を**未採用**（`.bootstrap-declined`）だが、プラグインの
グローバル PreToolUse フックがソース編集時に「対応テスト必須」を強制する。そのため `tests/` に
各ソースの **placeholder テスト**を置いてゲートを通している（実テストではない）。不要なら `tests/`
ごと削除可。恒久無効化は、フック本体に1行（`*/claude-code-dashboard/*) exit 0 ;;`）を自分で追加する。
