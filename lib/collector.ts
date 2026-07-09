import { promises as fs, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import type { LogEntry } from './storage';
import { getLogs, saveLogs } from './storage';

// claude-notion-logger（logger.py）のローカル収集＋要約ロジックを移植したもの。
// Notion を経由せず、~/.claude/projects の jsonl を解析し `claude -p` で要約して
// Notion と同じ形式（タイトル/日付/プロジェクト/SessionId/時間帯/本文）の LogEntry を作る。

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const META_FILE = path.join(process.cwd(), 'data', '_collect-meta.json');

const CLAUDE_CANDIDATES = [
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
];
const DEFAULT_MIN_MESSAGES = 4;
const DEFAULT_BACKFILL_DAYS = 5;
const MAX_TRANSCRIPT_CHARS = 400_000;

interface Session {
  sessionId: string;
  title: string;
  project: string;
  transcript: string;
  msgCount: number;
  started: Date;
  ended: Date;
}

interface Group {
  key: string; // メンバー集合から決定的に作る重複判定キー
  title: string;
  project: string;
  transcript: string;
  msgCount: number;
  started: Date;
  ended: Date;
}

// ---- claude -p 実行 ----
function findClaude(): string {
  for (const c of CLAUDE_CANDIDATES) if (existsSync(c)) return c;
  return 'claude';
}

export function runClaude(prompt: string, timeoutMs = 300_000): Promise<string | null> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(findClaude(), ['-p', '--output-format', 'text'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        // ホーム直下で実行し、このプロジェクトの .claude/(hook・command)や
        // bootstrap の system-reminder 等が要約プロンプトに混ざるのを避ける。
        cwd: os.homedir(),
      });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(null);
    }, timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() || null : null);
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ---- 日付ユーティリティ（ローカルタイム） ----
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function parseTs(ts: unknown): Date | null {
  if (typeof ts !== 'string' || !ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- メッセージ本文抽出（thinking は除外、tool_use/result は要約） ----
function extractText(message: any): string {
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const blk of content) {
    if (!blk || typeof blk !== 'object') continue;
    const t = blk.type;
    if (t === 'text') {
      parts.push(String(blk.text ?? '').trim());
    } else if (t === 'tool_use') {
      const inp = blk.input ?? {};
      const desc = inp.description || inp.command || inp.file_path || '';
      parts.push(`[tool: ${blk.name ?? '?'}] ${String(desc).slice(0, 120)}`);
    } else if (t === 'tool_result') {
      let raw: any = blk.content ?? '';
      if (Array.isArray(raw)) {
        raw = raw.map((b: any) => (b && typeof b === 'object' ? (b.text ?? '') : '')).join(' ');
      }
      raw = String(raw).trim().replace(/\n/g, ' ');
      if (raw) parts.push(`[result] ${raw.slice(0, 200)}`);
    }
  }
  return parts.filter(Boolean).join('\n');
}

// ---- jsonl 再帰探索 ----
async function findJsonl(dir: string): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await findJsonl(full)));
    else if (e.isFile() && e.name.endsWith('.jsonl')) result.push(full);
  }
  return result;
}

// ---- セッション収集（指定日に活動のあったセッション） ----
export async function collectSessions(targetDate: string, minMessages: number): Promise<Session[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const sessions: Session[] = [];
  const files = await findJsonl(PROJECTS_DIR);

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (localDateStr(stat.mtime) < targetDate) continue; // 対象日より前は中身を見ずにスキップ
    } catch {
      continue;
    }

    let title: string | null = null;
    let project: string | null = null;
    const sessionId = path.basename(file, '.jsonl');
    const lines: { dt: Date; role: string; text: string }[] = [];

    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      let d: any;
      try {
        d = JSON.parse(s);
      } catch {
        continue;
      }
      const typ = d.type;
      if (typ === 'ai-title' && d.aiTitle) {
        title = d.aiTitle;
        continue;
      }
      if (typ !== 'user' && typ !== 'assistant') continue;
      const dt = parseTs(d.timestamp);
      if (!dt || localDateStr(dt) !== targetDate) continue;
      if (!project && d.cwd) {
        project = path.basename(d.cwd);
        if (d.gitBranch) project += ` (${d.gitBranch})`;
      }
      const text = extractText(d.message ?? {});
      if (text) lines.push({ dt, role: typ, text });
    }

    if (lines.length < minMessages) continue;
    lines.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    const transcript = lines
      .map((l) => `### ${l.role === 'user' ? 'ユーザー' : 'Claude'} (${hhmm(l.dt)})\n${l.text}`)
      .join('\n\n');

    sessions.push({
      sessionId,
      title: title || '(無題セッション)',
      project: project || '(不明)',
      transcript,
      msgCount: lines.length,
      started: lines[0].dt,
      ended: lines[lines.length - 1].dt,
    });
  }

  sessions.sort((a, b) => a.started.getTime() - b.started.getTime());
  return sessions;
}

