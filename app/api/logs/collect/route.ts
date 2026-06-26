import { NextResponse } from 'next/server';
import { collectLogs } from '@/lib/collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/logs/collect — ~/.claude/projects を解析し claude -p で要約してキャッシュ更新。
// 変化のあった日だけ要約するため、変化が無ければ即座にキャッシュを返す。
export async function POST() {
  try {
    const result = await collectLogs();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '収集に失敗しました';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
