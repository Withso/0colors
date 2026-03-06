import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, Zap, Calculator, Palette, GitBranch, Scale, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Section IDs for navigation ──────────────────────────────────
const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: Zap },
  { id: 'logic', label: 'Logic & Conditions', icon: GitBranch },
  { id: 'compare', label: 'Comparisons', icon: Scale },
  { id: 'math-ops', label: 'Math Operators', icon: ArrowRightLeft },
  { id: 'tier1', label: 'Core Math (12)', icon: Calculator },
  { id: 'tier2', label: 'Thresholds (4)', icon: Calculator },
  { id: 'tier3', label: 'Advanced Math (10)', icon: Calculator },
  { id: 'color', label: 'Color Functions (8)', icon: Palette },
  { id: 'combos', label: 'Power Combos', icon: Zap },
] as const;

// ── Pill colors matching the expression editor ──────────────────
const PILL = {
  keyword: '#E93D82',
  fn: '#45B36B',
  op: '#FF8B3E',
  ref: '#52A8FF',
  lit: '#A1A1A1',
  bool: '#9D5BD2',
  prop: '#E5C07B',
  local: '#FF6347',
};

// ── Styled code inline ──────────────────────────────────────────
function Code({ children, color }: { children: string; color?: string }) {
  return (
    <code
      className="px-1 py-[1px] rounded text-[10.5px] font-mono inline-block"
      style={{
        color: color || '#ccc',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {children}
    </code>
  );
}

// ── Function card ───────────────────────────────────────────────
interface FnCardProps {
  name: string;
  syntax: string;
  desc: string;
  useCases: { label: string; code: string }[];
  color?: string;
}

function FnCard({ name, syntax, desc, useCases, color }: FnCardProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-lg mb-2 overflow-hidden transition-all"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform"
          style={{
            color: '#555',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
        <span
          className="text-[11px] font-mono shrink-0"
          style={{ color: color || PILL.fn }}
        >
          {name}
        </span>
        <span className="text-[10px] text-[#555] truncate">{desc}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              className="px-3 pb-2.5 pt-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              {/* Syntax */}
              <div className="mb-2 mt-2">
                <div
                  className="text-[10px] px-2.5 py-1.5 rounded font-mono"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    color: '#aaa',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {syntax}
                </div>
              </div>

              {/* Use cases */}
              <div className="space-y-1.5">
                {useCases.map((uc, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-[9px] text-[#444] shrink-0 mt-[2px] w-[6px]">&bull;</span>
                    <div className="min-w-0">
                      <span className="text-[10px] text-[#666] block">{uc.label}</span>
                      <code
                        className="text-[9.5px] font-mono block mt-0.5 break-all"
                        style={{ color: '#888' }}
                      >
                        {uc.code}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section header ──────────────────────────────────────────────
function SectionHeader({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="mb-3 pt-1 scroll-mt-4">
      <h3 className="text-[13px] text-[#ccc] mb-0.5">{title}</h3>
      {subtitle && <p className="text-[10px] text-[#555]">{subtitle}</p>}
      <div className="h-px mt-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// AdvancedHelpPopup — main export
// ═════════════════════════════════════════════════════════════════

interface AdvancedHelpPopupProps {
  onClose: () => void;
}

export function AdvancedHelpPopup({ onClose }: AdvancedHelpPopupProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState('overview');

  const scrollTo = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(`help-${id}`);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({
        top: el.offsetTop - contentRef.current.offsetTop - 16,
        behavior: 'smooth',
      });
    }
  }, []);

  // Track scroll position to update active nav
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const onScroll = () => {
      const sections = SECTIONS.map(s => {
        const el = document.getElementById(`help-${s.id}`);
        if (!el) return { id: s.id, top: Infinity };
        return { id: s.id, top: el.offsetTop - container.offsetTop - container.scrollTop };
      });
      const active = sections.filter(s => s.top <= 40).pop();
      if (active) setActiveSection(active.id);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100000 }}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative flex rounded-xl overflow-hidden"
        style={{
          width: 'min(820px, 90vw)',
          height: 'min(620px, 85vh)',
          background: '#111',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* ── Left sidebar navigation ── */}
        <div
          className="flex flex-col shrink-0 py-3"
          style={{
            width: '180px',
            background: 'rgba(0,0,0,0.2)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-3 pb-2 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-[#ccc]">Logic Reference</span>
            </div>
            <span className="text-[9.5px] text-[#444] block mt-0.5">
              34 functions + constructs
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-1.5 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  className="w-full flex items-center gap-2 px-2.5 py-[6px] rounded-md text-left transition-colors cursor-pointer"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    color: isActive ? '#ccc' : '#555',
                  }}
                  onClick={() => scrollTo(s.id)}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget.style.background = 'rgba(255,255,255,0.03)');
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget.style.background = 'transparent');
                  }}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="text-[10.5px] truncate">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Keyboard tip */}
          <div className="px-3 pt-2 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-[9px] text-[#333]">
              Press <kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: 'rgba(255,255,255,0.06)' }}>Esc</kbd> to close
            </span>
          </div>
        </div>

        {/* ── Right content area ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <h2 className="text-[14px] text-[#ddd]">Advanced Color Logic Guide</h2>
              <p className="text-[10px] text-[#444] mt-0.5">
                Expression system reference for the pull-based channel architecture
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors cursor-pointer hover:bg-white/5"
              style={{ color: '#555' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Scrollable content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4">
            {/* ── OVERVIEW ── */}
            <SectionHeader id="help-overview" title="How It Works" subtitle="Per-channel pull-expression system" />
            <div className="mb-5 space-y-2">
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[10.5px] text-[#888] leading-[1.6]">
                  Each channel (Hue, Saturation, Lightness, Alpha, etc.) gets its own expression column.
                  Expressions evaluate top-to-bottom. The <strong style={{ color: '#aaa' }}>last row that produces a valid number</strong> becomes the channel's output.
                  Rows that produce booleans are stored as <Code color={PILL.bool}>$variables</Code> for subsequent rows but don't set the channel value.
                </p>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[10.5px] text-[#888] leading-[1.6]">
                  <strong style={{ color: '#aaa' }}>References:</strong>{' '}
                  <Code color={PILL.ref}>@Self.H</Code> reads current node's hue,{' '}
                  <Code color={PILL.ref}>@Parent.L</Code> reads parent's lightness,{' '}
                  <Code color={PILL.ref}>@NodeName.S</Code> reads any node's saturation.
                  <br />
                  <strong style={{ color: '#aaa' }}>Row variables:</strong>{' '}
                  Each row's output is stored as <Code color={PILL.local}>$out_1</Code>, <Code color={PILL.local}>$out_2</Code>, etc.
                  (renameable). Later rows can reference earlier ones.
                </p>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[10.5px] text-[#888] leading-[1.6]">
                  <strong style={{ color: '#aaa' }}>Bare node refs:</strong>{' '}
                  <Code color={PILL.ref}>@Self</Code> / <Code color={PILL.ref}>@Parent</Code> (without <Code color={PILL.prop}>.property</Code>) pass the <em>whole node</em> into{' '}
                  <Code color={PILL.fn}>contrast()</Code>, <Code color={PILL.fn}>apca()</Code>, or <Code color={PILL.fn}>deltaE()</Code> which auto-resolve RGB internally.
                </p>
              </div>
            </div>

            {/* ── LOGIC ── */}
            <SectionHeader id="help-logic" title="Logic & Conditions" subtitle="Conditional branching for context-aware tokens" />
            <div className="mb-5">
              <FnCard
                name="if / then / else"
                syntax="if <condition> then <value> else <fallback>"
                desc="Conditional output based on a test"
                color={PILL.keyword}
                useCases={[
                  { label: 'Dark text on light backgrounds', code: 'if @Parent.L > 50 then 10 else 90' },
                  { label: 'Desaturate near-grays', code: 'if @Self.S < 5 then 0 else @Self.S' },
                  { label: 'Theme-aware alpha', code: 'if @Parent.L < 20 then 80 else 100' },
                  { label: 'Without else (falls through to base)', code: 'if @Self.H > 60 then 60' },
                ]}
              />
              <FnCard
                name="AND / OR"
                syntax="if <a> AND <b> then ... | if <a> OR <b> then ..."
                desc="Combine multiple boolean conditions"
                color={PILL.keyword}
                useCases={[
                  { label: 'Mid-range lightness check', code: 'if @Self.L > 30 AND @Self.L < 70 then 50' },
                  { label: 'Either dark parent or low saturation', code: 'if @Parent.L < 20 OR @Self.S < 10 then 0' },
                ]}
              />
              <FnCard
                name="locked"
                syntax="locked"
                desc="Keep the channel's current base value unchanged"
                color="#D4915E"
                useCases={[
                  { label: 'Preserve hue while other channels change', code: 'locked' },
                  { label: 'Conditional lock', code: 'if @Self.S < 5 then locked else @Self.H + 30' },
                ]}
              />
            </div>

            {/* ── COMPARISONS ── */}
            <SectionHeader id="help-compare" title="Comparison Operators" subtitle="Evaluate to true/false for use in conditions" />
            <div className="mb-5 grid grid-cols-2 gap-1.5">
              {[
                { op: '>', desc: 'Greater than', ex: '@Parent.L > 50' },
                { op: '<', desc: 'Less than', ex: '@Self.S < 10' },
                { op: '>=', desc: 'Greater or equal', ex: '@Self.H >= 180' },
                { op: '<=', desc: 'Less or equal', ex: '@Parent.A <= 50' },
                { op: '==', desc: 'Equal (0.001 tolerance)', ex: '@Self.R == 255' },
                { op: '!=', desc: 'Not equal', ex: '@Parent.H != 0' },
              ].map((item) => (
                <div
                  key={item.op}
                  className="rounded-md px-2.5 py-2"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Code color={PILL.op}>{item.op}</Code>
                    <span className="text-[10px] text-[#666]">{item.desc}</span>
                  </div>
                  <code className="text-[9px] font-mono text-[#555] block">{item.ex}</code>
                </div>
              ))}
            </div>

            {/* ── MATH OPERATORS ── */}
            <SectionHeader id="help-math-ops" title="Math Operators" subtitle="Arithmetic on channel values and numbers" />
            <div className="mb-5 grid grid-cols-2 gap-1.5">
              {[
                { op: '+', desc: 'Add', ex: '@Parent.H + 30', use: 'Offset hue by 30 degrees' },
                { op: '-', desc: 'Subtract', ex: '@Self.L - 10', use: 'Darken by 10' },
                { op: '*', desc: 'Multiply', ex: '@Parent.S * 0.5', use: 'Halve saturation' },
                { op: '/', desc: 'Divide (safe: /0 = 0)', ex: '@Self.L / 2', use: 'Halve lightness' },
                { op: '%', desc: 'Modulo', ex: '@Self.H % 60', use: 'Position within 60-degree segment' },
              ].map((item) => (
                <div
                  key={item.op}
                  className="rounded-md px-2.5 py-2"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Code color={PILL.op}>{item.op}</Code>
                    <span className="text-[10px] text-[#666]">{item.desc}</span>
                  </div>
                  <code className="text-[9px] font-mono text-[#555] block">{item.ex}</code>
                  <span className="text-[9px] text-[#444] block mt-0.5">{item.use}</span>
                </div>
              ))}
            </div>

            {/* ── TIER 1 MATH ── */}
            <SectionHeader id="help-tier1" title="Core Math Functions" subtitle="12 essential workhorses for color math" />
            <div className="mb-5">
              <FnCard
                name="clamp"
                syntax="clamp(min, value, max)"
                desc="Force value within [min, max] bounds"
                useCases={[
                  { label: 'Keep lightness in readable range', code: 'clamp(20, @Parent.L + 15, 80)' },
                  { label: 'Limit saturation boost', code: 'clamp(0, @Self.S * 1.5, 100)' },
                  { label: 'Bound alpha to visible range', code: 'clamp(10, @Self.A, 90)' },
                ]}
              />
              <FnCard
                name="min"
                syntax="min(a, b, ...)"
                desc="Smallest of all arguments"
                useCases={[
                  { label: 'Cap saturation at 80', code: 'min(@Self.S, 80)' },
                  { label: 'Pick the darker lightness', code: 'min(@Self.L, @Parent.L)' },
                ]}
              />
              <FnCard
                name="max"
                syntax="max(a, b, ...)"
                desc="Largest of all arguments"
                useCases={[
                  { label: 'Ensure minimum lightness of 20', code: 'max(@Self.L, 20)' },
                  { label: 'Pick the more saturated', code: 'max(@Self.S, @Parent.S)' },
                ]}
              />
              <FnCard
                name="round"
                syntax="round(value)"
                desc="Round to nearest integer"
                useCases={[
                  { label: 'Clean computed hue', code: 'round(@Parent.H + 15.7)' },
                  { label: 'Clean lightness after division', code: 'round(@Self.L / 3)' },
                ]}
              />
              <FnCard
                name="abs"
                syntax="abs(value)"
                desc="Absolute value (removes sign)"
                useCases={[
                  { label: 'Hue distance from parent', code: 'abs(@Self.H - @Parent.H)' },
                  { label: 'Lightness difference', code: 'abs(@Self.L - @Parent.L)' },
                ]}
              />
              <FnCard
                name="floor / ceil"
                syntax="floor(value) | ceil(value)"
                desc="Round down / round up to integer"
                useCases={[
                  { label: 'Quantize hue to nearest 10 below', code: 'floor(@Self.H / 10) * 10' },
                  { label: 'Quantize saturation to nearest 10 above', code: 'ceil(@Self.S / 10) * 10' },
                ]}
              />
              <FnCard
                name="lerp"
                syntax="lerp(a, b, t)"
                desc="Linear interpolation: a + (b-a)*t. t=0 gives a, t=1 gives b."
                useCases={[
                  { label: 'Midpoint lightness', code: 'lerp(@Self.L, @Parent.L, 0.5)' },
                  { label: '25% toward parent saturation', code: 'lerp(@Self.S, @Parent.S, 0.25)' },
                  { label: 'Build a lightness scale step', code: 'lerp(10, 90, 0.5)' },
                ]}
              />
              <FnCard
                name="map"
                syntax="map(value, inMin, inMax, outMin, outMax)"
                desc="Remap from one range to another proportionally"
                useCases={[
                  { label: 'Lightness to proportional alpha', code: 'map(@Self.L, 0, 100, 20, 80)' },
                  { label: 'Parent hue drives saturation', code: 'map(@Parent.H, 0, 360, 30, 90)' },
                  { label: 'RGB 0-255 to 0-100', code: 'map(@Self.R, 0, 255, 0, 100)' },
                ]}
              />
              <FnCard
                name="mod"
                syntax="mod(a, b)"
                desc="Always-positive modulo (unlike %, never returns negative)"
                useCases={[
                  { label: 'Wrap hue after offset', code: 'mod(@Parent.H + 120, 360)' },
                  { label: 'Cycle through segments', code: 'mod(@Self.H, 60)' },
                ]}
              />
              <FnCard
                name="pow"
                syntax="pow(base, exponent)"
                desc="Power function: base^exponent"
                useCases={[
                  { label: 'Gamma-correct lightness', code: 'pow(@Self.L / 100, 1.5) * 100' },
                  { label: 'Quadratic easing on saturation', code: 'pow(@Self.S / 100, 2) * 100' },
                ]}
              />
              <FnCard
                name="sqrt"
                syntax="sqrt(value)"
                desc="Square root (negative clamped to 0)"
                useCases={[
                  { label: 'Perceptual lightness scale', code: 'sqrt(@Self.L / 100) * 100' },
                  { label: 'Soften high values', code: 'sqrt(@Self.S)' },
                ]}
              />
            </div>

            {/* ── TIER 2 MATH ── */}
            <SectionHeader id="help-tier2" title="Threshold & Stepping" subtitle="4 functions for hard/soft cutoffs and quantization" />
            <div className="mb-5">
              <FnCard
                name="step"
                syntax="step(edge, x)"
                desc="Binary threshold: 0 if x < edge, 1 if x >= edge"
                useCases={[
                  { label: 'Light mode flag', code: 'step(50, @Parent.L)' },
                  { label: 'Full saturation or none', code: 'step(10, @Self.S) * 100' },
                  { label: 'Binary opacity', code: 'step(1, @Self.A) * 100' },
                ]}
              />
              <FnCard
                name="smoothstep"
                syntax="smoothstep(edge0, edge1, x)"
                desc="Smooth S-curve: 0 below edge0, 1 above edge1, Hermite blend between"
                useCases={[
                  { label: 'Smooth saturation fade-in', code: 'smoothstep(20, 60, @Parent.L) * 100' },
                  { label: 'Gradual lightness response', code: 'smoothstep(0, 100, @Self.L) * 80 + 10' },
                  { label: 'Soft opacity ramp', code: 'smoothstep(30, 70, @Parent.L) * 100' },
                ]}
              />
              <FnCard
                name="sign"
                syntax="sign(value)"
                desc="Returns -1, 0, or 1 (direction without magnitude)"
                useCases={[
                  { label: 'Direction of hue shift', code: 'sign(@Self.H - @Parent.H)' },
                  { label: 'Conditional on direction', code: 'if sign(@Self.L - 50) > 0 then 20 else 80' },
                ]}
              />
              <FnCard
                name="snap"
                syntax="snap(value, grid)"
                desc="Snap to nearest multiple of grid"
                useCases={[
                  { label: 'Lightness to nearest 10', code: 'snap(@Self.L, 10)' },
                  { label: 'Hue to 30-degree increments', code: 'snap(@Self.H, 30)' },
                  { label: 'Saturation to 25-step grid', code: 'snap(@Self.S, 25)' },
                ]}
              />
            </div>

            {/* ── TIER 3 MATH ── */}
            <SectionHeader id="help-tier3" title="Advanced Math" subtitle="10 functions for trig, logarithmic, and niche operations" />
            <div className="mb-5">
              <FnCard
                name="sin / cos"
                syntax="sin(degrees) | cos(degrees)"
                desc="Trig in degrees (not radians) since hue is 0-360"
                useCases={[
                  { label: 'Sinusoidal hue wobble', code: '@Self.H + sin(@Self.H) * 10' },
                  { label: 'Cyclic lightness wave', code: '50 + cos(@Self.H) * 20' },
                  { label: 'X/Y on color wheel', code: 'cos(@Self.H) * @Self.S' },
                  { label: 'Complementary sat curve', code: 'abs(sin(@Self.H * 2)) * 100' },
                ]}
              />
              <FnCard
                name="tan"
                syntax="tan(degrees)"
                desc="Tangent in degrees, capped at +/-1,000,000 near asymptotes"
                useCases={[
                  { label: 'Aggressive contrast curve', code: 'clamp(0, tan(@Self.L * 0.45) * 50, 100)' },
                ]}
              />
              <FnCard
                name="atan2"
                syntax="atan2(y, x)"
                desc="Angle in degrees [0, 360) from Cartesian coordinates"
                useCases={[
                  { label: 'Hue from Lab-like coords', code: 'atan2(bStar, aStar)' },
                  { label: 'Angle between two colors', code: 'atan2(@Self.L - @Parent.L, @Self.S - @Parent.S)' },
                ]}
              />
              <FnCard
                name="log / log2 / log10"
                syntax="log(val) | log2(val) | log10(val)"
                desc="Natural, base-2, base-10 logarithm. Clamped min 0.0001 to avoid NaN."
                useCases={[
                  { label: 'Logarithmic lightness scale', code: 'log(@Self.L + 1) / log(101) * 100' },
                  { label: 'Brightness stops (photography)', code: 'log2(max(1, @Self.L))' },
                  { label: 'Order of magnitude', code: 'floor(log10(max(1, @Self.R)))' },
                ]}
              />
              <FnCard
                name="exp"
                syntax="exp(value)"
                desc="e^value. Capped at exp(88) to avoid Infinity."
                useCases={[
                  { label: 'Exponential saturation curve', code: 'min(100, exp(@Self.S / 30) * 10)' },
                ]}
              />
              <FnCard
                name="fract"
                syntax="fract(value)"
                desc="Fractional part: value - floor(value). Always 0..1."
                useCases={[
                  { label: 'Position within 60-degree segment', code: 'fract(@Self.H / 60)' },
                  { label: 'Repeating sawtooth pattern', code: 'fract(@Self.L / 25) * 25' },
                ]}
              />
              <FnCard
                name="inverseLerp / invLerp"
                syntax="inverseLerp(a, b, value)"
                desc="Inverse of lerp: where value falls between a and b as 0..1"
                useCases={[
                  { label: 'How far into lightness range?', code: 'inverseLerp(20, 80, @Self.L)' },
                  { label: 'Normalize then remap', code: 'lerp(10, 90, inverseLerp(20, 80, @Self.L))' },
                ]}
              />
            </div>

            {/* ── COLOR FUNCTIONS ── */}
            <SectionHeader id="help-color" title="Color Functions" subtitle="8 functions for accessibility, perception, and color science" />
            <div className="mb-5">
              <FnCard
                name="luminance"
                syntax="luminance(r, g, b)"
                desc="WCAG 2.x relative luminance from sRGB 0-255. Returns 0 (black) to 1 (white)."
                color={PILL.ref}
                useCases={[
                  { label: 'Get current luminance', code: 'luminance(@Self.R, @Self.G, @Self.B)' },
                  { label: 'Check if perceptually dark', code: 'if luminance(@Self.R, @Self.G, @Self.B) < 0.18 then ...' },
                ]}
              />
              <FnCard
                name="contrast"
                syntax="contrast(lum1, lum2) | contrast(@Node, @Node)"
                desc="WCAG 2.x contrast ratio. 1 (identical) to 21 (black/white). AA needs >= 4.5."
                color={PILL.ref}
                useCases={[
                  { label: 'Node-ref mode (auto RGB)', code: 'contrast(@Self, @Parent)' },
                  { label: 'Numeric mode with luminances', code: 'contrast($selfLum, $parentLum)' },
                  { label: 'Adaptive AA compliance', code: 'if contrast(@Self, @Parent) < 4.5 then @Self.L - 15 else @Self.L' },
                ]}
              />
              <FnCard
                name="apca"
                syntax="apca(lumText, lumBg) | apca(@Text, @Bg)"
                desc="APCA Lc contrast (WCAG 3.0 draft). Asymmetric. Body >= 75, large >= 60."
                color={PILL.ref}
                useCases={[
                  { label: 'APCA between nodes', code: 'apca(@Self, @Parent)' },
                  { label: 'Body text threshold check', code: 'if abs(apca(@Self, @Parent)) >= 75 then @Self.L else @Self.L + 10' },
                ]}
              />
              <FnCard
                name="huelerp"
                syntax="huelerp(a, b, t)"
                desc="Shortest-path hue interpolation on 360-degree wheel (handles 0/360 wrap)"
                color={PILL.ref}
                useCases={[
                  { label: 'Midpoint hue (correct!)', code: 'huelerp(@Parent.H, @Self.H, 0.5)' },
                  { label: 'Why not lerp?', code: 'lerp(350, 10, 0.5) = 180 (WRONG) vs huelerp = 0 (CORRECT)' },
                  { label: 'Warm-to-cool based on lightness', code: 'huelerp(30, 210, smoothstep(0, 100, @Self.L))' },
                ]}
              />
              <FnCard
                name="srgbToLinear"
                syntax="srgbToLinear(channel)"
                desc="sRGB 0-255 to linear 0-1 (gamma decode). Required for correct color math."
                color={PILL.ref}
                useCases={[
                  { label: 'Get linear red', code: 'srgbToLinear(@Self.R)' },
                  { label: 'Custom weighted luminance', code: 'srgbToLinear(@Self.R)*0.3 + srgbToLinear(@Self.G)*0.6 + srgbToLinear(@Self.B)*0.1' },
                ]}
              />
              <FnCard
                name="linearToSrgb"
                syntax="linearToSrgb(linear)"
                desc="Linear 0-1 back to sRGB 0-255 (gamma encode). Inverse of srgbToLinear."
                color={PILL.ref}
                useCases={[
                  { label: 'Blend in linear space correctly', code: 'linearToSrgb(lerp(srgbToLinear(@Self.R), srgbToLinear(@Parent.R), 0.5))' },
                  { label: 'Halve brightness correctly', code: 'linearToSrgb(srgbToLinear(@Self.G) * 0.5)' },
                ]}
              />
              <FnCard
                name="deltaE"
                syntax="deltaE(@A, @B) | deltaE(L1, a1, b1, L2, a2, b2)"
                desc="CIEDE2000 perceptual color difference. 0=identical, ~1=just-noticeable, >5=clearly different."
                color={PILL.ref}
                useCases={[
                  { label: 'Perceptual distance from parent', code: 'deltaE(@Self, @Parent)' },
                  { label: 'Ensure minimum visual difference', code: 'if deltaE(@Self, @Parent) < 3 then @Self.L + 10 else @Self.L' },
                  { label: 'Guard indistinguishable colors', code: 'if deltaE(@Self, @Parent) < 1 then @Self.S + 20 else @Self.S' },
                  { label: 'Raw Lab mode (6 numbers)', code: 'deltaE(50, 20, -10, 60, 25, -15)' },
                ]}
              />
            </div>

            {/* ── POWER COMBOS ── */}
            <SectionHeader id="help-combos" title="Power Combinations" subtitle="Real-world patterns composing multiple functions" />
            <div className="mb-5 space-y-2">
              {[
                {
                  title: 'Accessibility-Driven Lightness',
                  desc: 'Auto-adjusts lightness until WCAG AA is met',
                  code: 'if contrast(@Self, @Parent) < 4.5 then @Self.L - 15 else @Self.L',
                },
                {
                  title: 'Perceptually Correct Blending',
                  desc: 'Blend in linear space (physically correct, avoids dark banding)',
                  code: 'linearToSrgb(lerp(srgbToLinear(@Self.R), srgbToLinear(@Parent.R), 0.5))',
                },
                {
                  title: 'Smooth Hue Shift with Snapping',
                  desc: 'Hue shifts toward complement based on lightness, snapped to 15-degree grid',
                  code: 'snap(huelerp(@Parent.H, @Parent.H + 180, smoothstep(20, 80, @Self.L)), 15)',
                },
                {
                  title: 'Logarithmic Lightness Ramp',
                  desc: 'Perceptually even lightness steps instead of linear',
                  code: 'map(log(@Self.L + 1), 0, log(101), 10, 90)',
                },
                {
                  title: 'Cyclic Saturation Pattern',
                  desc: 'Saturation oscillates 3x around the color wheel (20-80 range)',
                  code: '50 + sin(@Self.H * 3) * 30',
                },
                {
                  title: 'DeltaE Guard + APCA Compliance',
                  desc: 'Boost lightness if colors are too similar AND APCA contrast too low',
                  code: 'if deltaE(@Self, @Parent) < 2 AND abs(apca(@Self, @Parent)) < 45 then @Self.L + 20 else @Self.L',
                },
                {
                  title: 'Multi-Row Pipeline',
                  desc: 'Compute, decide, then act across multiple rows using $variables',
                  code: 'Row 1 ($lum): luminance(@Self.R, @Self.G, @Self.B)\nRow 2 ($ratio): contrast($lum, luminance(@Parent.R, @Parent.G, @Parent.B))\nRow 3: if $ratio < 4.5 then clamp(0, @Self.L - 15, 100) else @Self.L',
                },
                {
                  title: 'Conditional Saturation via Step',
                  desc: 'Zero saturation below L=30 (too dark to see color), full above',
                  code: 'lerp(0, @Self.S, step(30, @Self.L))',
                },
                {
                  title: 'Quantized Design Token Scale',
                  desc: 'Maps hue to lightness, quantized to steps of 10, bounded 10-90',
                  code: 'snap(clamp(10, lerp(10, 90, inverseLerp(0, 360, @Self.H)), 90), 10)',
                },
              ].map((combo, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <Zap size={10} className="shrink-0 mt-[3px]" style={{ color: PILL.fn }} />
                    <div>
                      <span className="text-[10.5px] text-[#aaa] block">{combo.title}</span>
                      <span className="text-[9.5px] text-[#555] block">{combo.desc}</span>
                    </div>
                  </div>
                  <pre
                    className="text-[9.5px] font-mono px-2.5 py-1.5 rounded whitespace-pre-wrap break-all"
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      color: '#888',
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    {combo.code}
                  </pre>
                </div>
              ))}
            </div>

            {/* Bottom spacer */}
            <div className="h-8" />
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
