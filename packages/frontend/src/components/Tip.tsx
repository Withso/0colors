import * as React from 'react';
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import './Tip.css';

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
            className={`tip-content ${className}`}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
