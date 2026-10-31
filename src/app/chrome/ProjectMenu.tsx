// ─────────────────────────────────────────────────────────────
// Project menu: canvases in this browser, import/export, share links.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, ChevronDown, CopyPlus, Download, Link2, Pencil, Plus, Sparkles, Trash2, Upload,
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
import { Button, CommitInput, Dialog, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui';

const failed = (what: string) => (err: unknown) =>
  toast.error(what, { description: err instanceof Error ? err.message : String(err) });

/** Open a dialog after the dropdown has closed, so focus lands inside the dialog. */
const afterMenu = (fn: () => void) => () => setTimeout(fn, 0);

function SwatchStrip({ colors }: { colors: string[] }) {
  return (
    <span className="flex h-4 w-12 shrink-0 overflow-hidden rounded ring-1 ring-inset ring-line">
      {colors.length ? (
        colors.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)
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
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) listCanvases().then(setCanvases).catch(() => setCanvases([]));
  }, [open]);

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

  const recent = canvases.slice(0, 8);

  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-fg outline-none transition-colors hover:bg-surface-3 data-[state=open]:bg-surface-3"
            aria-label={`Project menu: ${name}`}
          >
            <span className="max-w-[180px] truncate">{name}</span>
            <ChevronDown size={14} className="shrink-0 text-fg-3" />
          </button>
        </MenuTrigger>
        <MenuContent className="w-72">
          <MenuItem icon={<Plus size={14} />} onSelect={newBlank}>New blank canvas</MenuItem>
          <MenuItem icon={<Sparkles size={14} />} onSelect={newSample}>New from sample</MenuItem>
          <MenuItem icon={<CopyPlus size={14} />} onSelect={duplicate}>Duplicate canvas</MenuItem>
          <MenuItem icon={<Pencil size={14} />} onSelect={afterMenu(() => setRenaming(true))}>Rename…</MenuItem>

          <MenuSeparator />
          <MenuLabel>Your canvases</MenuLabel>
          {recent.map((c) => (
            <MenuItem
              key={c.id}
              icon={c.id === projectId ? <Check size={14} className="text-accent" /> : <span className="w-3.5" />}
              shortcut={timeAgo(c.updatedAt)}
              onSelect={() => {
                if (c.id !== projectId) openCanvas(c.id).catch(failed('Could not open that canvas'));
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <SwatchStrip colors={c.swatches} />
                <span className="truncate">{c.name}</span>
              </span>
            </MenuItem>
          ))}
          {!recent.length && <div className="px-2 pb-1.5 text-xs text-fg-3">Loading…</div>}
          {canvases.length > recent.length && (
            <div className="px-2 pb-1 text-[11px] text-fg-3">+{canvases.length - recent.length} older canvases</div>
          )}

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

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename canvas">
        <CommitInput
          autoFocus
          value={name}
          aria-label="Canvas name"
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
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger text-white"
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
          className="num h-32 w-full resize-none rounded-lg border border-line bg-surface-2 p-2 text-[11px] text-fg-2 outline-none focus:border-accent"
        />
      </Dialog>
    </>
  );
}
