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
  const started = useRef(false);

  async function loadCache() {
    const res = await fetch('/api/logs');
    setLogs(await res.json());
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

  return (
    <div>
      <p className="meta" style={{ marginBottom: 16 }}>
        {collecting
          ? '〜/.claude のログを収集・要約中…（初回や新しい作業がある日は時間がかかります）'
          : `自動収集された作業ログ（${logs.length} 件）`}
      </p>
      {error && <p className="error">{error}</p>}

      {logs.length === 0 && !collecting ? (
        <p className="empty">
          まだログがありません。Claude Code で 4 メッセージ以上のセッションがあれば、
          このタブを開いたときに自動で収集されます。
        </p>
      ) : (
        groupByDate(logs).map((group) => (
          <section key={group.date}>
            <h2 className="date-section">{formatDateHeading(group.date)}</h2>
            {group.items.map((log) => (
              <div key={log.id}>
                <div
                  className="card post-item"
                  onClick={() => setOpenId(openId === log.id ? null : log.id)}
                >
                  {log.period && <div className="meta">{log.period}</div>}
                  <div className="post-title" style={{ marginTop: 4 }}>
                    {log.title}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <span className="project">{log.project}</span>
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
