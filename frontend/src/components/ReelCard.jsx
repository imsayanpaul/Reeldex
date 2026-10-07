import { memo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, FolderInput, Loader2, RotateCw } from 'lucide-react';
import { reelThumb } from '../lib/api';
import { formatDate, isPending, STATUS_LABEL, summaryText } from '../lib/format';

const TONES = ['is-white', 'is-blue', 'is-gray'];

export const NO_SPEECH_LINE = 'No one talks in this reel, so there’s nothing to transcribe.';

export function Thumb({ reel, className = 'rd-thumb', style }) {
  const [broken, setBroken] = useState(false);
  const src = reelThumb(reel);
  return (
    <span className={className} style={style}>
      {src && !broken && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />}
    </span>
  );
}

function ReelCardBase({ reel, index, selecting, selected, onOpen, onToggle, onMove, onRetry }) {
  const pending = isPending(reel);
  const failed = reel.status === 'failed';
  const tone = failed ? 'is-gray' : TONES[index % TONES.length];
  const summary = reel.no_speech && !reel.from_caption
    ? NO_SPEECH_LINE
    : summaryText(reel.summary) || reel.preview_text;

  const activate = () => (selecting ? onToggle(reel.id) : onOpen(reel.id));

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selecting ? selected : undefined}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      className={`rd-card ${tone}${selected ? ' is-selected' : ''}${pending ? ' is-pending' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        {pending ? (
          <span className="rd-pill"><Loader2 size={13} className="animate-spin" />{STATUS_LABEL[reel.status] || 'Processing'}</span>
        ) : failed ? (
          <span className="rd-pill" style={{ color: 'var(--red)' }}><AlertTriangle size={13} />Failed</span>
        ) : (
          <span className="rd-pill max-w-[75%] overflow-hidden text-ellipsis">{reel.category}</span>
        )}
        {selecting ? (
          <span className="rd-check" aria-hidden="true">{selected && <Check size={16} strokeWidth={3} />}</span>
        ) : (
          <span className="rd-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span>
        )}
      </div>

      <h3 className="rd-card-title">
        {pending ? 'Transcribing this reel…' : reel.title}
      </h3>
      {failed ? (
        <p className="rd-card-summary mt-2 mb-0 opacity-75">{reel.error_message || 'We couldn’t process this reel.'}</p>
      ) : summary && !pending ? (
        <p className="rd-card-summary mt-2 mb-0 opacity-75">{summary}</p>
      ) : null}

      <div className="mt-auto pt-5 flex items-end gap-3">
        <Thumb reel={reel} />
        <div className="min-w-0 flex-1 rd-card-meta">
          {reel.author && <div className="text-[13px] font-semibold truncate">@{reel.author}</div>}
          <div className="rd-mono truncate">
            {formatDate(reel.created_at)}{reel.no_speech ? ' · no talking' : ''}{reel.collection_name ? ` · ${reel.collection_name}` : ''}
          </div>
        </div>
        {!selecting && failed && (
          <button
            type="button"
            className="rd-btn rd-btn-white rd-btn-sm"
            onClick={(e) => { e.stopPropagation(); onRetry(reel.id); }}
          >
            <RotateCw size={14} /> Retry
          </button>
        )}
        {!selecting && !pending && !failed && (
          <button
            type="button"
            className="rd-arrow bg-transparent cursor-pointer"
            style={{ color: 'inherit', width: 34, height: 34 }}
            onClick={(e) => { e.stopPropagation(); onMove(reel); }}
            aria-label={reel.collection_name ? `In ${reel.collection_name}. Move to another collection` : 'Add to a collection'}
            title={reel.collection_name ? 'Move to collection' : 'Add to collection'}
          >
            <FolderInput size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export const ReelCard = memo(ReelCardBase);

export function CardSkeleton() {
  return <div className="rd-skeleton" style={{ minHeight: 236 }} />;
}
