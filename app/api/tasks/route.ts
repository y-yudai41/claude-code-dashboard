import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getTasks, saveTasks, type Task } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tasks — 全タスク
export async function GET() {
  const tasks = await getTasks();
  return NextResponse.json(tasks);
}

// POST /api/tasks — 追加 { title, kind? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 });
  }
  const kind: Task['kind'] = body.kind === 'group' ? 'group' : 'task';
  const task: Task = {
    id: randomUUID(),
    title: body.title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
    kind,
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

// PUT /api/tasks — 並べ替え { order: string[] }（id を並べたい順に列挙）
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.order) || body.order.some((id: unknown) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'order は id の配列が必須です' }, { status: 400 });
  }
  const tasks = await getTasks();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // order に従って並べ替え。order に無い既存タスクは末尾に元の順で残す。
  const ordered: Task[] = [];
  for (const id of body.order as string[]) {
    const t = byId.get(id);
    if (t) {
      ordered.push(t);
      byId.delete(id);
    }
  }
  for (const t of tasks) {
    if (byId.has(t.id)) ordered.push(t);
  }
  await saveTasks(ordered);
  return NextResponse.json(ordered);
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
