// ─────────────────────────────────────────────────────────────
// Project menu: canvases in this browser, import/export, share links.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, ChevronDown, CopyPlus, Download, LayoutGrid, Link2, Pencil, Plus, Search, Sparkles, Trash2, Upload,
} from 'lucide-react';
import { slugify, uid } from '@/engine/model';
import { createBlankProject } from '@/engine/defaults';
import { normalizeProject, serializeProject } from '@/engine/schema';
import { encodeShare, shareUrl } from '@/engine/share';
import { timeAgo } from '../lib/color-ui';
import { renameProject } from '../actions';
import { createSampleProject } from '../sample';
import { getEditor, useEditor } from '../store';
import { type CanvasMeta, createCanvas, deleteCanvas, listCanvases, openCanvas } from '../persist';
import { downloadText } from '../panels/download';
import {
  Button, CommitInput, Dialog, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, TextInput, cn,
} from '../ui';

const RECENT = 6;

const failed = (what: string) => (err: unknown) =>
  toast.error(what, { description: err instanceof Error ? err.message : String(err) });

/** Open a dialog after the dropdown has closed, so focus lands inside the dialog. */
const afterMenu = (fn: () => void) => () => setTimeout(fn, 0);

function SwatchStrip({ colors, className }: { colors: string[]; className?: string }) {
  const four = colors.slice(0, 4);
  return (
    <span className={cn('flex h-3.5 w-10 shrink-0 gap-px overflow-hidden rounded-[3px]', className)}>
      {four.length ? (
        four.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)
      ) : (
        <span className="h-full flex-1 bg-surface-3" />
      )}
    </span>
  );
}

