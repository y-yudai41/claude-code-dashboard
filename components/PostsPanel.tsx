'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PostMeta {
  slug: string;
  title: string;
  date: string;
  preview: string;
}

export default function PostsPanel() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [read, setRead] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function load() {
    const res = await fetch('/api/posts');
    setPosts(await res.json());
  }

  useEffect(() => {
    load();
    try {
      const r = JSON.parse(localStorage.getItem('ccd-read-posts') || '[]');
      if (Array.isArray(r)) setRead(r);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleRead(slug: string) {
    setRead((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      try {
        localStorage.setItem('ccd-read-posts', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function openPost(slug: string) {
    if (openSlug === slug) {
      setOpenSlug(null);
      return;
    }
    const res = await fetch(`/api/posts?slug=${encodeURIComponent(slug)}`);
    setContent(res.ok ? await res.text() : '');
    setOpenSlug(slug);
  }

  async function remove(slug: string) {
    await fetch('/api/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (openSlug === slug) setOpenSlug(null);
    load();
  }

  const visible = posts.filter((p) => !unreadOnly || !read.includes(p.slug));

  return (
    <div>
      {posts.length > 0 && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            className={`tab${unreadOnly ? ' active' : ''}`}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            {unreadOnly ? `未読のみ（${visible.length}）` : 'すべて表示'}
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="empty">
          まだ記事がありません。Claude Code で <code>/blog &quot;質問&quot;</code> を実行すると追加されます。
        </p>
      ) : visible.length === 0 ? (
        <p className="empty">未読の記事はありません。</p>
      ) : (
        visible.map((post) => (
          <div key={post.slug}>
            <div
              className={`card post-item${read.includes(post.slug) ? ' read' : ''}`}
              onClick={() => openPost(post.slug)}
            >
              <div className="card-row">
                <div>
                  <div className="post-title">{post.title}</div>
                  <div className="meta">{post.date}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRead(post.slug);
                    }}
                  >
                    {read.includes(post.slug) ? '未読に戻す' : '読んだ'}
                  </button>
                  <button
                    className="btn-ghost btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(post.slug);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
            {openSlug === post.slug && (
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
