import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { assetUrl } from '../lib/api';
import { ConfirmDialog, PromptDialog, ReelPicker } from './Dialog';
import { ReelCard } from './ReelCard';

function Collage({ thumbs }) {
  const cells = [0, 1, 2, 3].map((i) => thumbs[i] ? assetUrl(thumbs[i]) : null);
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-1 aspect-[4/3] rounded-md overflow-hidden">
      {cells.map((src, i) => (
        <div key={i} className="bg-black/10 overflow-hidden">
          {src && <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        </div>
      ))}
    </div>
  );
}

export function CollectionsView({ vault, collectionId, onOpenCollection, onOpen, onMove }) {
  const { collections, reels } = vault;
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [picking, setPicking] = useState(false);

  const current = collectionId ? collections.find((c) => c.id === collectionId) : null;
  const members = useMemo(
    () => (current ? reels.filter((r) => r.collection_id === current.id) : []),
    [reels, current],
  );
  const pickable = useMemo(() => reels.filter((r) => r.status === 'completed' || r.collection_id === current?.id), [reels, current]);

  const create = async (name) => {
    const c = await vault.createCollection(name);
    toast.success(`Created “${c.name}”`);
    onOpenCollection(c.id);
    setPicking(true);
  };

  // --- One collection ---
  if (collectionId) {
    if (!current) {
      return (
        <section className="rd-paper min-h-[80vh]">
          <div className="rd-wrap py-16">
            <button type="button" className="rd-btn rd-btn-line rd-btn-sm" onClick={() => onOpenCollection(null)}><ArrowLeft size={15} /> All collections</button>
            <p className="mt-8 text-black/60">{collections.length ? 'This collection no longer exists.' : 'Loading…'}</p>
          </div>
        </section>
      );
    }
    return (
      <section className="rd-paper min-h-[80vh]">
        <div className="rd-wrap pt-8 md:pt-12 pb-32">
          <button type="button" className="rd-btn rd-btn-line rd-btn-sm mb-8" onClick={() => onOpenCollection(null)}>
            <ArrowLeft size={15} /> All collections
          </button>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div className="min-w-0">
              <div className="rd-mono text-black/55 mb-3">collection · {members.length} reel{members.length === 1 ? '' : 's'}</div>
              <h1 className="rd-display text-[clamp(48px,9vw,112px)] break-words">{current.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rd-btn rd-btn-blue" onClick={() => setPicking(true)}><ListPlus size={17} /> Add or remove reels</button>
              <button type="button" className="rd-btn rd-btn-line" onClick={() => setRenaming(true)}><Pencil size={15} /> Rename</button>
              <button type="button" className="rd-btn rd-btn-line text-[var(--red)]" onClick={() => setDeleting(true)} aria-label="Delete collection"><Trash2 size={15} /></button>
            </div>
          </div>

          {members.length === 0 ? (
            <div className="bg-white rounded-lg border border-[var(--line-light)] p-10 text-center">
              <div className="rd-display text-[40px]">Empty for now</div>
              <p className="text-black/60 mt-3 mb-5">Pick reels from your vault to keep them together here.</p>
              <button type="button" className="rd-btn rd-btn-ink" onClick={() => setPicking(true)}><Plus size={16} /> Add from saved</button>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((r, i) => (
                <ReelCard key={r.id} reel={r} index={i} selecting={false} selected={false} onOpen={onOpen} onToggle={() => {}} onMove={onMove} onRetry={vault.retryReel} />
              ))}
            </div>
          )}
        </div>

        <ReelPicker
          open={picking}
          onClose={() => setPicking(false)}
          reels={pickable}
          title={`Reels in ${current.name}`}
          initial={members.map((r) => r.id)}
          onSubmit={async (ids) => { await vault.setCollectionReels(current, ids); toast.success(`${current.name} updated`); }}
        />
        <PromptDialog
          open={renaming}
          onClose={() => setRenaming(false)}
          title="Rename"
          label="Collection name"
          initial={current.name}
          onSubmit={(name) => vault.renameCollection(current, name)}
        />
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete “${current.name}”?`}
          body="The collection goes away. The reels in it stay in your vault."
          onConfirm={async () => { onOpenCollection(null); await vault.deleteCollection(current); }}
        />
      </section>
    );
  }

  // --- All collections ---
  return (
    <section className="rd-paper min-h-[80vh]">
      <div className="rd-wrap pt-12 md:pt-16 pb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="rd-mono text-black/55 mb-3">{collections.length} collection{collections.length === 1 ? '' : 's'}</div>
            <h1 className="rd-display text-[clamp(52px,9vw,112px)]">Collections</h1>
          </div>
          <button type="button" className="rd-btn rd-btn-blue self-start md:self-auto" onClick={() => setCreating(true)}><Plus size={17} /> New collection</button>
        </div>

        {collections.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rd-card is-blue" style={{ cursor: 'default', minHeight: 220 }}>
              <span className="rd-pill self-start">Tip</span>
              <h3 className="rd-card-title mt-6">Group reels by project, trip or anything else.</h3>
              <button type="button" className="rd-btn rd-btn-white rd-btn-sm mt-auto self-start" onClick={() => setCreating(true)}><Plus size={15} /> Create your first</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {collections.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenCollection(c.id)}
                className={`rd-card ${['is-white', 'is-blue', 'is-gray'][i % 3]}`}
                style={{ minHeight: 0, padding: 12 }}
              >
                <Collage thumbs={c.thumbnails || []} />
                <div className="flex items-center justify-between gap-3 px-1 pt-3 pb-1">
                  <div className="min-w-0">
                    <div className="rd-title text-[20px] truncate">{c.name}</div>
                    <div className="rd-mono opacity-60 mt-1">{c.count} reel{c.count === 1 ? '' : 's'}</div>
                  </div>
                  <span className="rd-arrow"><ArrowUpRight size={16} /></span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <PromptDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New collection"
        label="Name"
        confirmLabel="Create"
        onSubmit={create}
      />
    </section>
  );
}
