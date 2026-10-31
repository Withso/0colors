import { useRef, useState } from 'react';
import { Check, Copy, Keyboard, Link2, Monitor, Moon, PanelRight, Plus, Redo2, Sun, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { encodeShare, shareUrl } from '@/engine/share';
import { getEditor, useEditor } from '../store';
import { useUI } from '../ui-store';
import { addTheme } from '../actions';
import { Button, Dialog, IconButton, Tooltip, cn } from '../ui';
import { ProjectMenu } from './ProjectMenu';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.35" stopColor="#ffd166" />
          <stop offset="0.65" stopColor="#4fd1c5" />
          <stop offset="1" stopColor="#6c8cff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" className="fill-[oklch(0.2_0_0)]" />
      <ellipse cx="32" cy="32" rx="12" ry="16" fill="none" stroke="url(#logo-g)" strokeWidth="6.5" />
    </svg>
  );
}

function ThemeSwitcher() {
  const themes = useEditor((s) => s.project.themes);
  const themeId = useEditor((s) => s.themeId);
  const setTheme = useEditor((s) => s.setTheme);
  return (
    <div className="flex items-center gap-1">
      <div role="radiogroup" aria-label="Active theme" className="flex max-w-[38vw] items-center gap-px overflow-x-auto rounded-[9px] bg-surface-2 p-[2px] [scrollbar-width:none]">
        {themes.map((t, i) => {
          const on = t.id === themeId;
          return (
            <Tooltip key={t.id} content={`${t.name}${i === 0 ? ' — primary theme' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'flex h-[26px] shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent/60',
                  on ? 'bg-raised text-fg shadow-[0_1px_2px_oklch(0_0_0/0.18),0_0_0_0.5px_oklch(0_0_0/0.12)]' : 'text-fg-3 hover:text-fg-2',
                )}
              >
                {t.dark ? <Moon size={12} strokeWidth={2.2} /> : <Sun size={12} strokeWidth={2.2} />}
                <span className="max-sm:max-w-14 max-sm:truncate">{t.name}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
      <IconButton
        label="Add a theme"
        size="icon-sm"
        className="hidden sm:inline-flex"
        onClick={() => {
          const last = themes[themes.length - 1];
          addTheme(`Theme ${themes.length + 1}`, !(last?.dark ?? false));
        }}
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

function ShareDialog({ open, onOpenChange, url }: { open: boolean; onOpenChange: (v: boolean) => void; url: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      input.current?.select();
      toast('Press ⌘C / Ctrl+C to copy the selected link');
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share this canvas"
      description="The whole canvas is compressed into the link — nothing is uploaded anywhere. Anyone who opens it gets their own editable copy."
    >
      <div className="flex items-center gap-2">
        <input
          ref={input}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="num h-8 min-w-0 flex-1 rounded-[8px] bg-surface-2 px-2.5 text-[11.5px] text-fg-2 outline-none focus:ring-2 focus:ring-accent/50"
        />
        <Button variant="primary" onClick={copy} className="w-[92px]">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-fg-3">
        {url.length > 8000
          ? `This link is long (${Math.round(url.length / 1000)}k characters). Some chat apps truncate long links — use Export JSON from the canvas menu if it doesn't open.`
          : `${url.length.toLocaleString()} characters. Edits you make after sharing aren't included — share again to send a new version.`}
      </p>
    </Dialog>
  );
}

export function TopBar() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const { appTheme, setAppTheme, panelOpen, setPanelOpen, setShortcutsOpen } = useUI();
  const [share, setShare] = useState<{ open: boolean; url: string }>({ open: false, url: '' });
  const nextAppTheme = appTheme === 'system' ? 'dark' : appTheme === 'dark' ? 'light' : 'system';
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  const openShare = async () => {
    try {
      const code = await encodeShare(getEditor().project);
      setShare({ open: true, url: shareUrl(location.origin, code) });
    } catch {
      toast.error('Could not create a share link for this canvas.');
    }
  };

  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2">
      <div className="flex min-w-0 shrink items-center gap-1">
        <a href="/" className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] outline-none transition-colors hover:bg-surface-3/80" aria-label="0colors home">
          <Logo className="h-[22px] w-[22px]" />
        </a>
        <ProjectMenu />
      </div>

      <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
        <ThemeSwitcher />
      </div>

      <div className="flex items-center gap-0.5">
        <div className="mr-1 md:hidden"><ThemeSwitcher /></div>
        <IconButton label="Undo" shortcut={`${mod}Z`} side="bottom" size="icon-sm" disabled={!canUndo} onClick={undo}><Undo2 size={15} /></IconButton>
        <IconButton label="Redo" shortcut={mac ? '⇧⌘Z' : 'Ctrl+Y'} side="bottom" size="icon-sm" disabled={!canRedo} onClick={redo}><Redo2 size={15} /></IconButton>
        <span className="mx-1.5 hidden h-4 w-px bg-line-strong sm:block" />
        <IconButton label="Keyboard shortcuts" shortcut="?" side="bottom" size="icon-sm" className="hidden sm:inline-flex" onClick={() => setShortcutsOpen(true)}><Keyboard size={15} /></IconButton>
        <IconButton
          label={`Appearance: ${appTheme === 'system' ? 'match system' : appTheme} — click for ${nextAppTheme === 'system' ? 'system' : nextAppTheme}`}
          side="bottom"
          size="icon-sm"
          className="hidden sm:inline-flex"
          onClick={() => setAppTheme(nextAppTheme)}
        >
          {appTheme === 'system' ? <Monitor size={15} /> : appTheme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
        </IconButton>
        <IconButton label={panelOpen ? 'Hide panel' : 'Show panel'} side="bottom" size="icon-sm" active={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
          <PanelRight size={15} />
        </IconButton>
        <Button variant="primary" size="sm" className="ml-1.5 hidden px-3 sm:inline-flex" onClick={openShare}>
          <Link2 size={13} strokeWidth={2.2} />
          Share
        </Button>
      </div>
      <ShareDialog open={share.open} onOpenChange={(open) => setShare((s) => ({ ...s, open }))} url={share.url} />
    </header>
  );
}
