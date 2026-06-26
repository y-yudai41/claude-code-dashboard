'use client';

import { useEffect, useState } from 'react';
import LogsPanel from '@/components/LogsPanel';
import PostsPanel from '@/components/PostsPanel';
import TasksPanel from '@/components/TasksPanel';
import AchievementsPanel from '@/components/AchievementsPanel';

type Tab = 'logs' | 'achievements' | 'posts' | 'tasks';

const TABS: { key: Tab; label: string }[] = [
  { key: 'logs', label: '作業ログ' },
  { key: 'achievements', label: '成果' },
  { key: 'posts', label: 'ブログ記事' },
  { key: 'tasks', label: 'タスク' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('logs');
  const [unreadPosts, setUnreadPosts] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);

  // ブログ未読数。初回はここで算出（PostsPanel 未マウントでもバッジを出すため）、
  // 以降は PostsPanel が既読変更時に飛ばすイベントで同期する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/posts');
        const posts: { slug: string }[] = await res.json();
        let read: string[] = [];
        try {
          const r = JSON.parse(localStorage.getItem('ccd-read-posts') || '[]');
          if (Array.isArray(r)) read = r;
        } catch {
          /* ignore */
        }
        if (!cancelled) setUnreadPosts(posts.filter((p) => !read.includes(p.slug)).length);
      } catch {
        /* ignore */
      }
    })();

    const onUnread = (e: Event) => setUnreadPosts((e as CustomEvent<number>).detail);
    window.addEventListener('ccd-posts-unread', onUnread);
    return () => {
      cancelled = true;
      window.removeEventListener('ccd-posts-unread', onUnread);
    };
  }, []);

  // 未完了タスク数。初回はここで算出（TasksPanel 未マウントでもバッジを出すため）、
  // 以降は TasksPanel が変更時に飛ばすイベントで同期する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tasks');
        const tasks: { done: boolean }[] = await res.json();
        if (!cancelled) setOpenTasks(tasks.filter((t) => !t.done).length);
      } catch {
        /* ignore */
      }
    })();

    const onOpen = (e: Event) => setOpenTasks((e as CustomEvent<number>).detail);
    window.addEventListener('ccd-tasks-open', onOpen);
    return () => {
      cancelled = true;
      window.removeEventListener('ccd-tasks-open', onOpen);
    };
  }, []);

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
            {t.key === 'posts' && unreadPosts > 0 && (
              <span className="tab-badge">{unreadPosts > 99 ? '99+' : unreadPosts}</span>
            )}
            {t.key === 'tasks' && openTasks > 0 && (
              <span className="tab-badge">{openTasks > 99 ? '99+' : openTasks}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'logs' && <LogsPanel />}
      {tab === 'achievements' && <AchievementsPanel />}
      {tab === 'posts' && <PostsPanel />}
      {tab === 'tasks' && <TasksPanel />}
    </main>
  );
}
