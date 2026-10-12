import { useEffect, useState } from 'react';
import { Check, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Dialog } from './Dialog';

const CATEGORIES = ['Idea', 'Bug', 'Praise', 'Other'];

export function FeedbackDialog({ open, onClose, page }) {
  const [category, setCategory] = useState('Idea');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setSent(false);
    return undefined;
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (message.trim().length < 2) return;
    setBusy(true);
    try {
      await api('/feedback', { method: 'POST', body: { category, rating: rating || null, message: message.trim(), contact: contact.trim() || null, page } });
      setSent(true);
      setMessage('');
      setRating(0);
      setContact('');
      setCategory('Idea');
      setTimeout(onClose, 1800);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      kicker="feedback"
      title={sent ? 'Thank you' : 'Tell us what you think'}
      footer={!sent && (
        <>
          <button type="button" className="rd-btn rd-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="rd-feedback" className="rd-btn rd-btn-blue" disabled={busy || message.trim().length < 2}>
            {busy && <Loader2 size={16} className="animate-spin" />} Send
          </button>
        </>
      )}
    >
      {sent ? (
        <p className="m-0 flex items-center gap-2 text-white/80"><Check size={18} className="text-[var(--green)]" /> Got it. Every message is read.</p>
      ) : (
        <form id="rd-feedback" onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <div className="rd-label text-white/55 mb-2">What is it about?</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`h-9 px-4 rounded-full border text-[14px] font-semibold cursor-pointer transition-colors ${category === c ? 'bg-white text-[var(--ink)] border-white' : 'bg-transparent text-white/75 border-white/20 hover:border-white/50'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="rd-label text-white/55 mb-2">How is ReelDex so far? <span className="rd-mono normal-case text-white/35">optional</span></div>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-0 cursor-pointer"
                >
                  <Star size={24} className={n <= rating ? 'text-[var(--blue)] fill-[var(--blue)]' : 'text-white/30'} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="rd-label text-white/55 block mb-2" htmlFor="rd-feedback-message">Message</label>
            <textarea
              id="rd-feedback-message"
              className="rd-input rd-input-dark resize-y py-3 leading-relaxed"
              style={{ minHeight: 120 }}
              maxLength={2000}
              placeholder={category === 'Bug' ? 'What happened, and what did you expect?' : 'What would make ReelDex better for you?'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="rd-label text-white/55 block mb-2" htmlFor="rd-feedback-contact">
              Email or Instagram <span className="rd-mono normal-case text-white/35">optional, if you'd like a reply</span>
            </label>
            <input
              id="rd-feedback-contact"
              className="rd-input rd-input-dark"
              maxLength={200}
              placeholder="you@example.com or @handle"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}
