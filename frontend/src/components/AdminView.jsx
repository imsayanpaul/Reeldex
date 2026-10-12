import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from './Dialog';
import { api } from '../lib/api';
import { InstagramIcon } from './Nav';

const DAY = 86400000;

// 1234 -> "1.2k", 2500000 -> "2.5M"
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));
const minutes = (sec) => (sec ? `${Math.round(sec / 6) / 10} min` : '—');
const FEATURE_LABEL = { transcription: 'Transcription', insights: 'Insights', 'ask-dex': 'Ask Dex', translate: 'Translate' };

const ago = (iso) => {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
};
const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const within = (iso, days) => Boolean(iso) && Date.now() - new Date(iso).getTime() <= days * DAY;

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'linked', label: 'Instagram linked', test: (u) => u.linked },
  { id: 'reels', label: 'Has reels', test: (u) => u.reels > 0 },
  { id: 'active7', label: 'Active 7 days', test: (u) => within(u.lastActiveAt, 7) },
  { id: 'new7', label: 'Joined 7 days', test: (u) => within(u.joinedAt, 7) },
  { id: 'failed', label: 'Has failed reels', test: (u) => u.failed > 0 },
  { id: 'guests', label: 'Guests, no reels', test: (u) => !u.linked && u.reels === 0 },
  { id: 'ai', label: 'Used AI', test: (u) => u.aiCalls > 0 },
];

const COLUMNS = [
  { key: 'user', label: 'User', sort: (u) => (u.instagram || u.name || '').toLowerCase() },
  { key: 'joinedAt', label: 'Joined', sort: (u) => u.joinedAt || '' },
  { key: 'lastActiveAt', label: 'Last active', sort: (u) => u.lastActiveAt || '' },
  { key: 'reels', label: 'Reels', sort: (u) => u.reels, num: true },
  { key: 'failed', label: 'Failed', sort: (u) => u.failed, num: true },
  { key: 'fromDm', label: 'Via DM', sort: (u) => u.fromDm, num: true },
  { key: 'collections', label: 'Collections', sort: (u) => u.collections, num: true },
  { key: 'savedChats', label: 'Saved chats', sort: (u) => u.savedChats, num: true },
  { key: 'tokens', label: 'AI tokens', sort: (u) => u.tokens, num: true },
  { key: 'audioSeconds', label: 'Audio', sort: (u) => u.audioSeconds, num: true },
  { key: 'lastReelAt', label: 'Last reel', sort: (u) => u.lastReelAt || '' },
];

