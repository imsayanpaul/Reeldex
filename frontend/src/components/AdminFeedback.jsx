import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Search, Star, X } from 'lucide-react';
import { api } from '../lib/api';
import { InstagramIcon } from './Nav';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
};
const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const PAGE_LABEL = { vault: 'Vault', collections: 'Collections', ask: 'Ask Dex', admin: 'Admin' };

function Stars({ value }) {
  if (!value) return <span className="rd-mono text-black/40">no rating</span>;
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= value ? 'text-[var(--blue)] fill-[var(--blue)]' : 'text-black/20'} />)}
    </span>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-[var(--ink)] px-5 md:px-6 py-5 min-w-0">
      <div className="rd-mono text-white/50 truncate">{label}</div>
      <div className="rd-display text-[40px] mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-[13px] text-white/55 mt-1.5 truncate">{hint}</div>}
    </div>
  );
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [['date', 'category', 'rating', 'instagram', 'contact', 'page', 'user_id', 'message'].join(','),
    ...rows.map((f) => [f.createdAt, f.category, f.rating, f.instagram, f.contact, f.page, f.userId, f.message].map(esc).join(','))].join('\n');
}

// The stats strip (rendered inside the dark header) and the list (rendered on paper)
export function useAdminFeedback() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const load = async () => {
    setState((s) => (s === 'ready' ? 'refreshing' : 'loading'));
    try {
      setData(await api('/admin/feedback'));
      setState('ready');
    } catch (err) {
      setState(err.status === 404 || err.status === 401 ? 'denied' : 'error');
    }
  };
  useEffect(() => { load(); }, []);
  return { data, state, load };
}

export function FeedbackStats({ data }) {
  const s = data?.summary;
  return (
    <div className="mx-auto max-w-[1280px] grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
      <Stat label="feedback" value={s ? s.total : '…'} hint={s ? `+${s.last7Days} this week` : ''} />
      <Stat label="average rating" value={s ? (s.averageRating ?? '—') : '…'} hint={s?.averageRating ? 'out of 5' : ''} />
      <Stat label="from linked users" value={s ? s.fromLinked : '…'} hint={s ? `${s.total - s.fromLinked} from guests` : ''} />
      <Stat label="bugs" value={data ? data.feedback.filter((f) => f.category === 'Bug').length : '…'} hint="reported" />
    </div>
  );
}

export function FeedbackList({ data, state, onRefresh }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [rating, setRating] = useState('all');

  const categories = useMemo(() => [...new Set((data?.feedback || []).map((f) => f.category))].sort(), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.feedback.filter((f) =>
      (category === 'all' || f.category === category) &&
      (rating === 'all' || (rating === 'low' ? f.rating && f.rating <= 2 : rating === 'high' ? f.rating >= 4 : !f.rating)) &&
      (!q || `${f.message} ${f.instagram} ${f.contact}`.toLowerCase().includes(q)));
  }, [data, query, category, rating]);

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `reeldex-feedback-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/45 pointer-events-none" />
          <input className="rd-input" style={{ paddingLeft: 44, paddingRight: 40 }} placeholder="Search messages, Instagram or contact" aria-label="Search feedback" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-transparent border-0 cursor-pointer text-black/55" aria-label="Clear search"><X size={16} /></button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onRefresh} className="rd-btn rd-btn-line text-[var(--ink)]" style={{ minHeight: 52 }} disabled={state === 'refreshing'}>
            {state === 'refreshing' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
          <button type="button" onClick={exportCsv} className="rd-btn rd-btn-ink" style={{ minHeight: 52 }} disabled={!rows.length}><Download size={16} /> CSV</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap mb-3" role="group" aria-label="Filter by category">
        <button type="button" className="rd-chip shrink-0" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>
        {categories.map((c) => (
          <button key={c} type="button" className="rd-chip shrink-0" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c} <span className="rd-mono">{data.feedback.filter((f) => f.category === c).length}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap mb-6" role="group" aria-label="Filter by rating">
        {[['all', 'Any rating'], ['low', '1–2 stars'], ['high', '4–5 stars'], ['none', 'No rating']].map(([id, label]) => (
          <button key={id} type="button" className="rd-chip shrink-0" aria-pressed={rating === id} onClick={() => setRating(id)}>{label}</button>
        ))}
      </div>

      {state === 'error' && <div className="mb-4 rounded-lg border border-[var(--red)]/40 bg-white p-4 text-[14px]">Couldn’t load feedback. Try again.</div>}

      <div className="flex flex-col gap-3">
        {!data && state === 'loading' && Array.from({ length: 3 }, (_, i) => <div key={i} className="rd-skeleton" style={{ height: 110 }} />)}
        {rows.map((f) => (
          <article key={f.id} className="bg-white rounded-lg border border-[var(--line-light)] p-5 text-[var(--ink)]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={`rd-pill ${f.category === 'Bug' ? '' : 'rd-pill-soft'}`} style={f.category === 'Bug' ? { background: 'var(--red)', color: 'white' } : undefined}>{f.category}</span>
              <Stars value={f.rating} />
              {f.page && <span className="rd-mono text-black/45">from {PAGE_LABEL[f.page] || f.page}</span>}
              <span className="rd-mono text-black/45 ml-auto" title={fullDate(f.createdAt)}>{ago(f.createdAt)}</span>
            </div>
            <p className="m-0 mt-3 text-[16px] leading-relaxed whitespace-pre-wrap break-words">{f.message}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-black/60">
              {f.instagram ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]"><span className="text-[var(--blue)]"><InstagramIcon size={13} /></span>{f.instagram.startsWith('User #') ? f.instagram : `@${f.instagram}`}</span>
              ) : <span>Guest</span>}
              {f.contact && <span className="break-all">· reply to <b className="text-[var(--ink)]">{f.contact}</b></span>}
              {f.userId && <span className="rd-mono text-black/40">#{f.userId}</span>}
            </div>
          </article>
        ))}
        {data && !rows.length && <div className="bg-white rounded-lg border border-[var(--line-light)] p-10 text-center text-[15px] text-black/55">No feedback matches.</div>}
      </div>
      {data && <p className="rd-mono text-black/50 mt-3 mb-0">{rows.length} of {data.feedback.length} messages</p>}
    </>
  );
}
