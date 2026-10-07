import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { useVault } from './lib/useVault';
import { readLaunchParams } from './lib/session';
import { Nav, TabBar, VIEWS } from './components/Nav';
import { VaultView } from './components/VaultView';
import { CollectionsView } from './components/CollectionsView';
import { ReelDetail } from './components/ReelDetail';
import { CollectionPicker, PairDialog, PromptDialog } from './components/Dialog';

// react-markdown only loads when someone opens Ask Dex
const AskDex = lazy(() => import('./components/AskDex'));

// --- Hash routes: #/vault, #/collections, #/collections/12, #/ask, plus ?reel=34 for the open reel ---
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const view = VIEWS.some((v) => v.id === parts[0]) ? parts[0] : 'vault';
  const collectionId = view === 'collections' && parts[1] ? Number(parts[1]) || null : null;
  const reel = Number(new URLSearchParams(query).get('reel')) || null;
  return { view, collectionId, reel };
}

const toHash = ({ view, collectionId, reel }) => `#/${view}${collectionId ? `/${collectionId}` : ''}${reel ? `?reel=${reel}` : ''}`;

function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onPop = () => setRoute(parseHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next, { replace = false, state = null } = {}) => {
    const url = `${window.location.pathname}${window.location.search}${toHash(next)}`;
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    setRoute(next);
  }, []);
  return [route, go];
}

const CHAT_KEY = 'reeldex_chat';
const CHAT_ID_KEY = 'reeldex_chat_id';
const loadChat = () => {
  try { return JSON.parse(sessionStorage.getItem(CHAT_KEY)) || []; } catch { return []; }
};
const loadChatId = () => {
  try { return Number(sessionStorage.getItem(CHAT_ID_KEY)) || null; } catch { return null; }
};

export default function App() {
  const vault = useVault();
  const [route, go] = useRoute();
  const [messages, setMessages] = useState(loadChat);
  const [chatId, setChatId] = useState(loadChatId); // set once the open chat is saved
  const [pairOpen, setPairOpen] = useState(false);
  const [move, setMove] = useState(null); // { ids, current, single, after }
  const [createFor, setCreateFor] = useState(null);

  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30))); } catch { /* private mode */ }
  }, [messages]);
  useEffect(() => {
    try {
      if (chatId) sessionStorage.setItem(CHAT_ID_KEY, String(chatId));
      else sessionStorage.removeItem(CHAT_ID_KEY);
    } catch { /* private mode */ }
  }, [chatId]);

  // A DM magic link can carry ?new_reel=ID: open that reel once we're signed in
  const launched = useRef(false);
  useEffect(() => {
    if (!vault.ready || launched.current) return;
    launched.current = true;
    const { newReel } = readLaunchParams();
    if (newReel && Number(newReel)) go({ ...parseHash(), reel: Number(newReel) }, { replace: true });
  }, [vault.ready, go]);

  // Celebrate the moment Instagram gets linked
  const linked = vault.session?.is_instagram_linked;
  const wasLinked = useRef(linked);
  const { refreshReels } = vault;
  useEffect(() => {
    if (linked && wasLinked.current === false) {
      toast.success('Instagram connected. Share a reel to @reeldex.io to try it.');
      refreshReels();
    }
    wasLinked.current = linked;
  }, [linked, refreshReels]);

  const setView = (view) => {
    if (view === route.view && !route.collectionId && !route.reel) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go({ view, collectionId: null, reel: null });
    window.scrollTo(0, 0);
  };

  const openReel = useCallback((id) => go({ ...parseHash(), reel: id }, { state: { reel: true } }), [go]);
  const closeReel = useCallback(() => {
    if (window.history.state?.reel) window.history.back();
    else go({ ...parseHash(), reel: null }, { replace: true });
  }, [go]);

  const openCollection = (id) => {
    go({ view: 'collections', collectionId: id, reel: null });
    window.scrollTo(0, 0);
  };

  const onMove = useCallback((reel) => setMove({ ids: [reel.id], current: reel.collection_id, single: true }), []);
  const onAddToCollection = useCallback((ids, after) => setMove({ ids, current: null, single: false, after }), []);

  const applyMove = async (target, collection) => {
    if (target.single) await vault.moveReel(target.ids[0], collection ? collection.id : null);
    else if (collection) { await vault.addToCollection(target.ids, collection); target.after?.(); }
  };

  return (
    <div className="min-h-screen pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] min-[900px]:pb-0">
      <Nav view={route.view} onView={setView} session={vault.session} onLink={() => setPairOpen(true)} />

      <main>
        {route.view === 'vault' && (
          <VaultView vault={vault} onOpen={openReel} onMove={onMove} onAddToCollection={onAddToCollection} onLink={() => setPairOpen(true)} />
        )}
        {route.view === 'collections' && (
          <CollectionsView vault={vault} collectionId={route.collectionId} onOpenCollection={openCollection} onOpen={openReel} onMove={onMove} />
        )}
        {route.view === 'ask' && (
          <Suspense fallback={<div className="rd-wrap py-20"><Loader2 className="animate-spin text-white/60" /></div>}>
            <AskDex messages={messages} setMessages={setMessages} chatId={chatId} setChatId={setChatId} onOpen={openReel} reelCount={vault.stats.reels} />
          </Suspense>
        )}
      </main>

      <TabBar view={route.view} onView={setView} />

      {route.reel && <ReelDetail key={route.reel} reelId={route.reel} vault={vault} onClose={closeReel} onMove={onMove} />}

      <CollectionPicker
        open={!!move}
        onClose={() => setMove(null)}
        collections={vault.collections}
        current={move?.current}
        allowNone={!!move?.single}
        title={move?.single ? 'Move to' : `Add ${move?.ids.length || ''} to`}
        onPick={(c) => applyMove(move, c)}
        onCreate={() => { setCreateFor(move); setMove(null); }}
      />
      <PromptDialog
        open={!!createFor}
        onClose={() => setCreateFor(null)}
        title="New collection"
        label="Name"
        confirmLabel="Create & add"
        onSubmit={async (name) => {
          const c = await vault.createCollection(name);
          await applyMove(createFor, c);
        }}
      />
      <PairDialog
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        generate={vault.generatePairingCode}
        onLinked={vault.refreshSession}
        linked={linked}
      />

      <Toaster position="top-center" />
    </div>
  );
}
