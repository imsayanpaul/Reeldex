// Session token storage. The DM magic link arrives as ?token=…; we store it and
// remove it from the address bar so it doesn't linger in history or screenshots.
const TOKEN_KEY = 'reelmind_token'; // kept from earlier versions so existing sessions survive
const NAME_KEY = 'reelmind_display_name';
const LINKED_KEY = 'reelmind_is_linked';

export const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* private mode */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* private mode */ }
  },
  json(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
};

let launchParams = null;

// Reads ?token= and ?new_reel= once, then cleans them out of the URL
export function readLaunchParams() {
  if (launchParams) return launchParams;
  const params = new URLSearchParams(window.location.search);
  launchParams = { token: params.get('token'), newReel: params.get('new_reel') };
  if (launchParams.token) storage.set(TOKEN_KEY, launchParams.token);
  if (launchParams.token || launchParams.newReel) {
    params.delete('token');
    params.delete('new_reel');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  return launchParams;
}

export function getToken() {
  readLaunchParams();
  return storage.get(TOKEN_KEY) || '';
}

export function saveSession(data) {
  if (data?.auth_token) storage.set(TOKEN_KEY, data.auth_token);
  if (data?.display_name) storage.set(NAME_KEY, data.display_name);
  if (data?.is_instagram_linked !== undefined) storage.set(LINKED_KEY, String(data.is_instagram_linked));
}

export function cachedSession() {
  return {
    auth_token: getToken(),
    display_name: storage.get(NAME_KEY) || '',
    is_instagram_linked: storage.get(LINKED_KEY) === 'true',
    instagram_username: null,
  };
}
