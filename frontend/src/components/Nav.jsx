import { ArrowUpRight, FolderOpen, LayoutGrid, MessageSquare } from 'lucide-react';

// lucide no longer ships brand icons
export function InstagramIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export const VIEWS = [
  { id: 'vault', label: 'Vault', icon: LayoutGrid },
  { id: 'collections', label: 'Collections', icon: FolderOpen },
  { id: 'ask', label: 'Ask Dex', icon: MessageSquare },
];

export function Wordmark({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="bg-transparent border-0 p-0 cursor-pointer" aria-label="ReelDex home">
      <span className="rd-display text-[30px] leading-none">ReelDex</span>
    </button>
  );
}

// The API falls back to "User #1234" when it doesn't know the real handle
const igHandle = (name) => {
  if (!name || /^User #/i.test(name)) return 'Instagram';
  return `@${name.replace(/^@/, '')}`;
};

export function Nav({ view, onView, session, onLink }) {
  const linked = session?.is_instagram_linked;
  return (
    <header className="sticky top-0 z-50 bg-[var(--ink)]/95 backdrop-blur border-b border-white/10">
      <div className="rd-wrap flex items-center justify-between gap-4" style={{ height: 'var(--nav-h)' }}>
        <Wordmark onClick={() => onView('vault')} />

        <nav className="hidden min-[900px]:flex items-center gap-1" aria-label="Main">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onView(v.id)}
              aria-current={view === v.id ? 'page' : undefined}
              className={`rd-label px-4 h-10 rounded border-0 cursor-pointer transition-colors ${view === v.id ? 'bg-white text-[var(--ink)]' : 'bg-transparent text-white/70 hover:text-white'}`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {linked ? (
          <button
            type="button"
            onClick={onLink}
            className="flex items-center gap-2 h-10 pl-1 pr-3 rounded border border-white/15 bg-white/[0.04] hover:border-white/35 hover:bg-white/[0.08] text-white cursor-pointer transition-colors max-w-[55vw]"
            title="Instagram connected"
          >
            <span className="relative flex items-center justify-center w-8 h-8 rounded-[3px] bg-[var(--blue)] shrink-0">
              <InstagramIcon size={16} />
              <span className="absolute -right-1 -bottom-1 w-2.5 h-2.5 rounded-full bg-[var(--green)] border-2 border-[var(--ink)]" />
            </span>
            <span className="rd-label truncate min-w-0" style={{ fontSize: 13 }}>{igHandle(session.instagram_username)}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onLink}
            className="group flex items-center gap-2 h-10 pl-1 pr-3 rounded bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white border-0 cursor-pointer transition-colors"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-[3px] bg-white text-[var(--blue)] shrink-0">
              <InstagramIcon size={16} />
            </span>
            <span className="rd-label whitespace-nowrap" style={{ fontSize: 13 }}>
              <span className="max-[359px]:hidden">Link Instagram</span><span className="hidden max-[359px]:inline">Link</span>
            </span>
            <ArrowUpRight size={15} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 max-[420px]:hidden" />
          </button>
        )}
      </div>
    </header>
  );
}

export function TabBar({ view, onView }) {
  return (
    <nav className="rd-tabbar" aria-label="Main">
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const on = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            aria-current={on ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-1 bg-transparent border-0 cursor-pointer ${on ? 'text-white' : 'text-white/50'}`}
          >
            <span className={`flex items-center justify-center w-12 h-7 rounded-full ${on ? 'bg-[var(--blue)]' : ''}`}><Icon size={18} /></span>
            <span className="rd-label" style={{ fontSize: 11 }}>{v.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
