'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Achievement } from '@/lib/types';

export default function AchievementsPanel() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/achievements');
    setItems(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(id: string) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  async function remove(id: string) {
    if (!confirm('この成果を削除しますか？')) return;
    await fetch('/api/achievements', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (openId === id) setOpenId(null);
    load();
  }

  const hint = (
    <p className="hint">
      成果はこの画面では作りません。Claude Code で{' '}
      <code>/seika &quot;プロジェクトのパスや説明&quot;</code> を実行すると、Claude がそのプロジェクト全体を
      調べて成果サマリを書き、ここに保存します（このタブは表示・削除のみ）。
    </p>
  );

  if (items.length === 0) {
    return (
      <div>
        {hint}
        <p className="empty">まだ成果がありません。</p>
      </div>
    );
  }

  return (
    <div>
      {hint}
      {items.map((item) => (
        <div key={item.id}>
          <div className="card post-item" onClick={() => toggle(item.id)}>
            <div className="card-row">
              <div>
                <div className="post-title">{item.project}</div>
                <div className="meta">{item.period || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="btn-ghost btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(item.id);
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
          {openId === item.id && (
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
