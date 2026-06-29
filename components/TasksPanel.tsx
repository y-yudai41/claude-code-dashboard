'use client';

import { useEffect, useRef, useState } from 'react';

interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  kind?: 'task' | 'group';
}

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  // 編集中の行 id と編集テキスト
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  async function load() {
    const res = await fetch('/api/tasks');
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  // 未完了タスク数をタブのバッジ（page.tsx）へ通知。tasks が変わるたび発火。
  useEffect(() => {
    const openCount = tasks.filter((t) => t.kind !== 'group' && !t.done).length;
    window.dispatchEvent(new CustomEvent('ccd-tasks-open', { detail: openCount }));
  }, [tasks]);

  async function add(kind: 'task' | 'group' = 'task') {
    if (!title.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), kind }),
    });
    setTitle('');
    load();
  }

  async function toggle(task: Task) {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, done: !task.done }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditText(task.title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  // 編集確定。タイトル更新は PATCH の title を流用。
  async function commitEdit(id: string) {
    const next = editText.trim();
    if (!next) {
      cancelEdit();
      return;
    }
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: next }),
    });
    cancelEdit();
    load();
  }

  // 並べ替えされた順を保存。tasks は楽観的に更新済みなので order だけ送る。
  async function persistOrder(ordered: Task[]) {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ordered.map((t) => t.id) }),
    });
  }

  // ---- 長押しドラッグ並べ替え ----
  // 長押し（LONG_PRESS_MS）で対象を掴み、指/カーソルの位置に応じて並びを入れ替える。
  const LONG_PRESS_MS = 350;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  function clearPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    // チェックボックスや削除ボタン上ではドラッグを開始しない。
    if ((e.target as HTMLElement).closest('input, button')) return;
    // React のイベント後に currentTarget が null 化するため、同期的に確保しておく。
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    clearPress();
    pressTimer.current = setTimeout(() => {
      setDraggingId(id);
      // 掴んだ指でスクロールせずドラッグを継続できるよう pointer を捕捉。
      el.setPointerCapture?.(pointerId);
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingId) return;
    e.preventDefault();
    // ポインタ直下にある別タスク行を探し、掴んだ行をその位置へ移動。
    let overId: string | null = null;
    for (const [id, el] of rowsRef.current) {
      if (id === draggingId) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        overId = id;
        break;
      }
    }
    if (!overId) return;
    setTasks((prev) => {
      const from = prev.findIndex((t) => t.id === draggingId);
      const to = prev.findIndex((t) => t.id === overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onPointerUp() {
    clearPress();
    if (draggingId) {
      setDraggingId(null);
      setTasks((prev) => {
        persistOrder(prev);
        return prev;
      });
    }
  }

  return (
    <div>
      <div className="form">
        <input
          placeholder="タスクを入力して Enter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add('task');
          }}
        />
        <div className="form-actions">
          <button className="btn" onClick={() => add('task')} disabled={!title.trim()}>
            追加
          </button>
          <button className="btn-ghost" onClick={() => add('group')} disabled={!title.trim()}>
            ＋ タイトル
          </button>
        </div>
      </div>

      {tasks.length === 0 && <p className="empty">タスクはありません。</p>}

      {tasks.map((task) => {
        const isGroup = task.kind === 'group';
        const isEditing = editingId === task.id;
        const classes = isGroup ? ['task', 'group'] : ['task'];
        if (task.done && !isGroup) classes.push('done');
        if (draggingId === task.id) classes.push('dragging');
        return (
          <div
            className={classes.join(' ')}
            key={task.id}
            ref={(el) => {
              if (el) rowsRef.current.set(task.id, el);
              else rowsRef.current.delete(task.id);
            }}
            onPointerDown={(e) => onPointerDown(e, task.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {!isGroup && (
              <input type="checkbox" checked={task.done} onChange={() => toggle(task)} />
            )}
            {isEditing ? (
              <input
                className="title-edit"
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(task.id);
                  if (e.key === 'Escape') cancelEdit();
                }}
                onBlur={() => commitEdit(task.id)}
              />
            ) : (
              <span className="title">{task.title}</span>
            )}
            {isEditing ? (
              <button className="btn-ghost" onClick={() => commitEdit(task.id)}>
                保存
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => startEdit(task)}>
                編集
              </button>
            )}
            <button className="btn-ghost btn-danger" onClick={() => remove(task.id)}>
              削除
            </button>
          </div>
        );
      })}
    </div>
  );
}
