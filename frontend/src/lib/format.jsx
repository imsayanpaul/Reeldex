// Text, link and export helpers shared across the app.

export const IN_FLIGHT = ['processing', 'downloading', 'transcribing'];
export const isPending = (reel) => IN_FLIGHT.includes(reel?.status);

export const STATUS_LABEL = {
  processing: 'Queued',
  downloading: 'Fetching audio',
  transcribing: 'Transcribing',
  failed: 'Failed',
};

export function actionText(item) {
  if (!item) return '';
  if (typeof item === 'string') {
    const s = item.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return actionText(JSON.parse(s)); } catch { return ''; }
    }
    return s;
  }
  if (typeof item === 'object') {
    const text = item.text || item.name || item.value || item.title || item.action || item.item || item.tool || item.code || '';
    return typeof text === 'string' ? text.trim() : '';
  }
  return String(item).trim();
}

export function actionType(item) {
  const t = typeof item === 'object' && item ? String(item.type || '').toLowerCase() : '';
  if (t.includes('tool') || t.includes('link') || t.includes('website')) return 'tool';
  if (t.includes('promo') || t.includes('code')) return 'code';
  return 'step';
}

export const cleanActions = (items) => (Array.isArray(items) ? items : [])
  .map((a) => ({ text: actionText(a), type: actionType(a) }))
  .filter((a) => a.text && !/^(none|n\/a|not mentioned)/i.test(a.text));

export function summaryText(summary) {
  if (!summary) return '';
  if (typeof summary === 'string') return summary;
  if (typeof summary === 'object') return summary.summary || summary.text || '';
  return String(summary);
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

export const isInstagramUrl = (url) => typeof url === 'string' && /instagram\.com|instagr\.am|ig\.me/i.test(url);

// Opens Instagram links in the app on phones, a new tab elsewhere
export function openInstagramUrl(rawUrl, e) {
  if (e?.preventDefault) { e.preventDefault(); e.stopPropagation(); }
  if (!rawUrl) return;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (rawUrl.includes('ig.me') || rawUrl.includes('/m/')) {
    if (isAndroid) { window.location.href = 'intent://instagram.com/_u/reeldex.io/#Intent;package=com.instagram.android;scheme=https;end'; return; }
    if (isIOS) {
      window.location.href = 'instagram://user?username=reeldex.io';
      setTimeout(() => { window.location.href = 'https://ig.me/m/reeldex.io'; }, 1200);
      return;
    }
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const shortcode = rawUrl.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i)?.[1];
  if (isAndroid) {
    const path = shortcode ? `reel/${shortcode}/` : rawUrl.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '');
    window.location.href = `intent://instagram.com/${path}#Intent;package=com.instagram.android;scheme=https;end`;
    return;
  }
  if (isIOS && shortcode) {
    window.location.href = `instagram://reel?shortcode=${shortcode}`;
    setTimeout(() => { window.location.href = `https://www.instagram.com/reel/${shortcode}/`; }, 1200);
    return;
  }
  window.open(rawUrl, '_blank', 'noopener,noreferrer');
}

const URL_RE = /(https?:\/\/[^\s,)]+|(?:[a-zA-Z0-9-]+\.)+(?:com|dev|ai|io|net|org|app|co|xyz|so|me|tech|site|online|space|store|design|tools|club|live|pro|agency|studio)(?:\/[^\s,)]*)?)/gi;

// Plain text with web addresses turned into links
export function linkify(text) {
  const str = summaryText(text);
  if (!str) return '';
  const out = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(str)) !== null) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const raw = m[1];
    const clean = raw.replace(/[.,;:)]+$/, '');
    const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    out.push(
      <a
        key={m.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="rd-link"
        onClick={(e) => (isInstagramUrl(href) ? openInstagramUrl(href, e) : e.stopPropagation())}
      >
        {clean}
      </a>,
    );
    if (raw.length > clean.length) out.push(raw.slice(clean.length));
    last = m.index + raw.length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out.length ? out : str;
}

// --- AI answer clean-up and exports ---

export function sanitizeMarkdown(text) {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(cleaned)) cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  // Close links the model left unclosed; well-formed links are left alone
  return cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?=\s|$)/g, (_, label, url) => `[${label}](${url.replace(/[.;,]+$/, '')})`);
}

function trimBrokenTail(text) {
  return text
    .replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*\]?\s*\(?\s*https?:\/\/[^)\s]*$/gi, '')
    .replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*$/gi, '')
    .replace(/(\n|\s)*[-*•]?\s*\*\*[^*]+$/gi, '');
}

export function toWhatsApp(markdown) {
  let text = trimBrokenTail(sanitizeMarkdown(markdown));
  text = text.replace(/^#{1,4}\s+(.+)$/gm, '\n*$1*\n');
  text = text.replace(/(?:\*?Source:\*?\s*)?\[([^\]]+)\]\((https?:\/\/[^\s)\n]+)\)*\s*(?:by|•)?\s*(@\w+)?/gi, (_, label, url, creator) => {
    const u = url.replace(/\)+$/, '').trim();
    return creator ? `🔗 ${u} (${creator.trim()})` : `🔗 ${u}`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  text = text.replace(/^[\s]*[-*+]\s+/gm, '• ');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function toMarkdown(markdown) {
  let text = trimBrokenTail(sanitizeMarkdown(markdown));
  text = text.replace(/(?:\*?Source:\*?\s*)?\[([^\]]+)\]\((https?:\/\/[^\s)\n]+)\)*\s*(?:by|•)?\s*(@\w+)?/gi, (_, label, url, creator) => {
    const u = url.replace(/\)+$/, '').trim();
    return creator ? `[Watch Video](${u}) by ${creator.trim()}` : `[Watch Video](${u})`;
  });
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function downloadFile(content, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const srtTime = (sec) => {
  const ms = Math.max(0, Math.round((Number(sec) || 0) * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

// Real timed captions from the transcript segments (falls back to one cue)
export function toSrt(transcript, duration) {
  const segs = (transcript?.segments || []).filter((s) => s && s.text);
  if (!segs.length) {
    const text = transcript?.full_text || '';
    return text ? `1\n${srtTime(0)} --> ${srtTime(duration || 10)}\n${text}\n` : '';
  }
  return segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end || s.start + 2)}\n${String(s.text).trim()}\n`).join('\n');
}

export const fileSafe = (s) => String(s || 'reel').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'reel';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
