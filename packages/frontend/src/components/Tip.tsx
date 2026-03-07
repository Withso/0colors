import * as React from 'react';
import * as TooltipPrimitive from "@radix-ui/react-tooltip@1.1.8";

/**
 * Lightweight tooltip wrapper — Geist dark theme.
 *
 * Usage:
 *   <Tip label="Delete Node" side="bottom">
 *     <button>...</button>
 *   </Tip>
 *
 * `children` MUST accept a ref (native elements do automatically).
 */

interface TipProps {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  delayDuration?: number;
  /** Extra className for the content bubble */
  className?: string;
  /** Set false to suppress the tooltip (e.g. when editing inline) */
  enabled?: boolean;
  /** Force open state — useful for controlled tooltips */
  open?: boolean;
}

export function Tip({
  label,
  children,
  side = 'bottom',
  sideOffset = 6,
  delayDuration = 500,
  className = '',
  enabled = true,
  open,
}: TipProps) {
  if (!enabled) return <>{children}</>;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root open={open}>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            className={`
              z-[200] px-2.5 py-1.5 rounded-lg
              text-[12px] tracking-[-0.01em]
              text-[#ededed] bg-[#1a1a1a]/95 backdrop-blur-md
              border border-[#ffffff]/[0.08]
              shadow-[0_4px_16px_rgba(0,0,0,0.45)]
              animate-in fade-in-0 zoom-in-95
              data-[side=bottom]:slide-in-from-top-1
              data-[side=top]:slide-in-from-bottom-1
              data-[side=left]:slide-in-from-right-1
              data-[side=right]:slide-in-from-left-1
              select-none whitespace-nowrap
              ${className}
            `}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
