import { promises as fs } from 'fs';
import path from 'path';

// ローカルファイル保存のルート。process.cwd() = プロジェクトルート。
const DATA_DIR = path.join(process.cwd(), 'data');
const POSTS_DIR = path.join(process.cwd(), 'posts');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

// ---- 型 ----
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
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD（ファイル名先頭から推定）
  preview: string;
}

// ---- 汎用 JSON 読み書き ----
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    // ファイルが無ければ初期値。それ以外（破損等）も初期値で落とさない。
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return fallback;
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
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

// ---- タスク ----
export async function getTasks(): Promise<Task[]> {
  return readJson<Task[]>(TASKS_FILE, []);
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await writeJson(TASKS_FILE, tasks);
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
