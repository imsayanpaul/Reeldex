import { Fragment, useState } from 'react';
import { ArrowUpRight, Check, Loader2, Minus, Plus } from 'lucide-react';
import { cleanActions, formatDate, isPending, STATUS_LABEL, summaryText } from '../lib/format';
import { NO_SPEECH_LINE, Thumb } from './ReelCard';

// Category checkboxes beside the table (multi-select; none ticked = everything)
function FilterSidebar({ counts, cats, onToggleCat, onClear }) {
  return (
    <aside className="hidden min-[900px]:block w-[240px] shrink-0">
      <div className="sticky top-[calc(var(--nav-h)+16px)] bg-white rounded-lg border border-[var(--line-light)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--line-light)]">
          <span className="rd-label">Categories</span>
          {cats.size > 0 && (
            <button type="button" onClick={onClear} className="rd-mono bg-transparent border-0 cursor-pointer text-[var(--blue)]">clear</button>
          )}
        </div>
        <ul className="m-0 p-2 list-none max-h-[60vh] overflow-y-auto">
          {counts.map(([name, n]) => {
            const on = cats.has(name);
            return (
              <li key={name}>
                <label className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer hover:bg-black/5">
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggleCat(name)} />
                  <span className={`w-[18px] h-[18px] rounded-[3px] border-2 flex items-center justify-center shrink-0 ${on ? 'bg-[var(--ink)] border-[var(--ink)] text-white' : 'border-black/35'}`}>
                    {on && <Check size={12} strokeWidth={3.5} />}
                  </span>
                  <span className="flex-1 text-[14px] font-medium leading-tight">{name}</span>
                  <span className="rd-mono text-black/45">{n}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

export function ReelTable({ reels, counts, cats, onToggleCat, onClearCats, onOpen, selecting, selected, onToggle }) {
  const [open, setOpen] = useState(() => new Set());
  const flip = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex gap-6 items-start">
      <FilterSidebar counts={counts} cats={cats} onToggleCat={onToggleCat} onClear={onClearCats} />

      <div className="flex-1 min-w-0 bg-white rounded-lg border border-[var(--line-light)] overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-[var(--ink)]">
              <th className="rd-label px-4 py-3">Reels</th>
              <th className="rd-label px-4 py-3 hidden md:table-cell w-[190px]">Category</th>
              <th className="rd-label px-4 py-3 hidden sm:table-cell w-[110px]">Saved</th>
              <th className="w-[64px]"><span className="sr-only">Expand</span></th>
            </tr>
          </thead>
          <tbody>
            {reels.map((r) => {
              const expanded = open.has(r.id);
              const pending = isPending(r);
              const isSel = selected.has(r.id);
              const actions = expanded ? cleanActions(r.action_items).slice(0, 6) : [];
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`border-b border-[var(--line-light)] cursor-pointer transition-colors ${isSel ? 'bg-[var(--blue-soft)]' : 'hover:bg-black/[0.03]'}`}
                    onClick={() => (selecting ? onToggle(r.id) : flip(r.id))}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {selecting && (
                          <span className={`w-[20px] h-[20px] rounded-[3px] border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-[var(--blue)] border-[var(--blue)] text-white' : 'border-black/35'}`}>
                            {isSel && <Check size={13} strokeWidth={3.5} />}
                          </span>
                        )}
                        <Thumb reel={r} style={{ width: 34, height: 44 }} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[15px] leading-snug line-clamp-2">
                            {pending ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{STATUS_LABEL[r.status]}…</span> : r.title}
                          </div>
                          <div className="rd-mono text-black/50 truncate">
                            {r.author ? `@${r.author}` : r.status === 'failed' ? 'failed' : ''}
                            <span className="md:hidden">{r.author ? ' · ' : ''}{r.category}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell"><span className="rd-pill rd-pill-soft">{r.category}</span></td>
                    <td className="px-4 py-3 hidden sm:table-cell rd-mono text-black/60">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      {!selecting && (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-[1.5px] border-[var(--ink)]" aria-label={expanded ? 'Collapse' : 'Expand'}>
                          {expanded ? <Minus size={15} /> : <Plus size={15} />}
                        </span>
                      )}
                    </td>
                  </tr>
                  {expanded && !selecting && (
                    <tr className="border-b border-[var(--line-light)] bg-[#f6f6f4]">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="flex flex-col gap-3 max-w-[760px]">
                          <p className="m-0 text-[15px] text-black/75">
                            {r.no_speech && !r.from_caption
                              ? NO_SPEECH_LINE
                              : summaryText(r.summary) || r.preview_text || r.error_message || 'No summary yet.'}
                          </p>
                          {actions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {actions.map((a, i) => <span key={i} className="rd-pill rd-pill-soft">{a.text.length > 48 ? `${a.text.slice(0, 46)}…` : a.text}</span>)}
                            </div>
                          )}
                          <div>
                            <button type="button" className="rd-btn rd-btn-ink rd-btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>
                              Open reel <ArrowUpRight size={15} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
