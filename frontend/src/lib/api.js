import { getToken } from './session';

const ROOT = (import.meta.env.VITE_API_URL || 'https://reeldex-api.onrender.com').replace(/\/+$/, '');
export const API_BASE = `${ROOT}/api`;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// JSON request with the session token in the Authorization header (never the URL)
export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Can’t reach ReelDex. Check your connection and try again.', 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : null;
    const fallback = res.status === 429 ? 'Too many requests. Wait a moment and try again.' : 'Something went wrong. Please try again.';
    throw new ApiError(detail || fallback, res.status);
  }
  return data;
}

// /api/thumbnail/… paths come back relative; make them absolute for <img>
export function assetUrl(url) {
  if (!url) return null;
  return url.startsWith('/api/') ? `${ROOT}${url}` : url;
}

export function reelThumb(reel) {
  if (!reel) return null;
  return assetUrl(reel.thumbnail_url || (reel.shortcode ? `/api/thumbnail/${reel.shortcode}` : null));
}
