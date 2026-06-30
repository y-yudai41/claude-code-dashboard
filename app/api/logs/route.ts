import { NextRequest, NextResponse } from 'next/server';
import { getLogs, deleteLog } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/logs — Notion から同期済みのログ（キャッシュ）を新しい順で返す。
// ログは claude-notion-logger が Notion に自動投稿したものを表示するだけで、
// 手動の追加はしない（同期は POST /api/logs/collect）。削除は DELETE で可能。
export async function GET() {
  const logs = await getLogs();
  return NextResponse.json(logs);
}

// DELETE /api/logs — 削除 { id }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  }
  await deleteLog(body.id);
  return NextResponse.json({ ok: true });
}