function toCsv(users) {
  const head = ['id', 'name', 'instagram', 'linked', 'joined', 'last_active', 'last_seen', 'last_reel', 'reels', 'completed', 'failed', 'via_dm', 'collections', 'saved_chats', 'input_tokens', 'output_tokens', 'tokens_30d', 'audio_seconds', 'ai_calls'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.join(','), ...users.map((u) => [u.id, u.name, u.instagram, u.linked, u.joinedAt, u.lastActiveAt, u.lastSeenAt, u.lastReelAt, u.reels, u.completed, u.failed, u.fromDm, u.collections, u.savedChats, u.inputTokens, u.outputTokens, u.tokens30d, u.audioSeconds, u.aiCalls].map(esc).join(','))].join('\n');
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

export default function AdminView() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | denied | error
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'lastActiveAt', dir: 'desc' });
  const [cleanup, setCleanup] = useState(null); // { count } while the confirm dialog is open
  const [checking, setChecking] = useState(false);

  const previewCleanup = async () => {
    setChecking(true);
    try {
      const r = await api('/admin/cleanup-guests', { method: 'POST' });
      if (!r.count) toast.info('No empty guest accounts to delete.');
      else setCleanup(r);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  const runCleanup = async () => {
    const r = await api('/admin/cleanup-guests?dry_run=false', { method: 'POST' });
    toast.success(`Deleted ${r.deleted} empty guest account${r.deleted === 1 ? '' : 's'}.`);
    load();
  };

  const load = async () => {
    setState((s) => (s === 'ready' ? 'refreshing' : 'loading'));
    try {
      setData(await api('/admin/users'));
      setState('ready');
    } catch (err) {
      setState(err.status === 404 || err.status === 401 ? 'denied' : 'error');
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[2];
    return data.users
      .filter(test)
      .filter((u) => !q || `${u.id} ${u.name} ${u.instagram}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = col.sort(a); const y = col.sort(b);
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
  }, [data, query, filter, sort]);

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `reeldex-users-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (state === 'denied') {
    return (
      <section className="rd-ink-grid min-h-[70vh] flex items-center">
        <div className="rd-wrap">
          <div className="rd-mono text-white/50">404</div>
          <h1 className="rd-display text-[clamp(48px,9vw,96px)] mt-2">Not found</h1>
        </div>
      </section>
    );
  }

  const s = data?.summary;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

  return (
    <>
      <section className="rd-ink-grid border-b border-white/10">
        <div className="rd-wrap pt-10 md:pt-14 pb-8">
          <div className="rd-mono text-white/55 mb-3">admin · {data ? `updated ${ago(data.generatedAt)}` : 'loading'}</div>
          <h1 className="rd-display text-[clamp(56px,10vw,120px)]">Users</h1>
        </div>
        <div className="mx-auto max-w-[1280px] grid grid-cols-2 md:grid-cols-5 gap-px bg-white/10">
          <Stat label="users" value={s ? s.totalUsers : '…'} hint={s ? `+${s.newLast7Days} this week · ${s.linkedInstagram} linked Instagram` : ''} />
          <Stat label="active 7 days" value={s ? s.activeLast7Days : '…'} hint={s ? `${s.activeLast30Days} in the last 30 days` : ''} />
          <Stat label="reels saved" value={s ? s.totalReels : '…'} hint={s ? `+${s.reelsLast7Days} this week · ${pct(s.fromDm, s.totalReels)} via DM` : ''} />
          <Stat label="failed reels" value={s ? s.failedReels : '…'} hint={s ? `${pct(s.failedReels, s.totalReels)} of all reels` : ''} />
          <Stat label="ai tokens" value={s ? compact(s.totalTokens) : '…'} hint={s ? `${compact(s.tokensLast30Days)} in 30 days · ${minutes(s.audioSeconds)} audio` : ''} />
        </div>
        {data?.byFeature?.length > 0 && (
          <div className="mx-auto max-w-[1280px] px-5 md:px-6 py-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/10">
            {data.byFeature.map((f) => (
              <span key={f.feature} className="rd-mono text-white/55">
                {FEATURE_LABEL[f.feature] || f.feature} · <span className="text-white">{f.audioSeconds ? minutes(f.audioSeconds) : `${compact(f.tokens)} tokens`}</span> · {f.calls} calls
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rd-paper min-h-[60vh]">
        <div className="rd-wrap pt-8 pb-32">
          {state === 'error' && (
            <div className="mb-6 rounded-lg border border-[var(--red)]/40 bg-white p-4 text-[14px]">
              Couldn’t load users. Check Render’s logs, then try again.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/45 pointer-events-none" />
              <input
                className="rd-input"
                style={{ paddingLeft: 44, paddingRight: 40 }}
                placeholder="Search by name, Instagram or user id"
                aria-label="Search users"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-transparent border-0 cursor-pointer text-black/55" aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={load} className="rd-btn rd-btn-line text-[var(--ink)]" style={{ minHeight: 52 }} disabled={state === 'refreshing'}>
                {state === 'refreshing' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
              </button>
              <button type="button" onClick={exportCsv} className="rd-btn rd-btn-ink" style={{ minHeight: 52 }} disabled={!rows.length}>
                <Download size={16} /> CSV
              </button>
              <button type="button" onClick={previewCleanup} className="rd-btn rd-btn-line text-[var(--red)]" style={{ minHeight: 52 }} disabled={checking || !data} title="Delete guest accounts with no reels, collections, chats or Instagram">
                {checking ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Empty guests
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap mb-6" role="group" aria-label="Filter users">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="rd-chip shrink-0" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} {data && <span className="rd-mono">{data.users.filter(f.test).length}</span>}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg border border-[var(--line-light)] overflow-x-auto">
            <table className="w-full min-w-[1160px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-[var(--ink)]">
                  {COLUMNS.map((c) => (
                    <th key={c.key} scope="col" className="p-0" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`w-full h-11 px-4 inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer rd-label whitespace-nowrap ${c.num ? 'justify-end' : ''} ${sort.key === c.key ? 'text-[var(--ink)]' : 'text-black/45 hover:text-[var(--ink)]'}`}
                      >
                        {c.label}
                        {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!data && state === 'loading' && Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-[var(--line-light)]"><td colSpan={COLUMNS.length} className="px-4 py-4"><div className="rd-skeleton h-4 w-1/2" /></td></tr>
                ))}
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--line-light)] hover:bg-black/[0.03] align-top text-[var(--ink)]">
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="flex items-center gap-2 font-semibold text-[15px]">
                        {u.linked && <span className="text-[var(--blue)] shrink-0"><InstagramIcon size={14} /></span>}
                        <span className="truncate max-w-[240px]">{u.linked ? (u.instagram.startsWith('User #') ? u.instagram : `@${u.instagram}`) : 'Guest'}</span>
                      </div>
                      <div className="rd-mono text-black/45 mt-0.5">#{u.id}{u.name ? ` · ${u.name}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[14px] text-black/65" title={fullDate(u.joinedAt)}>{ago(u.joinedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[14px]" title={fullDate(u.lastActiveAt)}>
                      <span className={within(u.lastActiveAt, 7) ? 'text-[var(--blue)] font-semibold' : within(u.lastActiveAt, 30) ? '' : 'text-black/40'}>{ago(u.lastActiveAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[15px] font-semibold">{u.reels}</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-[15px] ${u.failed ? 'text-[var(--red)] font-semibold' : 'text-black/40'}`}>{u.failed}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[15px]">{u.fromDm}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[15px]">{u.collections}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[15px]">{u.savedChats}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[15px]" title={`${u.inputTokens.toLocaleString()} in · ${u.outputTokens.toLocaleString()} out · ${compact(u.tokens30d)} in the last 30 days · ${u.aiCalls} calls`}>
                      {u.tokens ? compact(u.tokens) : <span className="text-black/40">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[14px] whitespace-nowrap text-black/65">{minutes(u.audioSeconds)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[14px] text-black/65" title={fullDate(u.lastReelAt)}>{ago(u.lastReelAt)}</td>
                  </tr>
                ))}
                {data && !rows.length && (
                  <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-[15px] text-black/55">No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <ConfirmDialog
            open={!!cleanup}
            onClose={() => setCleanup(null)}
            title={`Delete ${cleanup?.count || 0} empty guests?`}
            body="These guest accounts have no Instagram link, reels, collections or saved chats, and haven't been active in the last 24 hours. Accounts with any data are never touched. This can't be undone."
            confirmLabel="Delete"
            onConfirm={runCleanup}
          />
          {data && (
            <p className="rd-mono text-black/50 mt-3 mb-0">
              {rows.length} of {data.users.length} users · “last active” is the latest of a visit, a saved reel or a saved chat
            </p>
          )}
        </div>
      </section>
    </>
  );
}
