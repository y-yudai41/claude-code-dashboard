import { NextRequest, NextResponse } from 'next/server';
import { getTasks, saveTasks, type Task } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tasks — 全タスク
export async function GET() {
  const tasks = await getTasks();
  return NextResponse.json(tasks);
}

// POST /api/tasks — 追加 { title }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 });
  }
  const task: Task = {
    id: String(Date.now()),
    title: body.title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  const tasks = await getTasks();
  tasks.push(task);
  await saveTasks(tasks);
  return NextResponse.json(task, { status: 201 });
}

// PATCH /api/tasks — 更新 { id, done? }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === body.id);
  if (!task) {
    return NextResponse.json({ error: 'タスクが見つかりません' }, { status: 404 });
  }
  if (typeof body.done === 'boolean') task.done = body.done;
  if (typeof body.title === 'string' && body.title.trim() !== '') task.title = body.title.trim();
  await saveTasks(tasks);
  return NextResponse.json(task);
}

// DELETE /api/tasks — 削除 { id }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id は必須です' }, { status: 400 });
  }
  const tasks = await getTasks();
  await saveTasks(tasks.filter((t) => t.id !== body.id));
  return NextResponse.json({ ok: true });
}
