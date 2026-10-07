import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, ArrowUpRight, Check, Copy, Download, Loader2, MessageCircle, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { copyText, downloadFile, fileSafe, isInstagramUrl, openInstagramUrl, sanitizeMarkdown, toMarkdown, toWhatsApp } from '../lib/format';

const SUGGESTIONS = [
  'What AI & design tools were mentioned?',
  'List all key websites and tools mentioned',
  'What are the top health & wellness tips?',
];

const mdComponents = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => isInstagramUrl(href) && openInstagramUrl(href, e)}
    >
      {children}
    </a>
  ),
};

function CopyButton({ label, icon: Icon, onCopy }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="rd-btn rd-btn-line rd-btn-sm !border-white/20"
      onClick={async () => { await onCopy(); setDone(true); setTimeout(() => setDone(false), 1500); }}
    >
      {done ? <Check size={14} /> : <Icon size={14} />}{done ? 'Copied' : label}
    </button>
  );
}

function Answer({ msg, question, onOpen, onMore, busy }) {
  const cites = (msg.citations || []).filter((c) => c && (c.reel_id || c.id)).slice(0, 8);
  return (
    <div className="flex flex-col gap-4">
      <div className="rd-prose text-white/90">
        <ReactMarkdown components={mdComponents}>{sanitizeMarkdown(msg.content)}</ReactMarkdown>
      </div>

      {cites.length > 0 && (
        <div>
          <div className="rd-label text-white/45 mb-2">From your reels</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {cites.map((c, i) => (
              <button
                key={`${c.reel_id || c.id}-${i}`}
                type="button"
                onClick={() => onOpen(c.reel_id || c.id)}
                className={`rd-card shrink-0 w-[220px] !min-h-0 !p-3 ${['is-white', 'is-blue', 'is-gray'][i % 3]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[14px] font-semibold leading-snug line-clamp-2">{c.title}</span>
                  <ArrowUpRight size={15} className="shrink-0" />
                </div>
                {c.author && <span className="rd-mono opacity-60 mt-2 truncate">@{c.author}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <CopyButton label="WhatsApp" icon={MessageCircle} onCopy={() => copyText(toWhatsApp(msg.content))} />
        <CopyButton label="Markdown" icon={Copy} onCopy={() => copyText(toMarkdown(msg.content))} />
        <button
          type="button"
          className="rd-btn rd-btn-line rd-btn-sm !border-white/20"
          onClick={() => downloadFile(`# ${question}\n\n${toMarkdown(msg.content)}\n`, `${fileSafe(question).slice(0, 60)}.md`, 'text/markdown;charset=utf-8')}
        >
          <Download size={14} /> .md
        </button>
        {onMore && (
          <button type="button" className="rd-btn rd-btn-ghost rd-btn-sm text-[#8ea6ff]" onClick={onMore} disabled={busy}>
            <Plus size={14} /> Show more results
          </button>
        )}
      </div>
    </div>
  );
}

export default function AskDex({ messages, setMessages, onOpen, reelCount }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await api('/chat', { method: 'POST', body: { question, history }, signal: ctrl.signal });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || '', citations: data.citations || [] }]);
    } catch (err) {
      if (err.name === 'AbortError') return;
      toast.error(err.message);
      setMessages((prev) => prev.slice(0, -1));
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => { e.preventDefault(); send(input); };

  // The question an answer was replying to (for file names and "show more")
  const questionFor = (i) => {
    for (let j = i - 1; j >= 0; j -= 1) if (messages[j].role === 'user') return messages[j].content;
    return 'answer';
  };

  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant');

  return (
    <section className="rd-ink-grid min-h-[calc(100vh-var(--nav-h))] flex flex-col">
      <div className="rd-wrap flex-1 flex flex-col max-w-[880px] pt-10 md:pt-14 pb-[calc(var(--tabbar-h)+120px)] min-[900px]:pb-36">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <div className="rd-mono text-white/55 mb-3">ai across {reelCount} saved reel{reelCount === 1 ? '' : 's'}</div>
            <h1 className="rd-display text-[clamp(56px,11vw,120px)]">Ask <span className="text-[var(--blue)]">Dex</span></h1>
          </div>
          {messages.length > 0 && (
            <button type="button" className="rd-btn rd-btn-line rd-btn-sm !border-white/25 shrink-0" onClick={() => setMessages([])} disabled={busy}>
              <RotateCcw size={14} /> New chat
            </button>
          )}
        </div>

        {messages.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className={`rd-card !min-h-[150px] ${['is-white', 'is-blue', 'is-gray'][i]}`}
              >
                <span className="rd-arrow self-end"><ArrowUpRight size={16} /></span>
                <span className="mt-auto text-[19px] font-semibold leading-tight" style={{ fontStretch: '92%' }}>{s}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-8">
          {messages.map((m, i) => (m.role === 'user' ? (
            <div key={i} className="self-end max-w-[85%] bg-[var(--blue)] text-white rounded-lg rounded-br-sm px-4 py-3 text-[15px] whitespace-pre-wrap break-words">
              {m.content}
            </div>
          ) : (
            <div key={i} className="border-l-2 border-[var(--blue)] pl-4 md:pl-5">
              <Answer
                msg={m}
                question={questionFor(i)}
                onOpen={onOpen}
                busy={busy}
                onMore={i === lastAssistant ? () => send(`Show more results for ${questionFor(i)}: list any remaining items, tips, advice, or resources from my saved reels that were NOT mentioned in your previous answer above.`) : null}
              />
            </div>
          )))}
          {busy && (
            <div className="flex items-center gap-3 text-white/60 pl-4">
              <Loader2 size={16} className="animate-spin" /><span className="rd-mono">reading your reels…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="fixed z-40 left-0 right-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] min-[900px]:bottom-0 bg-gradient-to-t from-[var(--ink)] via-[var(--ink)] to-transparent pt-6 pb-3 md:pb-6">
        <form onSubmit={submit} className="rd-wrap max-w-[880px] flex gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="rd-input rd-input-dark flex-1 resize-none py-[14px] leading-snug max-h-40"
            placeholder="Ask anything about your saved reels"
            aria-label="Ask Dex"
            value={input}
            maxLength={1000}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
            }}
          />
          <button type="submit" className="rd-btn rd-btn-blue !px-0 w-[52px] shrink-0" style={{ minHeight: 52 }} disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} />}
          </button>
        </form>
      </div>
    </section>
  );
}
