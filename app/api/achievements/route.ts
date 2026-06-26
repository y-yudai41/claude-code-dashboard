import { NextRequest, NextResponse } from 'next/server';
import { getAchievements, saveAchievements, type Achievement } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 成果はダッシュボードでは生成しない。Claude Code が `/seika` でまとめて保存する。

// GET /api/achievements — 全成果（新しい順）
export async function GET() {
  const items = await getAchievements();
  return NextResponse.json(items);
}

// POST /api/achievements — 追加 { project, body, period? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.project !== 'string' ||
    body.project.trim() === '' ||
    typeof body.body !== 'string' ||
    body.body.trim() === ''
  ) {
    return NextResponse.json(
      { error: '{ project, body } は必須です（成果は Claude Code がまとめて保存します）' },
      { status: 400 },
    );
  }
  const item: Achievement = {
    id: String(Date.now()),
    project: body.project.trim(),
    period: typeof body.period === 'string' ? body.period.trim() : '',
    body: body.body.trim(),
    createdAt: new Date().toISOString(),
  };
  const items = await getAchievements();
  items.push(item);
  await saveAchievements(items);
  return NextResponse.json(item, { status: 201 });
}

// PATCH /api/achievements — 更新 { id, project?, period?, body? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const items = await getAchievements();
  const item = items.find((a) => a.id === body.id);
  if (!item) {
    return NextResponse.json({ error: '成果が見つかりません' }, { status: 404 });
  }
  if (typeof body.project === 'string' && body.project.trim() !== '') item.project = body.project.trim();
  if (typeof body.period === 'string') item.period = body.period.trim();
  if (typeof body.body === 'string' && body.body.trim() !== '') item.body = body.body.trim();
  await saveAchievements(items);
  return NextResponse.json(item);
}

// DELETE /api/achievements — 削除 { id }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const items = await getAchievements();
  await saveAchievements(items.filter((a) => a.id !== body.id));
  return NextResponse.json({ ok: true });
}
