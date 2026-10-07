import { useDeferredValue, useMemo, useState } from 'react';
import { Bookmark, FolderPlus, LayoutGrid, Layers, Link2, ListChecks, Loader2, Search, Table2, Trash2, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { storage } from '../lib/session';
import { cleanActions, isInstagramUrl, summaryText } from '../lib/format';
import { CardSkeleton, ReelCard } from './ReelCard';
import { ReelTable } from './ReelTable';
import { ConfirmDialog } from './Dialog';
import { InstagramIcon } from './Nav';

const VIEW_KEY = 'reeldex_vault_layout';

// Everything a search can match on, built once per reel list
function searchIndex(reels) {
  const map = new Map();
  for (const r of reels) {
    map.set(r.id, [
      r.title, r.author, r.category, summaryText(r.summary), r.preview_text,
      ...(r.tags || []), ...cleanActions(r.action_items).map((a) => a.text), r.collection_name,
    ].filter(Boolean).join(' ').toLowerCase());
  }
  return map;
}

function SaveLinkBar({ onSave }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (!isInstagramUrl(value)) { toast.error('Paste an Instagram reel link, like instagram.com/reel/…'); return; }
    setBusy(true);
    try { await onSave(value); setUrl(''); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 w-full max-w-[640px]">
      <div className="relative flex-1">
        <Link2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
        <input
          className="rd-input"
          style={{ paddingLeft: 44 }}
          type="url"
          inputMode="url"
          placeholder="Paste a reel link"
          aria-label="Instagram reel link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <button type="submit" className="rd-btn rd-btn-blue" style={{ minHeight: 52 }} disabled={busy || !url.trim()}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Bookmark size={18} />} Save reel
      </button>
    </form>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-4 py-5 px-5 md:px-8 bg-[var(--ink)]">
      <span className="flex items-center justify-center w-11 h-11 rounded-full border-[1.5px] border-white/80 shrink-0"><Icon size={18} /></span>
      <div className="min-w-0">
        <div className="rd-display text-[34px]">{value}</div>
        <div className="rd-mono text-white/55 mt-1">{label}</div>
      </div>
    </div>
  );
}

export function VaultView({ vault, onOpen, onMove, onAddToCollection, onLink }) {
  const { reels, loading, stats, session } = vault;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [cats, setCats] = useState(() => new Set());
  const [layout, setLayoutState] = useState(() => storage.get(VIEW_KEY) || 'cards');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setLayout = (v) => { setLayoutState(v); storage.set(VIEW_KEY, v); };

  const index = useMemo(() => searchIndex(reels), [reels]);

  const searched = useMemo(() => {
    const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return reels;
    return reels.filter((r) => {
      const hay = index.get(r.id) || '';
      return terms.every((t) => hay.includes(t));
    });
  }, [reels, index, deferredQuery]);

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of searched) if (r.category) m.set(r.category, (m.get(r.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [searched]);

  const visible = useMemo(
    () => (cats.size ? searched.filter((r) => cats.has(r.category)) : searched),
    [searched, cats],
  );

  const toggleCat = (name) => setCats((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const firstName = (session?.display_name || '').split(' ')[0];

  return (
    <>
      {/* Hero */}
      <section className="rd-ink-grid border-b border-white/10">
        <div className="rd-wrap pt-12 pb-10 md:pt-20 md:pb-16">
          <div className="rd-mono text-white/55 mb-5">{firstName ? `hey ${firstName.toLowerCase()} · ` : ''}your second brain for reels</div>
          <h1 className="rd-display text-[clamp(56px,11vw,148px)]">
            You saved it.<br /><span className="text-[var(--blue)]">Now find it.</span>
          </h1>
          <p className="mt-6 mb-8 max-w-[560px] text-white/70 text-[17px]">
            Every reel you send to <b className="text-white">@reeldex.io</b> is transcribed, summarised and searchable here, down to the tools and links it mentions.
          </p>
          <div className="rd-paper rounded-lg p-3 sm:p-4 max-w-[680px]" style={{ backgroundSize: '40px 40px' }}>
            <SaveLinkBar onSave={vault.saveLink} />
          </div>
          {!session?.is_instagram_linked && (
            <button type="button" onClick={onLink} className="mt-4 rd-btn rd-btn-ghost rd-btn-sm text-white/75 px-0 hover:bg-transparent hover:text-white">
              <InstagramIcon size={15} /> Or link Instagram and just share reels in a DM →
            </button>
          )}
        </div>
      </section>

      {/* Stats strip */}
      <section className="bg-[var(--ink)] border-b border-white/10">
        <div className="mx-auto max-w-[1280px] grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
          <Stat icon={Layers} value={stats.reels} label="reels saved" />
          <Stat icon={Wrench} value={stats.tools} label="tools & steps" />
          <Stat icon={LayoutGrid} value={stats.topics} label="topics" />
          <Stat icon={FolderPlus} value={stats.collections} label="collections" />
        </div>
      </section>

      {/* Library */}
      <section className="rd-paper min-h-[70vh]">
        <div className="rd-wrap pt-12 md:pt-16 pb-32">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
            <h2 className="rd-display text-[clamp(52px,9vw,112px)]">All reels</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded border-[1.5px] border-[var(--ink)] overflow-hidden" role="group" aria-label="Layout">
                <button type="button" onClick={() => setLayout('cards')} aria-pressed={layout === 'cards'} className={`flex items-center gap-2 px-3 h-10 border-0 cursor-pointer rd-label ${layout === 'cards' ? 'bg-[var(--ink)] text-white' : 'bg-white text-[var(--ink)]'}`}>
                  <LayoutGrid size={15} /> Cards
                </button>
                <button type="button" onClick={() => setLayout('table')} aria-pressed={layout === 'table'} className={`flex items-center gap-2 px-3 h-10 border-0 cursor-pointer rd-label ${layout === 'table' ? 'bg-[var(--ink)] text-white' : 'bg-white text-[var(--ink)]'}`}>
                  <Table2 size={15} /> Table
                </button>
              </div>
              {reels.length > 0 && (
                <button type="button" className={`rd-btn rd-btn-sm ${selecting ? 'rd-btn-ink' : 'rd-btn-line'}`} style={{ minHeight: 40 }} onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
                  <ListChecks size={15} /> {selecting ? 'Done' : 'Select'}
                </button>
              )}
            </div>
          </div>

          <div className="relative mb-4">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/45 pointer-events-none" />
            <input
              className="rd-input"
              style={{ paddingLeft: 46, paddingRight: 46 }}
              type="search"
              placeholder="Search titles, creators, tools, anything said in a reel"
              aria-label="Search reels"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer text-black/55 hover:bg-black/5" aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category chips (the table view uses the sidebar instead on desktop) */}
          {counts.length > 0 && (
            <div className={`flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap mb-8 ${layout === 'table' ? 'min-[900px]:hidden' : ''}`}>
              <button type="button" className="rd-chip" aria-pressed={cats.size === 0} onClick={() => setCats(new Set())}>
                All <span className="rd-mono">{searched.length}</span>
              </button>
              {counts.map(([name, n]) => (
                <button key={name} type="button" className="rd-chip" aria-pressed={cats.has(name)} onClick={() => toggleCat(name)}>
                  {name} <span className="rd-mono">{n}</span>
                </button>
              ))}
            </div>
          )}

          {loading && reels.length === 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : reels.length === 0 ? (
            <EmptyVault onLink={onLink} linked={session?.is_instagram_linked} />
          ) : visible.length === 0 ? (
            <div className="bg-white rounded-lg border border-[var(--line-light)] p-10 text-center">
              <div className="rd-display text-[40px]">Nothing found</div>
              <p className="text-black/60 mt-3 mb-5">No reels match {query ? `“${query}”` : 'these filters'}.</p>
              <button type="button" className="rd-btn rd-btn-ink" onClick={() => { setQuery(''); setCats(new Set()); }}>Clear search</button>
            </div>
          ) : layout === 'table' ? (
            <ReelTable
              reels={visible}
              counts={counts}
              cats={cats}
              onToggleCat={toggleCat}
              onClearCats={() => setCats(new Set())}
              onOpen={onOpen}
              selecting={selecting}
              selected={selected}
              onToggle={toggleSelect}
            />
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r, i) => (
                <ReelCard
                  key={r.id}
                  reel={r}
                  index={i}
                  selecting={selecting}
                  selected={selected.has(r.id)}
                  onOpen={onOpen}
                  onToggle={toggleSelect}
                  onMove={onMove}
                  onRetry={vault.retryReel}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Manage bar */}
      {selecting && (
        <div className="fixed z-[70] left-0 right-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] min-[900px]:bottom-0 px-3 pb-3">
          <div className="mx-auto max-w-[760px] flex items-center gap-2 bg-[var(--ink)] text-white rounded-lg border border-white/15 shadow-2xl p-2 pl-4">
            <span className="rd-label mr-auto">{selected.size} selected</span>
            <button
              type="button"
              className="rd-btn rd-btn-ghost rd-btn-sm"
              onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.id)))}
            >
              {allVisibleSelected ? 'None' : 'All'}
            </button>
            <button type="button" className="rd-btn rd-btn-blue rd-btn-sm" disabled={!selected.size} onClick={() => onAddToCollection([...selected], exitSelect)}>
              <FolderPlus size={15} /><span className="max-sm:hidden">Add to collection</span>
            </button>
            <button type="button" className="rd-btn rd-btn-danger rd-btn-sm" disabled={!selected.size} onClick={() => setConfirmDelete(true)} aria-label="Delete selected">
              <Trash2 size={15} /><span className="max-sm:hidden">Delete</span>
            </button>
            <button type="button" className="rd-icon-btn" style={{ width: 36, height: 36 }} onClick={exitSelect} aria-label="Stop selecting"><X size={16} /></button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selected.size} reel${selected.size === 1 ? '' : 's'}?`}
        body="Their transcripts and summaries are removed from your vault. This can’t be undone."
        onConfirm={async () => { await vault.deleteReels([...selected]); exitSelect(); }}
      />
    </>
  );
}

function EmptyVault({ onLink, linked }) {
  const steps = [
    ['01', 'Link Instagram', 'Send your one-time code to @reeldex.io in a DM.'],
    ['02', 'Share reels', 'Tap share on any reel and send it to @reeldex.io.'],
    ['03', 'Search & ask', 'Transcripts, summaries and tools land here in about a minute.'],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {steps.map(([n, title, body], i) => (
        <div key={n} className={`rd-card ${['is-white', 'is-blue', 'is-gray'][i]}`} style={{ cursor: 'default', minHeight: 200 }}>
          <span className="rd-pill self-start">Step {n}</span>
          <h3 className="rd-card-title mt-6">{title}</h3>
          <p className="rd-card-summary mt-2 mb-0 opacity-75">{body}</p>
          {i === 0 && !linked && (
            <button type="button" className="rd-btn rd-btn-ink rd-btn-sm mt-auto self-start" onClick={onLink}>Get my code</button>
          )}
        </div>
      ))}
    </div>
  );
}
