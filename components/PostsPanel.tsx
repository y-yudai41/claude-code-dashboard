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

// 「メインタイトル — サブタイトル」形式から、一覧表示用にメイン部分だけ取り出す。
// em/en ダッシュ（— –）区切りのみ対象（通常のハイフンは温存）。全文はクリックで見る。
function mainTitle(title: string): string {
  return title.split(/\s*[—–]\s*/)[0].trim();
}

export default function PostsPanel() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [read, setRead] = useState<string[]>([]);
  const [fav, setFav] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

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
    try {
      const f = JSON.parse(localStorage.getItem('ccd-fav-posts') || '[]');
      if (Array.isArray(f)) setFav(f);
    } catch {
      /* ignore */
    }
  }, []);

  // 未読数をタブのバッジ（page.tsx）へ通知。posts/read が変わるたび再計算して飛ばす。
  useEffect(() => {
    const unread = posts.filter((p) => !read.includes(p.slug)).length;
    window.dispatchEvent(new CustomEvent('ccd-posts-unread', { detail: unread }));
  }, [posts, read]);

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

  function toggleFav(slug: string) {
    setFav((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      try {
        localStorage.setItem('ccd-fav-posts', JSON.stringify(next));
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
    if (!confirm('この記事を削除しますか？\n（Claude Code が保存した .md ファイルごと削除されます）')) {
      return;
    }
    await fetch('/api/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (openSlug === slug) setOpenSlug(null);
    load();
  }

  const visible = posts.filter(
    (p) =>
      (!unreadOnly || !read.includes(p.slug)) && (!favOnly || fav.includes(p.slug)),
  );
  const favCount = posts.filter((p) => fav.includes(p.slug)).length;

  return (
    <div>
      <p className="hint">
        記事はこの画面では作りません。Claude Code で <code>/blog &quot;質問内容&quot;</code> を実行すると、
        Claude が記事を書いてここに保存します（このタブは表示・既読管理・削除のみ）。
      </p>

      {posts.length > 0 && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            className={`tab${unreadOnly ? ' active' : ''}`}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            {unreadOnly ? '未読のみ' : 'すべて表示'}
          </button>
          <button
            className={`tab${favOnly ? ' active' : ''}`}
            onClick={() => setFavOnly((v) => !v)}
          >
            {favOnly ? `★ お気に入りのみ（${favCount}）` : `☆ お気に入り（${favCount}）`}
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="empty">
          まだ記事がありません。Claude Code で <code>/blog &quot;質問&quot;</code> を実行すると追加されます。
        </p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {favOnly ? 'お気に入りの記事はありません。' : '未読の記事はありません。'}
        </p>
      ) : (
        visible.map((post) => (
          <div key={post.slug}>
            <div
              className={`card post-item${read.includes(post.slug) ? ' read' : ''}`}
              onClick={() => openPost(post.slug)}
            >
              <div className="card-row">
                <div>
                  <div className="post-title">
                    {!read.includes(post.slug) && (
                      <span className="unread-dot" aria-label="未読" title="未読" />
                    )}
                    {mainTitle(post.title)}
                  </div>
                  <div className="meta">{post.date}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  <button
                    className={`btn-star${fav.includes(post.slug) ? ' active' : ''}`}
                    aria-pressed={fav.includes(post.slug)}
                    aria-label={fav.includes(post.slug) ? 'お気に入りから外す' : 'お気に入りに追加'}
                    title={fav.includes(post.slug) ? 'お気に入りから外す' : 'お気に入りに追加'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(post.slug);
                    }}
                  >
                    {fav.includes(post.slug) ? '★' : '☆'}
                  </button>
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
