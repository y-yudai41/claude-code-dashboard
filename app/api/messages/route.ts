import { NextRequest, NextResponse } from 'next/server';
import { getMessages, saveMessages, type Message } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/messages — 全メッセージ（投稿順）
export async function GET() {
  const messages = await getMessages();
  return NextResponse.json(messages);
}

// POST /api/messages — 投稿 { text, parentId? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.text !== 'string' || body.text.trim() === '') {
    return NextResponse.json({ error: 'text は必須です' }, { status: 400 });
  }
  const messages = await getMessages();
  let parentId: string | undefined;
  if (typeof body.parentId === 'string' && body.parentId) {
    // 親が実在し、かつ親自身がトップレベル（= スレッドのネストは 1 段まで）であること。
    const parent = messages.find((m) => m.id === body.parentId);
    if (!parent) {
      return NextResponse.json({ error: '親メッセージが見つかりません' }, { status: 404 });
    }
    parentId = parent.parentId ?? parent.id;
  }
  const message: Message = {
    id: String(Date.now()),
    text: body.text.trim(),
    createdAt: new Date().toISOString(),
    ...(parentId ? { parentId } : {}),
  };
  messages.push(message);
  await saveMessages(messages);
  return NextResponse.json(message, { status: 201 });
}

// PATCH /api/messages — 編集 { id, text } / リアクション { id, toggleReaction }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const messages = await getMessages();
  const message = messages.find((m) => m.id === body.id);
  if (!message) {
    return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 });
  }
  // 本文編集
  if (typeof body.text === 'string' && body.text.trim() !== '') {
    message.text = body.text.trim();
    message.editedAt = new Date().toISOString();
  }
  // リアクションのトグル（自分専用なので付いていれば外す・無ければ付ける）
  if (typeof body.toggleReaction === 'string' && body.toggleReaction) {
    const emoji = body.toggleReaction;
    const reactions = message.reactions ?? [];
    const idx = reactions.findIndex((r) => r.emoji === emoji);
    if (idx >= 0) {
      reactions.splice(idx, 1);
    } else {
      reactions.push({ emoji, count: 1 });
    }
    message.reactions = reactions;
  }
  await saveMessages(messages);
  return NextResponse.json(message);
}

// DELETE /api/messages — 削除 { id }（親を消したらスレッド返信も連鎖削除）
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const messages = await getMessages();
  const remaining = messages.filter((m) => m.id !== body.id && m.parentId !== body.id);
  await saveMessages(remaining);
  return NextResponse.json({ ok: true });
}
