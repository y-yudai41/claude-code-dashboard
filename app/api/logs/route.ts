import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/logs — Notion から同期済みのログ（キャッシュ）を新しい順で返す。
// ログは claude-notion-logger が Notion に自動投稿したものを表示するだけで、
// 手動の追加・削除はしない（同期は POST /api/logs/sync）。
export async function GET() {
  const logs = await getLogs();
  return NextResponse.json(logs);
}
