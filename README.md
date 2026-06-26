# Claude Code Dashboard

Claude Code での作業を記録・閲覧するパーソナルダッシュボード。
**ローカル動作・自分専用・認証なし**の Next.js アプリ。**API キー不要**。

`~/.claude` に貯まる Claude Code のセッションログを解析し、`claude -p`（headless CLI）で
テーマ分け＆要約して一覧表示する。あわせて簡単なブログ記事ビューアとタスク管理を備える。

## 機能

- **作業ログ** — `~/.claude/projects/**/*.jsonl` をローカルで解析し、`claude -p` で
  セッションごとに要約（やったこと / なんのため / なぜ / 詰まった / 成果）して表示。
  タブを開くと自動で収集される。
- **ブログ記事** — ダッシュボードでは生成しない。`posts/*.md` を持ち込んで表示・削除。
- **タスク** — チェックボックスで管理（ローカル保存）。

データはすべてローカルに保存される（`data/logs.json` / `data/tasks.json` / `posts/*.md`）。
これらは `.gitignore` 済みでリポジトリには含まれない。

## ⚠️ ローカル専用（重要）

このアプリは **localhost で動かす前提** で、API には認証もレート制限もない。
**公開サーバー（Vercel 等）にそのままデプロイしないこと。** デプロイすると、URL を知った誰でも
`/api/tasks` などを叩いてデータを削除・改ざんできる。公開したい場合は、先に認証
（Basic 認証 / middleware でのトークン検証など）を必ず追加する。

## 前提

- `claude` CLI が使えること（ログ要約に `claude -p` を呼ぶ。普段 Claude Code を使っていれば
  入っている。ログイン済みの認証をそのまま使うので **API キーは不要**）。
- CLI 探索パス: `~/.local/bin/claude` → `/usr/local/bin/claude` → `/opt/homebrew/bin/claude` → PATH。

## セットアップ

```bash
npm install
npm run dev          # → http://localhost:3000
```

`.env.local` は不要。「作業ログ」タブを開くと自動でログ収集が走る。

## 作業ログの収集動作

- タブを開くと、まずキャッシュ（`data/logs.json`）を即表示し、裏で `~/.claude` を解析・要約して更新する。
- 直近 **3 日**（当日含む）を走査し、**前回から変化のあった日だけ** `claude -p` で要約する
  （変化がなければ即終了し、無駄な CLI 呼び出しをしない）。4 メッセージ未満の極小セッションは除外。
- 収集ロジックは `lib/collector.ts`。

> ⚠️ 初回や新規作業がある日は `claude -p` の要約に数十秒〜数分かかることがある（裏で実行し、完了後に反映）。

## ブログ記事（持ち込み）

記事はダッシュボードでは生成しない。`posts/{slug}.md` に Markdown を置くか、
`POST /api/posts {slug, content}` で保存すると一覧に表示される。タブからは表示・削除のみ。

## API

| メソッド | エンドポイント | 説明 |
|---|---|---|
| GET | `/api/logs` | 収集済みログ（新しい順） |
| POST | `/api/logs/collect` | `~/.claude` を解析・要約してキャッシュ更新（変化分のみ） |
| GET/POST/DELETE | `/api/posts` | 記事一覧・本文（`?slug=`）・保存（`{slug, content}`）・削除 |
| GET/POST/PATCH/DELETE | `/api/tasks` | タスクの取得・追加・更新・削除 |

## 技術スタック

Next.js 15 (App Router) / React 19 / TypeScript / CSS Variables（Tailwind 不使用）。
要約は外部 API ではなくローカルの `claude -p` を使用。
