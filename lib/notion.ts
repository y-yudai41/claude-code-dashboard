import type { LogEntry } from './storage';

// claude-notion-logger が書き込む Notion DB を読み出し、ダッシュボードの LogEntry に変換する。
// 実 DB のプロパティ（logger.py で確認済み）:
//   タイトル(title) / 日付(date) / プロジェクト(rich_text) / SessionId(rich_text) / 時間帯(rich_text)
//   ＋ 作業内容の本文はページ本文ブロック。
// DB を変えた場合は COLUMN_MAP を編集する。
export const COLUMN_MAP = {
  title: 'タイトル',
  date: '日付',
  project: 'プロジェクト',
  sessionId: 'SessionId',
  period: '時間帯',
} as const;

const NOTION_VERSION = '2022-06-28';

interface NotionConfig {
  token: string;
  databaseId: string;
}

export function getNotionConfig(): NotionConfig | null {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token || !databaseId) return null;
  return { token, databaseId };
}

async function notion(token: string, endpoint: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function plainText(richArray: any[] | undefined): string {
  if (!Array.isArray(richArray)) return '';
  return richArray.map((r) => r?.plain_text ?? '').join('');
}

function readProp(props: Record<string, any>, name: string): string {
  const p = props?.[name];
  if (!p) return '';
  switch (p.type) {
    case 'title':
      return plainText(p.title);
    case 'rich_text':
      return plainText(p.rich_text);
    case 'date':
      return p.date?.start ?? '';
    default:
      return '';
  }
}

/** ページ本文ブロックを Markdown 風テキストに変換（作業内容の本文）。 */
async function fetchPageBody(token: string, pageId: string): Promise<string> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const data = await notion(token, `blocks/${pageId}/children${q}`);
    for (const block of data.results ?? []) {
      const t = block.type;
      const text = plainText(block[t]?.rich_text);
      if (!text) continue;
      if (t === 'heading_1') lines.push(`# ${text}`);
      else if (t === 'heading_2') lines.push(`## ${text}`);
      else if (t === 'heading_3') lines.push(`### ${text}`);
      else if (t === 'bulleted_list_item') lines.push(`- ${text}`);
      else if (t === 'numbered_list_item') lines.push(`1. ${text}`);
      else lines.push(text);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return lines.join('\n');
}

/** Notion DB を全件読み出して LogEntry[] に変換する。 */
export async function fetchNotionLogs(cfg: NotionConfig): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];
  let cursor: string | undefined;

  do {
    const data = await notion(cfg.token, `databases/${cfg.databaseId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of data.results ?? []) {
      const props = page.properties ?? {};
      const body = await fetchPageBody(cfg.token, page.id);
      entries.push({
        id: page.id,
        title: readProp(props, COLUMN_MAP.title) || '(無題)',
        date: readProp(props, COLUMN_MAP.date) || (page.created_time ?? '').slice(0, 10),
        project: readProp(props, COLUMN_MAP.project) || '(不明)',
        sessionId: readProp(props, COLUMN_MAP.sessionId),
        period: readProp(props, COLUMN_MAP.period),
        body,
        createdAt: page.created_time ?? new Date().toISOString(),
      });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return entries;
}