export function ProjectMenu() {
  const name = useEditor((s) => s.project.name);
  const projectId = useEditor((s) => s.project.id);
  const [open, setOpen] = useState(false);
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listCanvases().then((list) => { setCanvases(list); setLoaded(true); }).catch(() => { setCanvases([]); setLoaded(true); });

  useEffect(() => {
    if (open || browsing) void refresh();
  }, [open, browsing]);

  const newBlank = () => createCanvas(createBlankProject()).then(() => toast.success('New blank canvas')).catch(failed('Could not create a canvas'));

  const newSample = () => createCanvas(createSampleProject()).then(() => toast.success('Fresh copy of the sample')).catch(failed('Could not create a canvas'));

  const duplicate = () => {
    const { project } = getEditor();
    const now = Date.now();
    const copy = { ...structuredClone(project), id: uid('p_'), name: `${project.name} copy`, createdAt: now, updatedAt: now };
    createCanvas(copy).then(() => toast.success(`Duplicated as “${copy.name}”`)).catch(failed('Could not duplicate'));
  };

  const exportJson = () => {
    const { project } = getEditor();
    downloadText(`${slugify(project.name)}.0colors.json`, serializeProject(project), 'application/json');
  };

  const importJson = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const project = { ...normalizeProject(parsed), id: uid('p_'), updatedAt: Date.now() };
      await createCanvas(project);
      toast.success(`Imported “${project.name}”`);
    } catch (err) {
      const description = err instanceof SyntaxError ? 'The file is not valid JSON.' : err instanceof Error ? err.message : String(err);
      toast.error('Could not import that file', { description });
    }
  };

  const copyShareLink = async () => {
    let url: string;
    try {
      url = shareUrl(location.origin, await encodeShare(getEditor().project));
    } catch (err) {
      failed('Could not create a share link')(err);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setShareFallback(url);
      return;
    }
    if (url.length > 8000) {
      toast.warning('Link copied — but it is very long', {
        description: `${url.length.toLocaleString()} characters. Some chat apps cut long links; export JSON instead if it breaks.`,
      });
    } else {
      toast.success('Link copied — anyone with it gets their own copy');
    }
  };

  const openOne = (id: string) => {
    if (id !== projectId) openCanvas(id).catch(failed('Could not open that canvas'));
  };

  const recent = canvases.slice(0, RECENT);

  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <button
            type="button"
            className="group flex h-7 min-w-0 items-center gap-1 rounded-[7px] px-2 text-[13px] font-medium text-fg outline-none transition-colors hover:bg-surface-3/80 focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=open]:bg-surface-3/80"
            aria-label={`Project menu: ${name}`}
          >
            <span className="max-w-[180px] truncate">{name}</span>
            <ChevronDown size={12} className="shrink-0 text-fg-3 transition-transform duration-150 group-data-[state=open]:rotate-180" />
          </button>
        </MenuTrigger>
        <MenuContent className="w-72">
          <MenuItem icon={<Plus size={14} />} onSelect={newBlank}>New blank canvas</MenuItem>
          <MenuItem icon={<Sparkles size={14} />} onSelect={newSample}>New from sample</MenuItem>
          <MenuItem icon={<CopyPlus size={14} />} onSelect={duplicate}>Duplicate canvas</MenuItem>
          <MenuItem icon={<Pencil size={14} />} onSelect={afterMenu(() => setRenaming(true))}>Rename…</MenuItem>

          <MenuSeparator />
          <MenuLabel>Recent canvases</MenuLabel>
          {recent.map((c) => (
            <MenuItem
              key={c.id}
              icon={c.id === projectId ? <Check size={14} /> : <span className="w-3.5" />}
              shortcut={timeAgo(c.updatedAt)}
              onSelect={() => openOne(c.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <SwatchStrip colors={c.swatches} />
                <span className="truncate">{c.name}</span>
              </span>
            </MenuItem>
          ))}
          {!recent.length && <div className="px-2 pb-1.5 text-[12px] text-fg-3">{loaded ? 'No saved canvases yet' : 'Loading…'}</div>}
          <MenuItem icon={<LayoutGrid size={14} />} onSelect={afterMenu(() => setBrowsing(true))}>
            {canvases.length > RECENT ? `Show all canvases (${canvases.length})…` : 'Show all canvases…'}
          </MenuItem>

          <MenuSeparator />
          <MenuItem icon={<Upload size={14} />} onSelect={() => fileRef.current?.click()}>Import JSON…</MenuItem>
          <MenuItem icon={<Download size={14} />} onSelect={exportJson}>Export JSON</MenuItem>
          <MenuItem icon={<Link2 size={14} />} onSelect={() => void copyShareLink()}>Copy share link</MenuItem>

          <MenuSeparator />
          <MenuItem icon={<Trash2 size={14} />} danger onSelect={afterMenu(() => setDeleting(true))}>Delete this canvas</MenuItem>
        </MenuContent>
      </Menu>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importJson(file);
        }}
      />

      <CanvasBrowser
        open={browsing}
        onOpenChange={setBrowsing}
        canvases={canvases}
        loaded={loaded}
        currentId={projectId}
        onOpen={(id) => { setBrowsing(false); openOne(id); }}
        onDeleted={() => void refresh()}
      />

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename canvas">
        <CommitInput
          autoFocus
          value={name}
          aria-label="Canvas name"
          className="h-8 text-[13px]"
          onCommit={(v) => {
            renameProject(v);
            setRenaming(false);
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter') setRenaming(false);
          }}
        />
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={() => setRenaming(false)}>Done</Button>
        </div>
      </Dialog>

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${name}”?`}
        description="This removes the canvas from this browser. Export it as JSON first if you want to keep a copy."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger"
            onClick={() => {
              setDeleting(false);
              deleteCanvas(projectId).then(() => toast('Canvas deleted')).catch(failed('Could not delete'));
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={shareFallback !== null}
        onOpenChange={(o) => !o && setShareFallback(null)}
        title="Share link"
        description="Copying was blocked by the browser. Select the link and copy it manually — anyone who opens it gets their own copy."
      >
        <textarea
          readOnly
          value={shareFallback ?? ''}
          onFocus={(e) => e.target.select()}
          className="num h-32 w-full resize-none rounded-[8px] border border-transparent bg-surface-2 p-2.5 text-[11px] leading-relaxed text-fg-2 outline-none focus:border-accent"
        />
      </Dialog>
    </>
  );
}

/** Every canvas saved in this browser: search, open, delete. */
function CanvasBrowser({
  open, onOpenChange, canvases, loaded, currentId, onOpen, onDeleted,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; canvases: CanvasMeta[]; loaded: boolean; currentId: string;
  onOpen: (id: string) => void; onDeleted: () => void;
}) {
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => { if (!open) { setQuery(''); setConfirmId(null); } }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? canvases.filter((c) => c.name.toLowerCase().includes(q)) : canvases;
  }, [canvases, query]);

  const remove = (c: CanvasMeta) => {
    setConfirmId(null);
    deleteCanvas(c.id)
      .then(() => { toast(`Deleted “${c.name}”`); onDeleted(); })
      .catch(failed('Could not delete'));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Your canvases"
      description={`${canvases.length} saved in this browser. Nothing leaves your device unless you export or share it.`}
      className="w-[min(92vw,480px)]"
    >
      <div className="relative mb-2">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <TextInput
          autoFocus
          aria-label="Search canvases"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && filtered[0]) onOpen(filtered[0].id);
          }}
          className="h-8 pl-8 text-[13px]"
        />
      </div>
      <ul className="-mx-1.5 max-h-[50vh] overflow-y-auto">
        {filtered.map((c) => {
          const current = c.id === currentId;
          const confirming = confirmId === c.id;
          return (
            <li key={c.id} className="group flex h-10 items-center gap-1 rounded-[8px] px-1.5 transition-colors hover:bg-surface-2">
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:underline"
              >
                <span className="flex w-4 justify-center text-accent">{current && <Check size={14} />}</span>
                <SwatchStrip colors={c.swatches} className="h-4 w-12" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{c.name}</span>
                <span className="shrink-0 text-[11px] text-fg-3">{timeAgo(c.updatedAt)}</span>
              </button>
              {confirming ? (
                <span className="flex shrink-0 items-center gap-1 pl-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]" onClick={() => setConfirmId(null)}>Cancel</Button>
                  <Button size="sm" variant="primary" className="h-6 bg-danger px-2 text-[11.5px]" onClick={() => remove(c)}>Delete</Button>
                </span>
              ) : (
                <IconButton
                  label={`Delete “${c.name}”`}
                  size="icon-sm"
                  className="opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => setConfirmId(c.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </li>
          );
        })}
        {!filtered.length && (
          <li className="px-2 py-6 text-center text-[12px] text-fg-3">
            {!loaded ? 'Loading…' : query ? `No canvases match “${query}”` : 'No saved canvases yet'}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
