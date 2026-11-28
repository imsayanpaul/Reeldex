import { api } from './api';
import { getToken, storage } from './session';

// Full reel details (summary, key points, transcript) are only fetched when a reel is
// opened, and the API takes up to a second. Remember the ones already opened, and start
// fetching as soon as a pointer reaches a card, so a saved reel opens instantly.

const KEY = 'reeldex_reel_details';
const MAX_SAVED = 40; // transcripts can be long: keep the most recent ones on this device

const memory = new Map(); // id -> detail, most recently used last
const inflight = new Map(); // id -> promise
let owner = null; // the session the cache belongs to

function ownedBy() {
  return getToken() || null;
}

function ensureOwner() {
  const current = ownedBy();
  if (owner === current) return;
  owner = current;
  memory.clear();
  inflight.clear();
  const saved = storage.json(KEY, null);
  if (saved && saved.owner === current && Array.isArray(saved.items)) {
    for (const item of saved.items) if (item?.id) memory.set(item.id, item);
  }
}

function persist() {
  const items = [...memory.values()].slice(-MAX_SAVED);
  storage.set(KEY, { owner, items });
}

function remember(id, detail) {
  memory.delete(id);
  memory.set(id, detail);
  while (memory.size > MAX_SAVED * 2) memory.delete(memory.keys().next().value);
  persist();
}

/** The detail already on this device, or null. */
export function peekReel(id) {
  ensureOwner();
  return memory.get(id) || null;
}

/** Fetch the latest detail (shared by everyone asking for the same reel at once). */
export function fetchReel(id) {
  ensureOwner();
  if (inflight.has(id)) return inflight.get(id);
  const forOwner = owner;
  const request = api(`/reels/${id}`)
    .then((detail) => {
      if (owner === forOwner) remember(id, detail);
      return detail;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}

/** Warm the cache before a click; never throws. Only finished reels are worth keeping. */
export function prefetchReel(reel) {
  if (!reel?.id || reel.status !== 'completed') return;
  ensureOwner();
  const cached = memory.get(reel.id);
  if ((cached && cached.status === 'completed') || inflight.has(reel.id)) return;
  fetchReel(reel.id).catch(() => { /* the real open will show the error */ });
}

/** Drop details for deleted reels. */
export function forgetReels(ids) {
  ensureOwner();
  let changed = false;
  for (const id of ids) changed = memory.delete(id) || changed;
  if (changed) persist();
}
