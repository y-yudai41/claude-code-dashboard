// アプリ全体で共有する型の正本。
// このファイルは「型だけ」を置き、fs 等の Node モジュールを一切 import しないこと。
// （'use client' のコンポーネントからも安全に import type できるようにするため。）

// 作業ログは claude-notion-logger が Notion に書く形式と同一にする。
// data/logs.json は Notion からの同期キャッシュとして使う（手動入力はしない）。
export interface LogEntry {
  id: string; // Notion ページ id（再同期時の重複防止キー）
  title: string; // タイトル（セッションのテーマ名）
  date: string; // 日付（YYYY-MM-DD）
  project: string; // プロジェクト（作業ディレクトリ + git ブランチ）
  sessionId: string; // SessionId
  period: string; // 時間帯（例 09:51–18:29）
  body: string; // 本文（Markdown 要約）
  createdAt: string; // 収集時刻
  msgCount?: number; // 内部用: 当日グループの再要約要否判定（表示には使わない）
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string; // ISO8601
  kind?: 'task' | 'group'; // 'group' は複数タスクをまとめる見出し行。未指定は 'task'（後方互換）。
}

// Slack 風の自分宛 DM メッセージ。スレッドは parentId で表現する。
export interface Message {
  id: string;
  text: string;
  createdAt: string; // ISO8601
  editedAt?: string; // 編集時刻（あれば「編集済み」表示）
  parentId?: string; // セットされていればスレッド返信。未指定はトップレベル投稿。
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD（ファイル名先頭から推定）
  preview: string;
}

// 成果（プロジェクト単位のサマリ）。毎日のセッションログとは別物で、
// 「このプロジェクトで全体として何をやったか」を手動指示で書き残す。
export interface Achievement {
  id: string;
  project: string; // プロジェクト名（一覧の見出し）
  period: string; // 期間（例 2026 Q1–Q2）。任意なので空文字可。
  body: string; // 本文（Markdown 要約）
  createdAt: string; // ISO8601
}
