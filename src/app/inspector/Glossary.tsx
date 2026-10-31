// Short, plain-language definitions of the color terms used around the app.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../ui';

export const GLOSSARY: { term: string; text: string }[] = [
  { term: 'Hue', text: 'Where a color sits on the color wheel — red, yellow, green, blue… Measured as an angle from 0° to 360°.' },
  { term: 'Chroma vs saturation', text: 'Chroma is absolute colorfulness. Saturation (HSL) is relative to the most vivid color at that lightness, so a “100%” dark blue and a “100%” yellow are not equally colorful.' },
  { term: 'Lightness vs tone', text: 'Both describe how light a color looks. HSL lightness is geometric; OKLCH L and HCT tone are perceptual, so equal steps look equal.' },
  { term: 'OKLCH', text: 'A perceptual space (Björn Ottosson, 2020) used in modern CSS: oklch(L C H). Great for palettes and predictable edits.' },
  { term: 'HCT', text: 'Hue, Chroma, Tone — Material Design 3’s space. Tone is CIE L*, which makes contrast between tones predictable.' },
  { term: 'HSL', text: 'Hue, Saturation, Lightness — a simple reshaping of RGB. Easy to read, but not perceptually even across hues.' },
  { term: 'sRGB gamut', text: 'The range of colors a standard screen can show. Very vivid OKLCH/HCT colors can fall outside it and get mapped to the closest displayable color.' },
  { term: 'Relative luminance', text: 'How much light a color emits, weighted for human vision (green counts most, blue least). WCAG uses it to compute contrast.' },
  { term: 'WCAG contrast', text: 'Ratio of the lighter to darker luminance, from 1:1 to 21:1. 4.5:1 is the AA minimum for body text, 3:1 for large text.' },
  { term: 'APCA', text: 'Advanced Perceptual Contrast Algorithm, the WCAG 3 candidate. Gives an Lc score that accounts for polarity and is stricter on mid-tones.' },
  { term: 'Primitive token', text: 'A raw, named color like brand-500 or neutral-50 — the building blocks.' },
  { term: 'Semantic token', text: 'A role like bg/surface or text/primary that points at a primitive. Themes swap what it points to.' },
  { term: 'Alias', text: 'A token that points at another token, e.g. button/bg → action/primary. Change the target and every alias follows.' },
];

export function Glossary() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="-mx-1.5">
      {GLOSSARY.map((g) => {
        const isOpen = open === g.term;
        return (
          <li key={g.term}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.term)}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-fg hover:bg-surface-3"
            >
              <ChevronRight size={12} className={cn('shrink-0 text-fg-3 transition-transform', isOpen && 'rotate-90')} />
              {g.term}
            </button>
            {isOpen && <p className="px-6 pb-1.5 text-[11.5px] leading-relaxed text-fg-3">{g.text}</p>}
          </li>
        );
      })}
    </ul>
  );
}
