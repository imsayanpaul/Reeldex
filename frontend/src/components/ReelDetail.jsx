import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileText, FolderInput, Languages, Loader2, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  cleanActions, copyText, downloadFile, fileSafe, formatDate, isInstagramUrl, isPending, linkify,
  openInstagramUrl, STATUS_LABEL, summaryText, toSrt,
} from '../lib/format';
import { ConfirmDialog, useOverlay } from './Dialog';
import { Thumb } from './ReelCard';

const clock = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const isEnglish = (lang) => !lang || /^(en|english)/i.test(lang);

function Section({ title, children, action }) {
  return (
    <section className="py-7 border-t border-white/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="rd-label text-white/55 m-0">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReelDetail({ reelId, vault, onClose, onMove }) {
  const listReel = vault.reels.find((r) => r.id === reelId);
  const [reel, setReel] = useState(null);
  const [error, setError] = useState(null);
  const [translated, setTranslated] = useState(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTimes, setShowTimes] = useState(true);

  useOverlay(true, onClose);

  // Load the full reel; reload when processing finishes
  const status = listReel?.status;
  const { getReel } = vault;
  useEffect(() => {
    const ctrl = { cancelled: false };
    setError(null);
    getReel(reelId)
      .then((d) => { if (!ctrl.cancelled) setReel(d); })
      .catch((err) => { if (!ctrl.cancelled) setError(err); });
    return () => { ctrl.cancelled = true; };
  }, [reelId, status, getReel]);

  const data = reel?.id === reelId ? { ...reel, ...(listReel || {}), transcript: reel.transcript } : listReel;
  const t = data?.transcript;
  const pending = isPending(data);
  const failed = data?.status === 'failed';
  const actions = useMemo(() => cleanActions(data?.action_items), [data?.action_items]);
  const tools = actions.filter((a) => a.type !== 'step');
  const steps = actions.filter((a) => a.type === 'step');
  const keyPoints = (t?.key_points || []).map((k) => (typeof k === 'string' ? k : k?.text || k?.point || '')).filter(Boolean);
  const canTranslate = t && !isEnglish(t.language);

  const tr = translated || (t?.translated_text ? { translated_text: t.translated_text, translated_summary: t.translated_summary } : null);
  const summary = showTranslated && tr?.translated_summary ? tr.translated_summary : summaryText(t?.summary || data?.summary);
  const fullText = showTranslated && tr?.translated_text ? tr.translated_text : t?.full_text || '';
  const segments = showTranslated ? [] : (t?.segments || []).filter((s) => s && s.text);

  const toggleTranslate = async () => {
    if (showTranslated) { setShowTranslated(false); return; }
    if (tr?.translated_text) { setShowTranslated(true); return; }
    setTranslating(true);
    try {
      const d = await vault.translate(reelId);
      setTranslated(d);
      setShowTranslated(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const copyTranscript = async () => {
    await copyText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const name = fileSafe(data?.title);

  return (
    <>
      <div className="rd-overlay" onClick={onClose} />
      <aside className="rd-sheet" role="dialog" aria-modal="true" aria-label={data?.title || 'Reel'}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 md:px-6 h-[60px] shrink-0 border-b border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button type="button" className="rd-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          <div className="flex-1" />
          {data?.reel_url && (
            <a href={data.reel_url} target="_blank" rel="noopener noreferrer" className="rd-btn rd-btn-white rd-btn-sm" onClick={(e) => isInstagramUrl(data.reel_url) && openInstagramUrl(data.reel_url, e)}>
              <ExternalLink size={15} /> <span className="max-sm:hidden">Watch on</span> Instagram
            </a>
          )}
          {data && !pending && (
            <button type="button" className="rd-icon-btn" onClick={() => onMove(data)} aria-label="Move to collection" title="Move to collection"><FolderInput size={17} /></button>
          )}
          {data && (
            <button type="button" className="rd-icon-btn hover:!border-[var(--red)] hover:!text-[var(--red)]" onClick={() => setConfirmDelete(true)} aria-label="Delete reel" title="Delete"><Trash2 size={17} /></button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!data ? (
            <div className="p-8">
              {error ? <p className="text-white/70">{error.message}</p> : <Loader2 className="animate-spin text-white/60" />}
            </div>
          ) : (
            <div className="px-5 md:px-8 pt-7 pb-16">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="rd-pill">{data.category}</span>
                {data.collection_name && <span className="rd-pill rd-pill-ink">{data.collection_name}</span>}
                {canTranslate && <span className="rd-pill rd-pill-ink uppercase">{t.language}</span>}
              </div>

              <h2 className="rd-display text-[clamp(36px,7vw,56px)] break-words" style={{ lineHeight: 0.92 }}>
                {pending ? 'Transcribing…' : data.title}
              </h2>

              <div className="flex items-center gap-3 mt-6">
                <Thumb reel={data} style={{ width: 40, height: 52 }} />
                <div className="min-w-0">
                  {data.author && <div className="font-semibold truncate">@{data.author}</div>}
                  <div className="rd-mono text-white/50">
                    saved {formatDate(data.created_at).toLowerCase()}{data.duration ? ` · ${clock(data.duration)}` : ''}
                  </div>
                </div>
              </div>

              {pending && (
                <div className="rd-ticket mt-8 flex items-center gap-4">
                  <Loader2 className="animate-spin shrink-0" size={22} />
                  <div>
                    <div className="rd-label">{STATUS_LABEL[data.status] || 'Processing'}</div>
                    <div className="text-white/80 text-[14px] mt-0.5">This usually takes under a minute. The page updates on its own.</div>
                  </div>
                </div>
              )}

              {failed && (
                <div className="mt-8 rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-5">
                  <div className="flex items-center gap-2 rd-label text-[var(--red)]"><AlertTriangle size={15} /> Couldn’t process this reel</div>
                  <p className="text-white/75 text-[14px] mt-2 mb-4">{data.error_message || 'Something went wrong while fetching or transcribing it.'}</p>
                  <button type="button" className="rd-btn rd-btn-white rd-btn-sm" onClick={() => vault.retryReel(reelId)}><RotateCw size={15} /> Try again</button>
                </div>
              )}

              {!pending && !failed && (
                <>
                  {canTranslate && (
                    <button type="button" className="rd-btn rd-btn-line rd-btn-sm mt-7" onClick={toggleTranslate} disabled={translating}>
                      {translating ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
                      {showTranslated ? 'Show original' : 'Translate to English'}
                    </button>
                  )}

                  {summary && (
                    <Section title="Summary">
                      <p className="m-0 text-[17px] leading-relaxed text-white/90">{linkify(summary)}</p>
                    </Section>
                  )}

                  {keyPoints.length > 0 && (
                    <Section title="Key points">
                      <ul className="m-0 p-0 list-none flex flex-col gap-3">
                        {keyPoints.map((k, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="rd-mono text-[var(--blue)] pt-1 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                            <span className="text-white/85">{linkify(k)}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {tools.length > 0 && (
                    <Section title="Tools & links">
                      <div className="flex flex-wrap gap-2">
                        {tools.map((a, i) => (
                          <span key={i} className={`rd-pill ${a.type === 'code' ? '' : 'rd-pill-ink'} !h-auto min-h-[32px] py-1 whitespace-normal`}>
                            {a.type === 'code' && <span className="rd-mono opacity-60">code</span>}
                            {linkify(a.text)}
                          </span>
                        ))}
                      </div>
                    </Section>
                  )}

                  {steps.length > 0 && (
                    <Section title="Steps & takeaways">
                      <ol className="m-0 p-0 list-none flex flex-col gap-2">
                        {steps.map((a, i) => (
                          <li key={i} className="flex gap-3 bg-white/[0.04] border border-white/10 rounded-md p-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full border border-white/40 rd-mono shrink-0" style={{ fontSize: 11 }}>{i + 1}</span>
                            <span className="text-white/85 text-[15px]">{linkify(a.text)}</span>
                          </li>
                        ))}
                      </ol>
                    </Section>
                  )}

                  {fullText && (
                    <Section
                      title="Transcript"
                      action={segments.length > 0 && (
                        <button type="button" className="rd-mono bg-transparent border-0 cursor-pointer text-white/55 hover:text-white" onClick={() => setShowTimes((v) => !v)}>
                          {showTimes ? 'hide times' : 'show times'}
                        </button>
                      )}
                    >
                      <div className="flex flex-wrap gap-2 mb-4">
                        <button type="button" className="rd-btn rd-btn-line rd-btn-sm" onClick={copyTranscript}>
                          {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
                        </button>
                        <button type="button" className="rd-btn rd-btn-line rd-btn-sm" onClick={() => downloadFile(fullText, `${name}.txt`)}>
                          <FileText size={15} /> .txt
                        </button>
                        {!showTranslated && (
                          <button type="button" className="rd-btn rd-btn-line rd-btn-sm" onClick={() => downloadFile(toSrt(t, data.duration), `${name}.srt`, 'application/x-subrip;charset=utf-8')}>
                            <Download size={15} /> Subtitles .srt
                          </button>
                        )}
                      </div>
                      {segments.length > 0 && showTimes ? (
                        <div className="flex flex-col gap-2.5">
                          {segments.map((s, i) => (
                            <p key={i} className="m-0 flex gap-3 text-[15px] leading-relaxed text-white/80">
                              <span className="rd-mono text-white/40 pt-[3px] w-[38px] shrink-0">{clock(s.start)}</span>
                              <span>{String(s.text).trim()}</span>
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="m-0 text-[15px] leading-relaxed text-white/80 whitespace-pre-wrap">{fullText}</p>
                      )}
                    </Section>
                  )}

                  {!t && (
                    <p className="mt-8 text-white/55">No speech was found in this reel (it may be music only).</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this reel?"
        body="Its transcript and summary are removed from your vault. This can’t be undone."
        onConfirm={async () => { onClose(); await vault.deleteReels([reelId]); }}
      />
    </>
  );
}
