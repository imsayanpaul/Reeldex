import { FolderOpen, LayoutGrid, MessageSquare } from 'lucide-react';

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
    <button type="button" onClick={onClick} className="flex items-baseline gap-0.5 bg-transparent border-0 p-0 cursor-pointer" aria-label="ReelDex home">
      <span className="rd-display text-[30px] leading-none">ReelDex</span>
      <span className="text-[var(--blue)] text-[30px] font-black leading-none -translate-y-1">✱</span>
    </button>
  );
}

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
          <button type="button" onClick={onLink} className="rd-pill rd-pill-ink cursor-pointer max-w-[46vw]">
            <span className="w-2 h-2 rounded-full bg-[var(--green)] shrink-0" />
            <span className="truncate">{session.instagram_username ? `@${session.instagram_username.replace(/^@/, '')}` : 'Instagram linked'}</span>
          </button>
        ) : (
          <button type="button" onClick={onLink} className="rd-btn rd-btn-blue rd-btn-sm">
            <InstagramIcon size={16} /> Link Instagram
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
