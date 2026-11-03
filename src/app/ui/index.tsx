// ─────────────────────────────────────────────────────────────
// UI kit. Quiet, compact controls in the spirit of Figma and macOS:
// borderless fields that reveal a hairline on hover, raised segmented thumbs,
// round slider knobs, translucent menus. Chrome uses semantic tokens only;
// user colors are always inline styles.
// ─────────────────────────────────────────────────────────────
import {
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef, useEffect, useRef, useState,
} from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Dialog as RDialog, DropdownMenu as RMenu, Tooltip as RTooltip } from 'radix-ui';
import { Check, Copy, X } from 'lucide-react';
import { getEditor } from '../store';

/** An explicit commit (Enter, blur) is its own undo step: the next edit starts a new one. */
const endStep = () => getEditor().breakCoalesce();

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ── Button ───────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-[1.08] active:brightness-95 shadow-[0_1px_2px_oklch(0_0_0/0.2)]',
  secondary: 'bg-surface-2 text-fg hairline-inset hover:bg-surface-3',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-3/80',
  danger: 'text-danger hover:bg-danger/10',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[7px]',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-[8px]',
  icon: 'h-8 w-8 rounded-[8px]',
  'icon-sm': 'h-7 w-7 rounded-[7px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', active, className, type = 'button', ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-medium outline-none transition-[background-color,color,transform,filter] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-35',
        VARIANTS[variant], SIZES[size],
        active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        className,
      )}
      {...props}
    />
  );
});

// ── Tooltip ──────────────────────────────────────────────────
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={400} skipDelayDuration={150}>{children}</RTooltip.Provider>;
}

export function Tooltip({ content, children, side = 'top', shortcut }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="animate-pop z-50 flex max-w-72 items-center gap-2 rounded-[7px] bg-tooltip px-2 py-1 text-[11.5px] font-medium leading-snug text-white shadow-panel"
        >
          <span>{content}</span>
          {shortcut && <kbd className="num rounded-[4px] bg-white/12 px-1 text-[10.5px] text-white/75">{shortcut}</kbd>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }>(
  function IconButton({ label, shortcut, side, size = 'icon', variant = 'ghost', ...props }, ref) {
    return (
      <Tooltip content={label} shortcut={shortcut} side={side}>
        <Button ref={ref} aria-label={label} size={size} variant={variant} {...props} />
      </Tooltip>
    );
  },
);

// ── Inputs ───────────────────────────────────────────────────
const FIELD =
  'rounded-[7px] border border-transparent bg-surface-2 text-fg outline-none transition-[border-color,background-color] duration-150 hover:border-line-strong focus-within:border-accent focus-within:bg-surface';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      className={cn('h-7 w-full min-w-0 px-2 text-[12.5px]', FIELD, 'focus:border-accent focus:bg-surface', className)}
      {...props}
    />
  );
});

/** Text input that commits on blur / Enter, and reverts on Escape. */
export function CommitInput({ value, onCommit, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextInput
      {...props}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current) { cancelled.current = false; setDraft(value); return; }
        if (draft !== value) { onCommit(draft); endStep(); }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
        e.stopPropagation();
      }}
    />
  );
}

/** Numeric field. Drag the label horizontally to scrub; type to set; ↑/↓ to nudge (⇧ ×10). */
export function NumberField({
  value, onChange, min = -Infinity, max = Infinity, step = 1, decimals = 0, label, suffix, disabled, className, onScrubEnd,
}: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; decimals?: number;
  label?: ReactNode; suffix?: string; disabled?: boolean; className?: string; onScrubEnd?: () => void;
}) {
  const format = (v: number) => {
    const f = v.toFixed(decimals);
    return decimals > 0 ? f.replace(/\.?0+$/, '') || '0' : f;
  };
  const [draft, setDraft] = useState(format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(format(value)); }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  const clampV = (v: number) => Math.min(max, Math.max(min, v));
  const commit = () => {
    if (draft === format(value)) return; // unchanged — don't round the stored value
    const v = parseFloat(draft);
    if (Number.isFinite(v)) { onChange(clampV(v)); endStep(); }
    else setDraft(format(value));
  };
  const scrub = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(clampV(Math.round((start + dx * step * mult) / step) * step));
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      onScrubEnd?.();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <div className={cn('flex h-7 min-w-0 items-center', FIELD, disabled && 'pointer-events-none opacity-45', className)}>
      {label !== undefined && (
        <span onPointerDown={scrub} className="flex h-full cursor-ew-resize select-none items-center pl-2 pr-0.5 text-[11px] font-medium text-fg-3">
          {label}
        </span>
      )}
      <input
        className="num h-full w-full min-w-0 bg-transparent px-1.5 text-[12px] text-fg outline-none"
        value={draft}
        disabled={disabled}
        inputMode="decimal"
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={() => { setFocused(false); commit(); }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = clampV(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            onChange(v);
            setDraft(format(v));
          }
        }}
      />
      {suffix && <span className="pr-2 text-[11px] text-fg-3">{suffix}</span>}
    </div>
  );
}

