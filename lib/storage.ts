import { promises as fs } from 'fs';
import path from 'path';
import type { LogEntry, Task, Message, PostMeta, Achievement } from './types';

// 型の正本は lib/types.ts。内部では import type で受けて使い、
// 既存の「import { …, type X } from '@/lib/storage'」を壊さないよう同じ型を re-export する。
export type { LogEntry, Task, Message, PostMeta, Achievement } from './types';

// ローカルファイル保存のルート。process.cwd() = プロジェクトルート。
const DATA_DIR = path.join(process.cwd(), 'data');
const POSTS_DIR = path.join(process.cwd(), 'posts');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ACHIEVEMENTS_FILE = path.join(DATA_DIR, 'achievements.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// ---- 汎用 JSON 読み書き ----
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch (err: unknown) {
    // ファイルが無いときだけ初期値を返す。
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 破損（パース不能）を黙って空扱いにすると、次の保存で全データが上書き消失する。
    // 壊れたファイルを退避（.corrupt-<timestamp>）して保全した上で初期値を返す。
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      await fs.rename(file, backup);
      console.error(`[storage] 破損した JSON を検知: ${file} → ${backup} に退避しました`);
    } catch {
      /* 退避に失敗しても、少なくとも破損ファイルを上書きしないよう初期値を返す */
    }
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  // 原子書き込み: 同一ディレクトリ内の一時ファイルに書いてから rename で置き換える。
  // rename は同一ファイルシステム内なら原子的なので、書き込み途中でクラッシュしても
  // 本ファイルが半端な JSON に壊れない（一時ファイルが残るだけ）。
  const tmp = `${file}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tmp, file);
  } catch (err) {
    // rename 失敗時は中途半端な一時ファイルを掃除してからエラーを投げる。
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// ---- ログ ----
export async function getLogs(): Promise<LogEntry[]> {
  const logs = await readJson<LogEntry[]>(LOGS_FILE, []);
  // 新しい順（date 降順）
  return [...logs].sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveLogs(logs: LogEntry[]): Promise<void> {
  await writeJson(LOGS_FILE, logs);
}

// ログを1件削除。次回 collect でその日の signature が変わらなければ復活しない
// （変化があった日は再収集で作り直されるため戻りうる）。
export async function deleteLog(id: string): Promise<void> {
  const logs = await readJson<LogEntry[]>(LOGS_FILE, []);
  await writeJson(
    LOGS_FILE,
    logs.filter((l) => l.id !== id),
  );
}

// ---- タスク ----
export async function getTasks(): Promise<Task[]> {
  return readJson<Task[]>(TASKS_FILE, []);
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await writeJson(TASKS_FILE, tasks);
}

// ---- メッセージ（Slack 風 自分 DM） ----
export async function getMessages(): Promise<Message[]> {
  const items = await readJson<Message[]>(MESSAGES_FILE, []);
  // 投稿順（古い→新しい）。チャットは上から時系列で読む。
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveMessages(items: Message[]): Promise<void> {
  await writeJson(MESSAGES_FILE, items);
}

// ---- 成果（プロジェクトサマリ） ----
export async function getAchievements(): Promise<Achievement[]> {
  const items = await readJson<Achievement[]>(ACHIEVEMENTS_FILE, []);
  // 新しい順（createdAt 降順）
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveAchievements(items: Achievement[]): Promise<void> {
  await writeJson(ACHIEVEMENTS_FILE, items);
}

// ---- ブログ記事（.md ファイル） ----
const SLUG_RE = /^[a-zA-Z0-9._-]+$/; // パストラバーサル防止
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-/;

export function isValidSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.length > 0 && SLUG_RE.test(slug) && !slug.includes('..');
}

function postPath(slug: string): string {
  return path.join(POSTS_DIR, `${slug}.md`);
}

/** Markdown 本文から最初の見出し（# …）をタイトルとして抽出。無ければ slug を返す。 */
function extractTitle(content: string, slug: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : slug;
}

/** 本文プレビュー（見出し・記号を除いた先頭テキスト） */
function extractPreview(content: string): string {
  const text = content
    .split('\n')
    .filter((line) => !line.startsWith('#') && line.trim() !== '')
    .join(' ')
    .replace(/[*_`>#-]/g, '')
    .trim();
  return text.slice(0, 120);
}

export async function getPostList(): Promise<PostMeta[]> {
  await ensureDir(POSTS_DIR);
  const files = await fs.readdir(POSTS_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const posts = await Promise.all(
    mdFiles.map(async (file) => {
      const slug = file.replace(/\.md$/, '');
      const content = await fs.readFile(path.join(POSTS_DIR, file), 'utf-8');
      const dateMatch = slug.match(DATE_PREFIX_RE);
      return {
        slug,
        title: extractTitle(content, slug),
        date: dateMatch ? dateMatch[1] : '',
        preview: extractPreview(content),
      } satisfies PostMeta;
    }),
  );
  // 日付降順 → 同日は slug 降順
  return posts.sort((a, b) => (b.date + b.slug).localeCompare(a.date + a.slug));
}

export async function getPostContent(slug: string): Promise<string | null> {
  if (!isValidSlug(slug)) return null;
  try {
    return await fs.readFile(postPath(slug), 'utf-8');
  } catch {
    return null;
  }
}

export async function savePost(slug: string, content: string): Promise<void> {
  if (!isValidSlug(slug)) throw new Error('invalid slug');
  await ensureDir(POSTS_DIR);
  await fs.writeFile(postPath(slug), content, 'utf-8');
}

export async function deletePost(slug: string): Promise<void> {
  if (!isValidSlug(slug)) throw new Error('invalid slug');
  await fs.rm(postPath(slug), { force: true });
}
