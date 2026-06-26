---
description: 質問内容について自分(Claude Code)が技術ブログ記事を書き、ダッシュボードに保存する
---

`$ARGUMENTS` の内容について、**あなた(Claude Code)自身が**日本語の技術ブログ記事を Markdown で執筆し、
ローカルのダッシュボードに保存してください。**Anthropic APIキーは不要**です（このセッションが書きます）。

## 手順

1. 以下の構成で記事本文を作成する（Claude Codeを使う開発者向け）:
   ```
   # タイトル
   ## 概要
   ## 原因・仕組み
   ## 解決策・やり方
   ## まとめ
   ```

2. slug を `YYYY-MM-DD-{英数字のスラッグ}` 形式で決める（例: `2026-06-26-what-is-serena`）。

3. ダッシュボードAPI（pattern②: 直接保存）に保存する。`npm run dev` 起動中なら:
   ```bash
   curl -sS -X POST http://localhost:3000/api/posts \
     -H "Content-Type: application/json" \
     -d "$(jq -nc --arg slug "$SLUG" --arg content "$CONTENT" '{slug:$slug, content:$content}')"
   ```
   （`$SLUG` と `$CONTENT` に上で作った値を入れる）

4. 保存した slug を表示する。記事は「ブログ記事」タブに反映される。

## サーバーが起動していない場合（鍵もサーバーも不要のフォールバック）

`.md` ファイルを直接書いてもよい（ダッシュボードは次回表示時に読み込む）:
`~/Desktop/my-app/claude-code-dashboard/posts/{slug}.md` に記事本文を書き込む。
