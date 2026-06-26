'use client';

import { useEffect, useState } from 'react';

interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');

  async function load() {
    const res = await fetch('/api/tasks');
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!title.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
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

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <div className="form">
        <input
          placeholder="タスクを入力して Enter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
      </div>

      {tasks.length === 0 && <p className="empty">タスクはありません。</p>}

      {open.map((task) => (
        <div className="task" key={task.id}>
          <input type="checkbox" checked={task.done} onChange={() => toggle(task)} />
          <span className="title">{task.title}</span>
          <button className="btn-ghost btn-danger" onClick={() => remove(task.id)}>
            削除
          </button>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <p className="section-title">完了済み</p>
          {done.map((task) => (
            <div className="task done" key={task.id}>
              <input type="checkbox" checked={task.done} onChange={() => toggle(task)} />
              <span className="title">{task.title}</span>
              <button className="btn-ghost btn-danger" onClick={() => remove(task.id)}>
                削除
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
