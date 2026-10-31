// ─────────────────────────────────────────────────────────────
// Small UI kit. Chrome uses semantic tokens (bg-surface, text-fg, border-line…);
// user colors are always inline styles.
// ─────────────────────────────────────────────────────────────
import {
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef, useEffect, useRef, useState,
} from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Dialog as RDialog, DropdownMenu as RMenu, Tooltip as RTooltip } from 'radix-ui';
import { Check, Copy, X } from 'lucide-react';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ── Button ───────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-3',
  danger: 'text-danger hover:bg-danger/10',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-lg',
  icon: 'h-8 w-8 rounded-lg',
  'icon-sm': 'h-6 w-6 rounded-md',
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
        'inline-flex shrink-0 select-none items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant], SIZES[size], active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent', className,
      )}
      {...props}
    />
  );
});

// ── Tooltip ──────────────────────────────────────────────────
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={350} skipDelayDuration={200}>{children}</RTooltip.Provider>;
}

export function Tooltip({ content, children, side = 'top', shortcut }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 flex max-w-72 items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs leading-snug text-canvas shadow-panel"
        >
          <span>{content}</span>
          {shortcut && <kbd className="num rounded bg-canvas/15 px-1 text-[10px]">{shortcut}</kbd>}
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
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent',
        className,
      )}
      {...props}
    />
  );
});

/** Text input that commits on blur / Enter, and reverts on Escape. */
export function CommitInput({ value, onCommit, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextInput
      {...props}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); }
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
    const v = parseFloat(draft);
    if (Number.isFinite(v)) onChange(clampV(v));
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
    <div className={cn('flex h-8 min-w-0 items-center rounded-lg border border-line bg-surface-2 transition-colors focus-within:border-accent hover:border-line-strong', disabled && 'opacity-50', className)}>
      {label !== undefined && (
        <span onPointerDown={scrub} className="flex h-full cursor-ew-resize select-none items-center pl-2 pr-1 text-[11px] font-medium text-fg-3">
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
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const fromPointer = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + t * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };
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
      className={cn('relative h-5 w-full touch-none select-none rounded-md outline-offset-2', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onChange(fromPointer(e.clientX));
      }}
      onPointerMove={(e) => {
        if (disabled || !(e.buttons & 1)) return;
        onChange(fromPointer(e.clientX));
      }}
      onPointerUp={() => onCommit?.()}
      onKeyDown={(e) => {
        if (disabled) return;
        const k = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onChange(Math.min(max, value + step * k)); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onChange(Math.max(min, value - step * k)); }
      }}
    >
      <div className="checker absolute inset-0 rounded-md" />
      <div className="absolute inset-0 rounded-md ring-1 ring-inset ring-line" style={{ background: gradient }} />
      <div
        className="pointer-events-none absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[4px] border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.35)]"
        style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
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
    <div role="radiogroup" className={cn('flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-md px-2 font-medium transition-colors',
            size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs',
            o.value === value ? 'bg-surface-3 text-fg shadow-sm' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value, options, onChange, className, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn('h-8 w-full min-w-0 cursor-pointer rounded-lg border border-line bg-surface-2 px-2 text-[13px] text-fg outline-none hover:border-line-strong focus:border-accent', className)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
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
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-inset ring-line-strong')}
    >
      <span className={cn('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

// ── Layout helpers ───────────────────────────────────────────
export function Section({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line px-4 py-3.5 last:border-b-0', className)}>
      {(title || actions) && (
        <header className="mb-2.5 flex min-h-5 items-center justify-between gap-2">
          {title && <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">{title}</h3>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function FieldRow({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 py-1">
      <span className="text-xs text-fg-2">{label}</span>
      <span className="min-w-0">{children}</span>
      {hint && <span className="col-span-2 text-[11px] leading-snug text-fg-3">{hint}</span>}
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 text-[10px] text-fg-2">{children}</kbd>;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-fg-2',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={cn('inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

/** A color chip with a checkerboard behind translucent colors. */
export function Swatch({ color, className, title }: { color: string | null | undefined; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('checker relative inline-block shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-line', className ?? 'h-5 w-5')}>
      <span className="absolute inset-0" style={{ background: color ?? 'transparent' }} />
      {!color && <span className="absolute inset-0 bg-surface-2 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,var(--app-line-strong)_4px_5px)]" />}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? 'Copied' : label}
      size="icon-sm"
      className={className}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ }
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </IconButton>
  );
}

// ── Menu ─────────────────────────────────────────────────────
export const Menu = RMenu.Root;
export const MenuTrigger = RMenu.Trigger;

export function MenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <RMenu.Portal>
      <RMenu.Content align={align} sideOffset={6} className={cn('z-50 min-w-52 rounded-xl border border-line bg-surface p-1 shadow-panel', className)}>
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  );
}

export function MenuItem({ children, onSelect, icon, shortcut, danger, disabled }: { children: ReactNode; onSelect?: () => void; icon?: ReactNode; shortcut?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <RMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-3',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon && <span className="flex w-4 justify-center text-fg-2">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="num text-[11px] text-fg-3">{shortcut}</span>}
    </RMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-3">{children}</RMenu.Label>;
}

export const MenuSeparator = () => <RMenu.Separator className="my-1 h-px bg-line" />;

// ── Dialog ───────────────────────────────────────────────────
export function Dialog({ open, onOpenChange, title, description, children, className }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <RDialog.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-panel outline-none', className)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="text-[15px] font-semibold text-fg">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-1 text-[13px] text-fg-2">{description}</RDialog.Description>}
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
