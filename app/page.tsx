'use client';

import { useState } from 'react';
import LogsPanel from '@/components/LogsPanel';
import PostsPanel from '@/components/PostsPanel';
import TasksPanel from '@/components/TasksPanel';

type Tab = 'logs' | 'posts' | 'tasks';

const TABS: { key: Tab; label: string }[] = [
  { key: 'logs', label: '作業ログ' },
  { key: 'posts', label: 'ブログ記事' },
  { key: 'tasks', label: 'タスク' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'logs' && <LogsPanel />}
      {tab === 'posts' && <PostsPanel />}
      {tab === 'tasks' && <TasksPanel />}
    </main>
  );
}
