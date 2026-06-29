'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

interface Reaction {
  emoji: string;
  count: number;
}

interface Message {
  id: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  parentId?: string;
  reactions?: Reaction[];
}

const QUICK_EMOJIS = ['👍', '✅', '👀', '🙏', '🎉', '❤️', '😄', '🔥'];

// ---- 日時フォーマット（Slack 風） ----
function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '午前' : '午後';
  h = h % 12;
  if (h === 0) h = 12;
  return `${ampm}${h}:${m}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${wd})`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

// ---- Slack mrkdwn 簡易レンダラ ----
// 行を分割し、各行内で `code` *bold* _italic_ ~strike~ と URL を React ノード化。
// （ローカル専用アプリ・自分の入力のみ。テキストは React がエスケープするので安全）
function renderInline(text: string, keyBase: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith('`')) {
      tokens.push(
        <code key={k} className="md-code">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (t.startsWith('*')) {
      tokens.push(<strong key={k}>{t.slice(1, -1)}</strong>);
    } else if (t.startsWith('_')) {
      tokens.push(<em key={k}>{t.slice(1, -1)}</em>);
    } else if (t.startsWith('~')) {
      tokens.push(<s key={k}>{t.slice(1, -1)}</s>);
    } else {
      tokens.push(
        <a key={k} href={t} target="_blank" rel="noreferrer">
          {t}
        </a>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

function MessageText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="msg-text">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.startsWith('> ') ? (
            <span className="md-quote">{renderInline(line.slice(2), `q${i}`)}</span>
          ) : (
            renderInline(line, `l${i}`)
          )}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  );
}

// ---- 入力欄（メイン / スレッド共用） ----
function Composer({
  placeholder,
  onSend,
  autoFocus,
}: {
  placeholder: string;
  onSend: (text: string) => void | Promise<void>;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // 高さ自動調整
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  // 普段は 1 行のコンパクト表示。フォーカス中か入力があるときだけ書式ツールバーを出す。
  const expanded = focused || text.trim().length > 0;
  const TOOLBAR = ['B', 'I', 'S', '🔗', 'O', 'U', '“', '‹›', '{ }'];

  return (
    <div className={`composer${expanded ? ' expanded' : ''}`}>
      {expanded && (
        <div className="composer-toolbar">
          {TOOLBAR.map((b, i) => (
            <button key={i} className="ctool" tabIndex={-1} type="button" title="書式（飾り）">
              {b}
            </button>
          ))}
        </div>
      )}
      <div className="composer-row">
        <textarea
          ref={ref}
          className="composer-input"
          rows={1}
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="send-btn"
          type="button"
          disabled={!text.trim()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          title="送信"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ---- メッセージ編集欄 ----
// 編集テキストはこの中のローカル state で持つ。親（DmPanel）の state にすると
// 1 文字ごとに親が再描画→行が作り直されてカーソルが先頭へ飛ぶため、独立させる。
function MessageEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  // マウント時にフォーカスし、カーソルを末尾へ。高さも内容に合わせる。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  return (
    <div className="msg-edit">
      <textarea
        ref={ref}
        className="composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSave(text.trim());
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="msg-edit-actions">
        <button className="btn-ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button className="btn" onClick={() => onSave(text.trim())}>
          保存
        </button>
      </div>
    </div>
  );
}

export default function DmPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null); // リアクション絵文字ピッカー表示中の msg id
  const feedRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch('/api/messages');
    setMessages(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  // 投稿が増えたらフィードを最下部へ
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const topLevel = messages.filter((m) => !m.parentId);
  const repliesOf = (id: string) => messages.filter((m) => m.parentId === id);

  async function post(text: string, parentId?: string) {
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(parentId ? { parentId } : {}) }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('このメッセージを削除しますか？（スレッドの返信も消えます）')) return;
    await fetch('/api/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (openThreadId === id) setOpenThreadId(null);
    await load();
  }

  async function commitEdit(id: string, text: string) {
    const t = text.trim();
    setEditingId(null);
    if (!t) return;
    await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, text: t }),
    });
    await load();
  }

  async function toggleReaction(id: string, emoji: string) {
    setPickerFor(null);
    await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, toggleReaction: emoji }),
    });
    await load();
  }

  // 1 件のメッセージ。自分専用なのでアバター/名前は出さず、各メッセージを
  // カード状に区切って境目を分かりやすくする。inThread=スレッドペイン内表示。
  function MessageRow({ msg, inThread }: { msg: Message; inThread?: boolean }) {
    const editing = editingId === msg.id;
    const replies = inThread ? [] : repliesOf(msg.id);
    return (
      <div className="msg">
        <div className="msg-body">
          <div className="msg-head">
            <span className="msg-time">{fmtTime(msg.createdAt)}</span>
            {msg.editedAt && <span className="msg-edited">（編集済み）</span>}
          </div>
          {editing ? (
            <MessageEditor
              initial={msg.text}
              onSave={(t) => commitEdit(msg.id, t)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <MessageText text={msg.text} />
          )}

          {msg.reactions && msg.reactions.length > 0 && (
            <div className="reactions">
              {msg.reactions.map((r) => (
                <button
                  key={r.emoji}
                  className="reaction on"
                  onClick={() => toggleReaction(msg.id, r.emoji)}
                >
                  <span>{r.emoji}</span>
                  <span className="reaction-count">{r.count}</span>
                </button>
              ))}
              <button
                className="reaction add"
                onClick={() => setPickerFor(msg.id)}
                title="リアクション"
              >
                ＋
              </button>
            </div>
          )}

          {!inThread && replies.length > 0 && (
            <button className="thread-summary" onClick={() => setOpenThreadId(msg.id)}>
              <span className="thread-ic">💬</span>
              <span className="thread-count">{replies.length}件の返信</span>
              <span className="thread-last">
                最終返信 {relTime(replies[replies.length - 1].createdAt)}
              </span>
            </button>
          )}
        </div>

        {/* ホバーで出るアクションバー */}
        {!editing && (
          <div className="msg-actions">
            <div className="msg-actions-inner">
              {pickerFor === msg.id ? (
                <div className="emoji-picker">
                  {QUICK_EMOJIS.map((e) => (
                    <button key={e} onClick={() => toggleReaction(msg.id, e)}>
                      {e}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <button title="リアクション" onClick={() => setPickerFor(msg.id)}>
                    😊
                  </button>
                  {!inThread && (
                    <button title="スレッドで返信" onClick={() => setOpenThreadId(msg.id)}>
                      💬
                    </button>
                  )}
                  <button
                    title="編集"
                    onClick={() => {
                      setEditingId(msg.id);
                      setPickerFor(null);
                    }}
                  >
                    ✏️
                  </button>
                  <button title="削除" onClick={() => remove(msg.id)}>
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // フィード（日付区切り）
  function renderFeed(list: Message[], inThread = false) {
    let prevDay = '';
    return list.map((msg) => {
      const day = dayKey(msg.createdAt);
      const newDay = day !== prevDay;
      prevDay = day;
      return (
        <Fragment key={msg.id}>
          {newDay && (
            <div className="day-divider">
              <span>{dateDivider(msg.createdAt)}</span>
            </div>
          )}
          <MessageRow msg={msg} inThread={inThread} />
        </Fragment>
      );
    });
  }

  const threadParent = openThreadId ? messages.find((m) => m.id === openThreadId) : null;
  const threadReplies = openThreadId ? repliesOf(openThreadId) : [];

  return (
    <div className={`dm${openThreadId ? ' with-thread' : ''}`}>
      <section className="dm-main">
        <header className="dm-header">
          <div className="dm-header-meta">
            <span className="dm-sub">
              自分専用のスペースです。下書き・メモ・リンク置き場にどうぞ。
            </span>
          </div>
        </header>

        <div className="dm-feed" ref={feedRef}>
          {topLevel.length === 0 && (
            <p className="empty">まだメッセージはありません。下から送ってみましょう。</p>
          )}
          {renderFeed(topLevel)}
        </div>

        <div className="dm-composer">
          <Composer placeholder="メッセージを入力（Enter で送信）" onSend={(t) => post(t)} />
        </div>
      </section>

      {threadParent && (
        <aside className="dm-thread">
          <header className="thread-header">
            <span className="thread-title">スレッド</span>
            <button className="thread-close" onClick={() => setOpenThreadId(null)} title="閉じる">
              ✕
            </button>
          </header>
          <div className="thread-feed">
            <MessageRow msg={threadParent} inThread />
            <div className="thread-replies-divider">
              <span>{threadReplies.length}件の返信</span>
            </div>
            {renderFeed(threadReplies, true)}
          </div>
          <div className="dm-composer">
            <Composer
              placeholder="スレッドに返信する"
              autoFocus
              onSend={(t) => post(t, threadParent.id)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
