'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LogEntry {
  id: string;
  title: string;
  date: string;
  project: string;
  sessionId: string;
  period: string;
  body: string;
  createdAt: string;
}

// logs は date 降順で来る前提。連続する同一 date をセクションにまとめる。
function groupByDate(logs: LogEntry[]): { date: string; items: LogEntry[] }[] {
  const groups: { date: string; items: LogEntry[] }[] = [];
  for (const log of logs) {
    const last = groups[groups.length - 1];
    if (last && last.date === log.date) last.items.push(log);
    else groups.push({ date: log.date, items: [log] });
  }
  return groups;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function formatDateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${date}（${WEEKDAYS[d.getDay()]}）`;
}

export default function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [fav, setFav] = useState<string[]>([]);
  const [favOnly, setFavOnly] = useState(false);
  const started = useRef(false);

  async function loadCache() {
    const res = await fetch('/api/logs');
    setLogs(await res.json());
  }

  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem('ccd-fav-logs') || '[]');
      if (Array.isArray(f)) setFav(f);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleFav(id: string) {
    setFav((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      try {
        localStorage.setItem('ccd-fav-logs', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function remove(id: string) {
    if (!confirm('この作業ログを削除しますか？\n（次の自動収集でその日に新しい変化があると復活する場合があります）')) {
      return;
    }
    await fetch('/api/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (openId === id) setOpenId(null);
    setFav((prev) => {
      if (!prev.includes(id)) return prev;
      const next = prev.filter((s) => s !== id);
      try {
        localStorage.setItem('ccd-fav-logs', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    await loadCache();
  }

  // マウント時: まずキャッシュを即表示 → 裏で自動収集(claude -p) → 完了したら更新。
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await loadCache();
      setCollecting(true);
      setError('');
      try {
        const res = await fetch('/api/logs/collect', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) setError(data.error ?? '収集に失敗しました');
        else await loadCache();
      } catch {
        setError('収集の通信に失敗しました');
      } finally {
        setCollecting(false);
      }
    })();
  }, []);

  const favCount = logs.filter((l) => fav.includes(l.id)).length;
  const visible = favOnly ? logs.filter((l) => fav.includes(l.id)) : logs;

  return (
    <div>
      <p className="meta" style={{ marginBottom: 16 }}>
        {collecting
          ? '〜/.claude のログを収集・要約中…（初回や新しい作業がある日は時間がかかります）'
          : `自動収集された作業ログ（${logs.length} 件）`}
      </p>
      {error && <p className="error">{error}</p>}

      {logs.length > 0 && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            className={`tab${favOnly ? ' active' : ''}`}
            onClick={() => setFavOnly((v) => !v)}
          >
            {favOnly ? `★ お気に入りのみ（${favCount}）` : `☆ お気に入り（${favCount}）`}
          </button>
        </div>
      )}

      {logs.length === 0 && !collecting ? (
        <p className="empty">
          まだログがありません。Claude Code で 4 メッセージ以上のセッションがあれば、
          このタブを開いたときに自動で収集されます。
        </p>
      ) : visible.length === 0 ? (
        <p className="empty">お気に入りの作業ログはありません。</p>
      ) : (
        groupByDate(visible).map((group) => (
          <section key={group.date}>
            <h2 className="date-section">{formatDateHeading(group.date)}</h2>
            {group.items.map((log) => (
              <div key={log.id}>
                <div
                  className="card post-item"
                  onClick={() => setOpenId(openId === log.id ? null : log.id)}
                >
                  <div className="card-row">
                    <div>
                      {log.period && <div className="meta">{log.period}</div>}
                      <div className="post-title" style={{ marginTop: 4 }}>
                        {log.title}
                      </div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        <span className="project">{log.project}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        className={`btn-star${fav.includes(log.id) ? ' active' : ''}`}
                        aria-pressed={fav.includes(log.id)}
                        aria-label={fav.includes(log.id) ? 'お気に入りから外す' : 'お気に入りに追加'}
                        title={fav.includes(log.id) ? 'お気に入りから外す' : 'お気に入りに追加'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFav(log.id);
                        }}
                      >
                        {fav.includes(log.id) ? '★' : '☆'}
                      </button>
                      <button
                        className="btn-ghost btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(log.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
                {openId === log.id && log.body && (
                  <div className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{log.body}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
