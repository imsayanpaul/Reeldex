import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { cachedSession, readLaunchParams, saveSession, storage } from './session';
import { isPending } from './format';

const REELS_KEY = 'reelmind_cached_reels';
const COLLECTIONS_KEY = 'reelmind_cached_collections';

// Everything the app knows about the signed-in library, plus the actions on it.
// Shows the last cached library instantly, then keeps it fresh by polling:
// every 3.5s while a reel is processing, every 15s otherwise, paused in background tabs.
export function useVault() {
  const [session, setSession] = useState(cachedSession);
  const [ready, setReady] = useState(false);
  const [reels, setReels] = useState(() => storage.json(REELS_KEY, []));
  const [collections, setCollections] = useState(() => storage.json(COLLECTIONS_KEY, []));
  const [categories, setCategories] = useState(['All']);
  const [loading, setLoading] = useState(() => storage.json(REELS_KEY, []).length === 0);
  const lastReelsJson = useRef('');
  const lastCollectionsJson = useRef('');

  const putReels = useCallback((next) => {
    setReels((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      storage.set(REELS_KEY, value);
      return value;
    });
  }, []);

  const putCollections = useCallback((next) => {
    setCollections((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      storage.set(COLLECTIONS_KEY, value);
      return value;
    });
  }, []);

  // 1. Session: restore (or start a guest session), then load
  useEffect(() => {
    readLaunchParams();
    api('/auth/session', { method: 'POST', body: { token: cachedSession().auth_token || null } })
      .then((data) => {
        saveSession(data);
        setSession(data);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setReady(true));
    api('/categories').then((d) => setCategories(d.categories || ['All'])).catch(() => {});
  }, []);

  const refreshReels = useCallback(async () => {
    try {
      const data = await api('/reels?category=All');
      const json = JSON.stringify(data);
      if (json !== lastReelsJson.current) { // skip re-rendering when nothing changed
        lastReelsJson.current = json;
        putReels(data || []);
      }
    } catch (err) {
      if (err.status === 401) storage.remove('reelmind_token');
    } finally {
      setLoading(false);
    }
  }, [putReels]);

  const refreshCollections = useCallback(async () => {
    try {
      const data = await api('/collections');
      const json = JSON.stringify(data);
      if (json !== lastCollectionsJson.current) {
        lastCollectionsJson.current = json;
        putCollections(data || []);
      }
    } catch { /* keep cached */ }
  }, [putCollections]);

  // 2. Polling
  const hasPending = reels.some(isPending);
  useEffect(() => {
    if (!ready || !session?.auth_token) return undefined;
    const load = () => { refreshReels(); refreshCollections(); };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, hasPending ? 3500 : 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, session?.auth_token, hasPending, refreshReels, refreshCollections]);

  // --- Actions ---

  const saveLink = useCallback(async (url) => {
    const data = await api('/transcribe', { method: 'POST', body: { url } });
    if (data.duplicate) toast.info('That reel is already in your vault.');
    else toast.success('Saved. Transcribing now…');
    await refreshReels();
    return data.reel_id;
  }, [refreshReels]);

  const getReel = useCallback((id) => api(`/reels/${id}`), []);

  const deleteReels = useCallback(async (ids) => {
    const set = new Set(ids);
    const before = reels;
    putReels((prev) => prev.filter((r) => !set.has(r.id)));
    try {
      if (ids.length === 1) await api(`/reels/${ids[0]}`, { method: 'DELETE' });
      else await api('/reels/batch/delete', { method: 'POST', body: { reel_ids: ids } });
      toast.success(ids.length === 1 ? 'Reel removed' : `${ids.length} reels removed`);
      refreshCollections();
    } catch (err) {
      putReels(before);
      toast.error(err.message);
    }
  }, [reels, putReels, refreshCollections]);

  const retryReel = useCallback(async (id) => {
    try {
      await api(`/reels/${id}/retry`, { method: 'POST' });
      putReels((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'processing', error_message: null } : r)));
      toast.info('Trying again…');
    } catch (err) {
      toast.error(err.message);
    }
  }, [putReels]);

  const moveReel = useCallback(async (id, collectionId) => {
    const data = await api(`/reels/${id}/collection`, { method: 'PATCH', body: { collection_id: collectionId } });
    putReels((prev) => prev.map((r) => (r.id === id ? { ...r, collection_id: data.collection_id, collection_name: data.collection_name } : r)));
    toast.success(collectionId ? `Moved to ${data.collection_name}` : 'Removed from collection');
    refreshCollections();
    return data;
  }, [putReels, refreshCollections]);

  // Adds reels to a collection without removing what's already there
  const addToCollection = useCallback(async (ids, collection) => {
    const keep = reels.filter((r) => r.collection_id === collection.id).map((r) => r.id);
    const all = [...new Set([...keep, ...ids])];
    await api('/reels/batch/assign', { method: 'POST', body: { reel_ids: all, collection_id: collection.id } });
    const set = new Set(ids);
    putReels((prev) => prev.map((r) => (set.has(r.id) ? { ...r, collection_id: collection.id, collection_name: collection.name } : r)));
    toast.success(`Added ${ids.length} to ${collection.name}`);
    refreshCollections();
  }, [reels, putReels, refreshCollections]);

  // Makes a collection contain exactly these reels
  const setCollectionReels = useCallback(async (collection, ids) => {
    await api('/reels/batch/assign', { method: 'POST', body: { reel_ids: ids, collection_id: collection.id } });
    const set = new Set(ids);
    putReels((prev) => prev.map((r) => {
      if (set.has(r.id)) return { ...r, collection_id: collection.id, collection_name: collection.name };
      if (r.collection_id === collection.id) return { ...r, collection_id: null, collection_name: null };
      return r;
    }));
    refreshCollections();
  }, [putReels, refreshCollections]);

  const createCollection = useCallback(async (name) => {
    const c = await api('/collections', { method: 'POST', body: { name } });
    putCollections((prev) => [{ ...c, thumbnails: [] }, ...prev.filter((x) => x.id !== c.id)]);
    return c;
  }, [putCollections]);

  const renameCollection = useCallback(async (collection, name) => {
    const data = await api(`/collections/${collection.id}`, { method: 'PATCH', body: { name } });
    putCollections((prev) => prev.map((c) => (c.id === collection.id ? { ...c, name: data.name } : c)));
    putReels((prev) => prev.map((r) => (r.collection_id === collection.id ? { ...r, collection_name: data.name } : r)));
    return data;
  }, [putCollections, putReels]);

  const deleteCollection = useCallback(async (collection) => {
    putCollections((prev) => prev.filter((c) => c.id !== collection.id));
    putReels((prev) => prev.map((r) => (r.collection_id === collection.id ? { ...r, collection_id: null, collection_name: null } : r)));
    try {
      await api(`/collections/${collection.id}`, { method: 'DELETE' });
      toast.success(`Deleted “${collection.name}”`);
    } catch (err) {
      toast.error(err.message);
      refreshCollections();
      refreshReels();
    }
  }, [putCollections, putReels, refreshCollections, refreshReels]);

  const translate = useCallback((id) => api(`/reels/${id}/translate`, { method: 'POST' }), []);

  const generatePairingCode = useCallback(() => api('/auth/generate-code', { method: 'POST', body: {} }), []);

  const refreshSession = useCallback(async () => {
    try {
      const data = await api('/auth/session', { method: 'POST', body: { token: cachedSession().auth_token || null } });
      saveSession(data);
      setSession(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const stats = useMemo(() => {
    const done = reels.filter((r) => r.status === 'completed');
    const tools = done.reduce((n, r) => n + (Array.isArray(r.action_items) ? r.action_items.length : 0), 0);
    const topics = new Set(done.map((r) => r.category).filter(Boolean)).size;
    return { reels: reels.length, tools, topics, collections: collections.length };
  }, [reels, collections]);

  return {
    session, ready, reels, collections, categories, loading, stats,
    refreshReels, refreshCollections, refreshSession,
    saveLink, getReel, deleteReels, retryReel, moveReel, addToCollection, setCollectionReels,
    createCollection, renameCollection, deleteCollection, translate, generatePairingCode,
  };
}
