import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, FolderPlus, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { reelThumb } from '../lib/api';
import { copyText, openInstagramUrl } from '../lib/format';

const overlayStack = [];

// Locks page scroll while an overlay is open; Escape closes only the topmost one
export function useOverlay(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    overlayStack.push(token);
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && overlayStack[overlayStack.length - 1] === token) closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      overlayStack.splice(overlayStack.indexOf(token), 1);
      if (!overlayStack.length) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
}

export function Dialog({ open, onClose, title, kicker, children, footer, wide }) {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="rd-overlay" onClick={onClose} />
      <div className="rd-dialog" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 640 } : undefined}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-white/10">
          <div className="min-w-0">
            {kicker && <div className="rd-mono text-white/50 mb-2">{kicker}</div>}
            <h2 className="rd-display text-[34px]">{title}</h2>
          </div>
          <button type="button" className="rd-icon-btn shrink-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-white/10">{footer}</div>}
      </div>
    </>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="rd-btn rd-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="rd-btn rd-btn-danger" onClick={run} disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}{confirmLabel}
          </button>
        </>
      )}
    >
      <p className="m-0 text-white/75">{body}</p>
    </Dialog>
  );
}

export function PromptDialog({ open, title, label, initial = '', confirmLabel = 'Save', onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);
  const submit = async (e) => {
    e?.preventDefault();
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    try { await onSubmit(name); onClose(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="rd-btn rd-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="rd-prompt" className="rd-btn rd-btn-blue" disabled={busy || !value.trim()}>
            {busy && <Loader2 size={16} className="animate-spin" />}{confirmLabel}
          </button>
        </>
      )}
    >
      <form id="rd-prompt" onSubmit={submit}>
        <label className="rd-label text-white/60 block mb-2" htmlFor="rd-prompt-input">{label}</label>
        <input
          id="rd-prompt-input"
          className="rd-input rd-input-dark"
          value={value}
          maxLength={100}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </Dialog>
  );
}

const DM_URL = 'https://ig.me/m/reeldex.io';

export function PairDialog({ open, onClose, generate, onLinked, linked }) {
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || code) return;
    setBusy(true);
    generate()
      .then((d) => setCode(d.code))
      .catch((err) => toast.error(err.message))
      .finally(() => setBusy(false));
  }, [open, code, generate]);

  // While the dialog is open, check every few seconds whether the DM arrived
  useEffect(() => {
    if (!open || !code) return undefined;
    const t = setInterval(onLinked, 4000);
    return () => clearInterval(t);
  }, [open, code, onLinked]);

  useEffect(() => { if (!open) { setCode(null); setCopied(false); } }, [open]);

  const copy = async () => {
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Dialog open={open} onClose={onClose} kicker="instagram" title={linked ? 'Connected' : 'Link Instagram'}>
      {linked ? (
        <p className="m-0 text-white/75">Your Instagram is connected. Share any reel to <b className="text-white">@reeldex.io</b> in a DM and it shows up here.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ol className="m-0 pl-5 text-white/75 flex flex-col gap-1.5">
            <li>Copy this code.</li>
            <li>Send it to <b className="text-white">@reeldex.io</b> in an Instagram DM.</li>
            <li>That's it. Reels you share there land in this vault.</li>
          </ol>
          <div className="rd-ticket flex items-center justify-between gap-3">
            <div>
              <div className="rd-mono opacity-70">your code · valid 20 min</div>
              <div className="rd-display text-[clamp(30px,8.5vw,40px)] mt-1 tracking-normal whitespace-nowrap">
                {busy || !code ? <Loader2 className="animate-spin" size={28} /> : code}
              </div>
            </div>
            <button type="button" className="rd-btn rd-btn-white rd-btn-sm" onClick={copy} disabled={!code}>
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className="rd-btn rd-btn-blue w-full" onClick={(e) => openInstagramUrl(DM_URL, e)}>
            Open Instagram DM
          </button>
          <p className="m-0 rd-mono text-white/45 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> waiting for your message…
          </p>
        </div>
      )}
    </Dialog>
  );
}

// Pick reels from the vault (used to fill or edit a collection)
export function ReelPicker({ open, onClose, reels, title, initial = [], confirmLabel = 'Save', onSubmit }) {
  const [picked, setPicked] = useState(() => new Set(initial));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const initialKey = initial.join(',');

  useEffect(() => {
    if (open) { setPicked(new Set(initialKey ? initialKey.split(',').map(Number) : [])); setQ(''); }
  }, [open, initialKey]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return reels;
    return reels.filter((r) => `${r.title} ${r.author || ''} ${r.category}`.toLowerCase().includes(term));
  }, [reels, q]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    setBusy(true);
    try { await onSubmit([...picked]); onClose(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={(
        <>
          <span className="rd-mono text-white/50 mr-auto self-center">{picked.size} selected</span>
          <button type="button" className="rd-btn rd-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="rd-btn rd-btn-blue" onClick={submit} disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}{confirmLabel}
          </button>
        </>
      )}
    >
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input className="rd-input rd-input-dark" style={{ paddingLeft: 40, minHeight: 46 }} placeholder="Search your reels" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <p className="text-white/50 m-0">No reels match.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {list.map((r) => {
            const on = picked.has(r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={on}
                  className={`w-full flex items-center gap-3 p-2 rounded-md text-left border cursor-pointer transition-colors ${on ? 'border-[var(--blue)] bg-[var(--blue)]/15' : 'border-white/10 bg-transparent hover:bg-white/5'}`}
                >
                  <span className="rd-thumb" style={{ width: 36, height: 48 }}>
                    {reelThumb(r) && <img src={reelThumb(r)} alt="" loading="lazy" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-semibold text-[15px]">{r.title}</span>
                    <span className="block rd-mono text-white/45 truncate">{r.author ? `@${r.author} · ` : ''}{r.category}</span>
                  </span>
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'bg-[var(--blue)] border-[var(--blue)]' : 'border-white/30'}`}>
                    {on && <Check size={14} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

// Choose one collection (or none) for a set of reels
export function CollectionPicker({ open, onClose, collections, current, onPick, onCreate, allowNone = true, title = 'Move to' }) {
  const [busy, setBusy] = useState(null);
  const pick = async (c) => {
    setBusy(c?.id ?? 'none');
    try { await onPick(c); onClose(); } catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-1.5">
        {collections.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c)}
            disabled={busy !== null}
            className={`flex items-center justify-between gap-3 px-4 min-h-[50px] rounded-md border text-left cursor-pointer ${current === c.id ? 'border-[var(--blue)] bg-[var(--blue)]/15' : 'border-white/10 bg-transparent hover:bg-white/5'}`}
          >
            <span className="font-semibold truncate">{c.name}</span>
            <span className="flex items-center gap-2 rd-mono text-white/50">
              {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : current === c.id ? <Check size={16} className="text-white" /> : `${c.count}`}
            </span>
          </button>
        ))}
        {collections.length === 0 && <p className="m-0 mb-2 text-white/55">No collections yet.</p>}
        <button type="button" className="rd-btn rd-btn-line mt-2" onClick={onCreate}>
          <FolderPlus size={16} /> New collection
        </button>
        {allowNone && current && (
          <button type="button" className="rd-btn rd-btn-ghost" onClick={() => pick(null)} disabled={busy !== null}>
            Remove from collection
          </button>
        )}
      </div>
    </Dialog>
  );
}