// ---- グループ化 ----
function buildGroup(label: string, items: Session[]): Group {
  const sorted = [...items].sort((a, b) => a.started.getTime() - b.started.getTime());
  const ids: string[] = [];
  const projects: string[] = [];
  const parts: string[] = [];
  for (const s of sorted) {
    ids.push(s.sessionId);
    if (!projects.includes(s.project)) projects.push(s.project);
    const head = `# セッション ${s.sessionId.slice(0, 8)} | ${s.project} | ${s.title} (${hhmm(s.started)}–${hhmm(s.ended)})`;
    parts.push(`${head}\n\n${s.transcript}`);
  }
  let transcript = parts.join('\n\n---\n\n');
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = '(注: ログが長いため古い部分を省略)\n\n' + transcript.slice(-MAX_TRANSCRIPT_CHARS);
  }
  const key = 'g' + crypto.createHash('md5').update([...ids].sort().join(',')).digest('hex').slice(0, 16);
  const projectLabel =
    projects.slice(0, 3).join(' / ') + (projects.length > 3 ? ` 他${projects.length - 3}` : '');
  return {
    key,
    title: label,
    project: projectLabel,
    transcript,
    msgCount: sorted.reduce((n, s) => n + s.msgCount, 0),
    started: sorted[0].started,
    ended: sorted.reduce((m, s) => (s.ended > m ? s.ended : m), sorted[0].ended),
  };
}

function groupByProject(sessions: Session[]): Group[] {
  const buckets = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!buckets.has(s.project)) buckets.set(s.project, []);
    buckets.get(s.project)!.push(s);
  }
  return [...buckets.entries()]
    .map(([project, items]) => buildGroup(project, items))
    .sort((a, b) => a.started.getTime() - b.started.getTime());
}

const CLUSTER_PROMPT = `以下は本日の Claude Code 各セッションの概要リストです。
内容の「テーマ」ごとにセッションをグループ分けしてください。

重要な方針:
- テーマ分けの基準は「扱っている対象(プロダクト/アプリ/システム/プロダクト名)」。
  対象が少しでも異なれば別テーマにする。迷ったら「分ける」を選ぶ。
- 別のフォルダ/プロジェクトでも、扱う対象が同じなら1つのテーマにまとめる。
- 例外: 数メッセージ程度の極小の補助作業は独立テーマにせず最も関連する主テーマに吸収してよい。
- title フィールドはそのセッションの主題を表す重要な手がかり。優先して判断材料にする。
- すべてのセッション番号を、必ずどれか1つのテーマに含める(重複・欠落なし)。

出力は次の形式の JSON のみ。前置き・説明・コードフェンスは一切付けないこと:
{"themes": [{"name": "短い日本語のテーマ名", "sessions": [0, 2]}]}

--- セッション一覧 ---
{listing}
--- ここまで ---`;

