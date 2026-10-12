import { openInstagramUrl } from '../lib/format';

const PROFILE_URL = 'https://www.instagram.com/reeldex.io/';

// @reeldex.io as a link to the Instagram profile (opens the app on phones)
export function IgHandle({ className = 'text-white' }) {
  return (
    <a
      href={PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => openInstagramUrl(PROFILE_URL, e)}
      className={`font-bold underline decoration-white/30 underline-offset-4 hover:decoration-[var(--blue)] hover:text-white ${className}`}
    >
      @reeldex.io
    </a>
  );
}