// ── Gradient slider ──────────────────────────────────────────
/** Horizontal slider whose track shows what the color looks like along the range. */
export function GradientSlider({
  value, min, max, step, onChange, onCommit, gradient, disabled, label,
}: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; onCommit?: () => void;
  gradient: string; disabled?: boolean; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const fromPointer = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    // Keep the knob fully inside the track: map pointer across [r, w - r].
    const r = 8;
    const t = Math.min(1, Math.max(0, (clientX - rect.left - r) / Math.max(1, rect.width - 2 * r)));
    const raw = min + t * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={cn('group relative h-4 w-full touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface', disabled ? 'opacity-50' : '')}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        // Keep keyboard control with the slider after a click (arrows adjust it, not the canvas).
        (e.currentTarget as HTMLElement).focus({ preventScroll: true });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        onChange(fromPointer(e.clientX));
      }}
      onPointerMove={(e) => {
        // Only a press that began on this slider moves it (not a drag passing over the panel).
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onChange(fromPointer(e.clientX));
      }}
      onPointerUp={() => { setDragging(false); onCommit?.(); }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        if (disabled) return;
        const k = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onChange(Math.min(max, value + step * k)); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onChange(Math.max(min, value - step * k)); }
      }}
    >
      <div className="checker absolute inset-x-0 top-[2px] h-3 overflow-hidden rounded-full">
        <div className="absolute inset-0" style={{ background: gradient }} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[2px] h-3 rounded-full shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.25)]" />
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white shadow-[0_0_0_0.5px_oklch(0_0_0/0.35),0_1px_4px_oklch(0_0_0/0.35)] transition-transform duration-150',
          dragging ? 'scale-115' : 'group-hover:scale-110',
        )}
        style={{ left: `calc(8px + (100% - 16px) * ${clamped / 100})` }}
      />
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────
export function Segmented<T extends string>({
  value, options, onChange, size = 'md', className,
}: {
  value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('flex gap-px rounded-[8px] bg-surface-2 p-[2px]', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex flex-1 items-center justify-center whitespace-nowrap rounded-[6px] px-2 font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent/60',
              size === 'sm' ? 'h-[22px] text-[11px]' : 'h-6 text-[12px]',
              on
                ? 'bg-raised text-fg shadow-[0_1px_2px_oklch(0_0_0/0.18),0_0_0_0.5px_oklch(0_0_0/0.12)]'
                : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string>({
  value, options, onChange, className, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn('h-7 w-full min-w-0 appearance-none truncate pl-2 pr-7 text-[12.5px]', FIELD, 'focus:border-accent')}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg viewBox="0 0 10 10" aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-fg-3">
        <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[18px] w-[30px] shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/60',
        checked ? 'bg-accent' : 'bg-surface-3 shadow-[inset_0_0_0_0.5px_var(--app-line-strong)]',
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_3px_oklch(0_0_0/0.3)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked ? 'translate-x-[14px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

// ── Layout helpers ───────────────────────────────────────────
export function Section({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line px-4 py-3.5 last:border-b-0', className)}>
      {(title || actions) && (
        <header className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
          {title && <h3 className="text-[12px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function FieldRow({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid grid-cols-[84px_1fr] items-center gap-x-2 gap-y-1 py-[3px]">
      <span className="truncate text-[12px] text-fg-2">{label}</span>
      <span className="min-w-0">{children}</span>
      {hint && <span className="col-span-2 text-[11px] leading-snug text-fg-3">{hint}</span>}
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-surface-2 px-1 text-[10.5px] font-medium text-fg-2 shadow-[inset_0_-1px_0_var(--app-line-strong),inset_0_0_0_0.5px_var(--app-line)]">
      {children}
    </kbd>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-fg-2',
    success: 'bg-success/14 text-success',
    warning: 'bg-warning/14 text-warning',
    danger: 'bg-danger/14 text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={cn('inline-flex h-[18px] items-center gap-1 rounded-[5px] px-1.5 text-[10.5px] font-semibold', tones[tone], className)}>{children}</span>;
}

/** A color chip with a checkerboard behind translucent colors. */
export function Swatch({ color, className, title }: { color: string | null | undefined; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('checker relative inline-block shrink-0 overflow-hidden rounded-[5px]', className ?? 'h-5 w-5')}>
      <span className="absolute inset-0" style={{ background: color ?? 'transparent' }} />
      {!color && <span className="absolute inset-0 bg-surface-2 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,var(--app-line-strong)_4px_5px)]" />}
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.22)]" />
    </span>
  );
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? 'Copied' : label}
      size="icon-sm"
      className={cn('h-6 w-6', className)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ }
      }}
    >
      {done ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </IconButton>
  );
}

// ── Menu ─────────────────────────────────────────────────────
export const Menu = RMenu.Root;
export const MenuTrigger = RMenu.Trigger;

export const MENU_SURFACE = 'glass animate-pop z-50 min-w-56 rounded-[12px] p-[5px] shadow-panel';

export function MenuContent({ children, align = 'start', className, keepFocus }: {
  children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string;
  /** Don't return focus to the trigger on close (when the chosen item focuses something else). */
  keepFocus?: boolean;
}) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn(MENU_SURFACE, className)}
        onCloseAutoFocus={keepFocus ? (e) => e.preventDefault() : undefined}
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  );
}

export const MENU_ITEM =
  'group flex h-7 w-full cursor-default select-none items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] outline-none transition-colors duration-75';

/** Icons inherit the item's color so they turn white on highlight — don't color them yourself. */
export function MenuItem({ children, onSelect, icon, shortcut, danger, disabled }: { children: ReactNode; onSelect?: () => void; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <RMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        MENU_ITEM,
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-35 data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon && <span className="flex w-4 justify-center text-fg-2 group-data-[highlighted]:text-accent-fg">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="num text-[11px] text-fg-3 group-data-[highlighted]:text-accent-fg/80">{shortcut}</span>}
    </RMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2 pb-1 pt-2 text-[11px] font-medium text-fg-3">{children}</RMenu.Label>;
}

export const MenuSeparator = () => <RMenu.Separator className="mx-2 my-[5px] h-px bg-line" />;

// ── Dialog ───────────────────────────────────────────────────
export function Dialog({ open, onOpenChange, title, description, children, className }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]" />
        <RDialog.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
          className={cn('animate-dialog fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[16px] bg-surface p-5 shadow-panel outline-none', className)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</RDialog.Description>}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close"><X size={14} /></Button>
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