async function clusterByTheme(sessions: Session[]): Promise<Group[] | null> {
  if (sessions.length <= 1) return null;
  const listing = sessions
    .map((s, i) => `[${i}] project=${s.project} | title=${s.title} | ${s.transcript.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n');
  const out = await runClaude(CLUSTER_PROMPT.replace('{listing}', listing), 120_000);
  if (!out) return null;
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let themes: any[];
  try {
    themes = JSON.parse(m[0]).themes;
    if (!Array.isArray(themes)) return null;
  } catch {
    return null;
  }
  const used = new Set<number>();
  const result: Group[] = [];
  for (const th of themes) {
    const name = String(th?.name ?? '(無題テーマ)').trim();
    const idxs = (th?.sessions ?? []).filter(
      (i: unknown) => typeof i === 'number' && i >= 0 && i < sessions.length,
    );
    const members = idxs.filter((i: number) => !used.has(i)).map((i: number) => sessions[i]);
    idxs.forEach((i: number) => used.add(i));
    if (members.length) result.push(buildGroup(name, members));
  }
  const leftover = sessions.filter((_, i) => !used.has(i));
  if (leftover.length) result.push(buildGroup('その他', leftover));
  return result.length ? result.sort((a, b) => a.started.getTime() - b.started.getTime()) : null;
}

const SUMMARY_PROMPT = `あなたは開発者の作業ログをまとめるアシスタントです。
以下は Claude Code での「同一テーマの当日分」の会話ログです。
複数セッションが \`---\` 区切りで連結されている場合があります。
これらを1つの作業としてまとめ、日本語で「作業ログ」をMarkdownでまとめてください。

次の見出し構成を必ず使ってください(該当内容がなければ「特になし」と書く):

## やったこと
(必須。事実ベースで具体的に箇条書き。変更したファイル名・関数名・コマンド名・設定キー等の固有名詞を必ず入れる。
 「改善した」等の曖昧表現は禁止。ログから確認できた事実のみ。)

## なんのためにやったのか
(任意。目的・背景)

## なぜその方法にしたのか
(任意。技術選定・判断の理由)

## 詰まったことと解決方法
(任意。エラーやハマった点と解決)

## 成果
(任意。完成したもの・結果)

注意:
- 簡潔に。冗長なツール出力やノイズは含めない。推測で埋めずログから読み取れる事実のみ。
- 出力はMarkdown本文のみ。前置きや「承知しました」等は不要。
- 毎回自動挿入される定型のフック/ルール文(project-bootstrap・sprint分解・TDD・並列Claude運用の説明、
  system-reminder / UserPromptSubmit hook additional context、skill/ツールの一般的な使い方説明)は
  その日の実作業ではないので要約に一切含めない。

--- 会話ログここから ---
{transcript}
--- 会話ログここまで ---`;

function summarize(transcript: string): Promise<string | null> {
  return runClaude(SUMMARY_PROMPT.replace('{transcript}', transcript));
}

// ---- メタ（日ごとの署名: 変化なしの日の再要約を避ける） ----
async function readMeta(): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await fs.readFile(META_FILE, 'utf-8');
  } catch (err: unknown) {
    // ファイルが無いときだけ空メタ。それ以外は握り潰さず投げる。
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // 破損メタを空扱いにすると全日を再要約するだけで実害は小さいが、
    // 一応壊れたファイルを退避してから空メタを返す（storage.ts と同方針）。
    try {
      await fs.rename(META_FILE, `${META_FILE}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    return {};
  }
}
async function writeMeta(meta: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(META_FILE), { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}
function daySignature(sessions: Session[]): string {
  return sessions
    .map((s) => `${s.sessionId}:${s.msgCount}`)
    .sort()
    .join(',');
}

export interface CollectResult {
  logs: LogEntry[];
  collected: number; // 今回 claude -p で要約した件数
  changedDays: number;
}

/**
 * 直近 backfillDays 日を走査し、変化のあった日だけ claude -p で要約して
 * data/logs.json（キャッシュ）を更新する。LogEntry id は `${groupKey}:${date}`。
 */
export async function collectLogs(
  opts: { backfillDays?: number; minMessages?: number } = {},
): Promise<CollectResult> {
  const backfillDays = opts.backfillDays ?? DEFAULT_BACKFILL_DAYS;
  const minMessages = opts.minMessages ?? DEFAULT_MIN_MESSAGES;

  const cache = await getLogs();
  const byId = new Map(cache.map((e) => [e.id, e]));
  const meta = await readMeta();

  const today = new Date();
  let collected = 0;
  let changedDays = 0;

  for (let i = 0; i < backfillDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const date = localDateStr(d);

    const sessions = await collectSessions(date, minMessages);
    const sig = daySignature(sessions);
    if (sessions.length === 0) {
      meta[date] = sig;
      continue;
    }
    if (meta[date] === sig) {
      console.log(`[collect] ${date}: 変化なし、スキップ`);
      continue; // この日は前回から変化なし → キャッシュ済みを使う
    }
    changedDays++;
    console.log(`[collect] ${date}: ${sessions.length} セッション → テーマ分け中…`);

    const groups = (await clusterByTheme(sessions)) ?? groupByProject(sessions);
    console.log(`[collect] ${date}: ${groups.length} テーマ → 要約中…`);

    // この日の既存キャッシュを一旦退避し、グループを作り直す。
    for (const id of [...byId.keys()]) {
      if (id.endsWith(`:${date}`)) byId.delete(id);
    }

    for (const g of groups) {
      const id = `${g.key}:${date}`;
      const prev = cache.find((e) => e.id === id);
      let body: string;
      if (prev && prev.msgCount === g.msgCount && prev.body) {
        body = prev.body; // 内容が変わっていないグループは再要約しない
      } else {
        body = (await summarize(g.transcript)) ?? prev?.body ?? '(要約に失敗しました)';
        if (!prev || prev.msgCount !== g.msgCount) collected++;
      }
      byId.set(id, {
        id,
        title: g.title,
        date,
        project: g.project,
        sessionId: g.key,
        period: `${hhmm(g.started)}–${hhmm(g.ended)}`,
        body,
        createdAt: new Date().toISOString(),
        msgCount: g.msgCount,
      });
    }
    meta[date] = sig;

    // 日ごとに逐次保存（長時間実行が途中で止まっても進捗を残す）。
    await saveLogs([...byId.values()]);
    await writeMeta(meta);
    console.log(`[collect] ${date}: 完了（${groups.length} 件保存）`);
  }

  const merged = [...byId.values()];
  await saveLogs(merged);
  await writeMeta(meta);
  return { logs: merged, collected, changedDays };
}
