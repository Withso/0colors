# 0colors Development Rules

These rules govern ALL development across the 0colors application (0canvas main app, demo app, and any future UI surfaces like VS Code extensions).

---

## Rule 1: File Organization

Every file MUST be placed in the correct folder:

- **Pages** go in `/src/pages/`
- **Components** go in `/src/components/{category}/`
  - `canvas/` — Canvas-related (nodes, sliders, grids)
  - `tokens/` — Token management (panels, tables, search)
  - `ai/` — AI features (chat, settings, build preview)
  - `layout/` — Layout (sidebar, shortcuts, nav)
  - `ui/` — Reusable primitives (button, dialog, input, etc.)
- **API calls** go in `/src/api/`
- **Types/Interfaces** go in `/src/types/`
- **Utilities** go in `/src/utils/`
- **Styles** go in `/src/styles/`
- **Mock/sample data** go in `/src/data/`

NEVER put API logic inside components or pages.
NEVER put component code inside page files (import them instead).

---

## Rule 2: Every Page MUST Have This Structure

```tsx
// ============================================
// PAGE: PageName
// ROUTE: /route-path
// PURPOSE: What this page does
// ============================================

// --- IMPORTS ---

// --- TYPES (page-specific) ---

// --- VARIABLES (useState declarations) ---
// Each variable MUST have a comment explaining its purpose

// --- WORKFLOWS (functions) ---
// Each workflow MUST have a comment explaining what it does

// --- EVENT HANDLERS ---
// Each handler MUST have a comment explaining when it fires

// --- RENDER ---
// Clean HTML structure with CSS classes
```

---

## Rule 3: Every Component MUST Have This Structure

```tsx
// ============================================
// COMPONENT: ComponentName
// PURPOSE: What this component does
// USED IN: Which pages use this component
// ============================================

// --- ATTRIBUTES (Props interface) ---
// Every prop MUST have a comment

// --- VARIABLES (internal state) ---

// --- FORMULAS (computed values) ---

// --- WORKFLOWS (component logic) ---

// --- RENDER ---
```

---

## Rule 4: Every API File MUST Have This Structure

```tsx
// ============================================
// API: Category Name
// BASE URL: https://...
// PURPOSE: What APIs are in this file
// ============================================

// --- API 1: Name ---
// Method: GET/POST
// Endpoint: /path
// Parameters: list them
// Returns: describe response
```

---

## Rule 5: CSS and Styling Rules

### The ONLY design tokens file is `/src/styles/variables.css`.

Every UI surface in the entire application MUST use ONLY tokens from this file. No exceptions.

### Semantic token system

The app now uses a semantic token layer. Primitive palettes still exist inside `variables.css`, but application code MUST consume the semantic tokens, not the raw grey/blue/green/etc. tokens.

### Core rule

- **Backgrounds use `surface-*` tokens**
- **Foregrounds use `on-surface-*` tokens**
- **Persistent borders use `border-on-surface-*` tokens**

This is the base philosophy across pages, panels, cards, controls, overlays, dialogs, tables, sidebars, tokens UI, canvas UI, and future extensions.

### Required surface hierarchy

These are the most important tokens in the system and MUST stay consistent:

| Semantic token | Role |
|---|---|
| `--surface-0` | App/page/base canvas background |
| `--surface-1` | Primary panels, shells, trays |
| `--surface-2` | Cards, grouped sections, raised containers |
| `--surface-3` | Hover, active chrome, embedded controls |
| `--surface-4` | Highest non-overlay local emphasis |
| `--surface-overlay` | Scrims, modal overlays, dim backdrops |
| `--border-on-surface-0` | Strongest divider/border on dark or light surfaces |
| `--border-on-surface-1` | Default border |
| `--border-on-surface-2` | Soft border / low-emphasis separators |

### Required foreground hierarchy

| Semantic token | Role |
|---|---|
| `--on-surface-0` | Highest contrast text on a surface |
| `--on-surface-1` | Primary text/icons |
| `--on-surface-2` | Secondary text/icons |
| `--on-surface-3` | Tertiary text/icons |
| `--on-surface-4` | Muted support content |
| `--on-surface-5` | Placeholder / quiet metadata |
| `--on-surface-6` | Disabled / de-emphasized foreground |

### Preferred aliases

When a semantic alias already exists, prefer the alias instead of reaching for the raw level token:

- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled`
- Icons: `--icon-primary`, `--icon-secondary`, `--icon-tertiary`, `--icon-disabled`
- Borders: `--border-on-surface-0`, `--border-on-surface-1`, `--border-on-surface-2`, `--border-subtle`, `--border-faint`
- Accent/interactive: `--accent-primary`, `--accent-primary-hover`, `--accent-primary-strong`
- Status: `--text-success`, `--text-warning`, `--text-critical`, `--status-success`, `--status-warning`, `--status-critical`
- Status surfaces: `--surface-success-subtle`, `--surface-warning-subtle`, `--surface-critical-subtle`

### How to choose tokens

#### Backgrounds

- App shell, page canvas, major empty areas: `--surface-0`
- Sidebars, large fixed chrome, main containers: `--surface-1`
- Cards, sections, popovers, tables, panels: `--surface-2`
- Inputs, hover states, selected rows, pressed chips, embedded inner containers: `--surface-3`
- Extra-local emphasis where a component already sits on `surface-3`: `--surface-4`

#### Foregrounds

- Headings and strongest readable text: `--text-primary` or `--on-surface-0`
- Standard body text and default icons: `--text-primary` / `--icon-primary`
- Secondary metadata and helper labels: `--text-secondary` / `--icon-secondary`
- Quiet metadata, placeholders, low-priority labels: `--text-tertiary` or `--text-disabled`

#### Borders

- Default strokes around inputs, cards, rows, buttons, panels: `--border-on-surface-1`
- Strong dividers and selected container outlines when neutral: `--border-on-surface-0`
- Soft separators and non-critical inner edges: `--border-on-surface-2` or `--border-faint`
- Focus rings and interactive emphasis: `--border-focus` / `--focus-ring`

### Non-negotiable styling rules

- **NO hardcoded hex values** in app TSX/CSS except inside `variables.css`
- **NO primitive palette tokens in components/pages** such as `--grey-*`, `--blue-*`, `--green-*`, etc.
- **NO old naming systems** or app-specific legacy token names once semantic equivalents exist
- **Use CSS classes** for styling. Inline styles are only for runtime-computed values such as gradients, user-defined colors, positions, dimensions, and alpha/color-preview logic
- **Tailwind for layout ONLY**: `flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `items-*`, `justify-*`
- **All reusable UI decisions** should resolve back to semantic tokens so dark/light themes stay visually stable

### Consistency rules for common UI

- A card sitting on a page should usually be `surface-2` with `border-on-surface-1`
- Nested controls inside a card should usually move one level up to `surface-3`
- Hover should usually increase surface emphasis, not jump to random accent colors
- Text and icon contrast should move together. If text becomes secondary, the adjacent icon should usually become secondary too
- Status colors should be reserved for meaning: success, warning, danger, info. Never use them as generic decoration
- Accent colors should indicate interaction, selection, focus, active navigation, or primary CTA intent
- If a UI area looks “too flat” or “too noisy”, fix hierarchy with `surface-*` and `on-surface-*` first before introducing new colors

### Exception

Dynamic colors computed at runtime may use inline styles:

- HSL/RGB/OKLCH/HCT previews
- Canvas node previews
- Generated gradients
- User-created color values
- Third-party brand marks that must preserve official colors

Even in those cases, surrounding chrome, labels, containers, overlays, inputs, and controls must still use semantic tokens.

---

## Rule 6: Variable Documentation

Every `useState` variable MUST have a comment above it:

```tsx
// Tracks the currently active/selected node ID on the canvas
const [activeNodeId, setActiveNodeId] = useState<string>("");

// Controls whether the command palette is visible
const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
```

---

## Rule 7: Workflow Documentation

Every function/workflow MUST have a comment block:

```tsx
// WORKFLOW: saveProjectToCloud
// TRIGGERED BY: Auto-save interval or manual save button
// WHAT IT DOES:
// 1. Serializes current project state
// 2. Encrypts sensitive data
// 3. Sends to Supabase cloud sync API
// 4. Updates sync indicator status
function saveProjectToCloud() {
  // ...
}
```

---

## Rule 8: Clean HTML Structure

JSX must be readable like HTML. Use semantic elements and CSS classes:

```tsx
// GOOD - Readable, semantic, uses CSS classes
<main className="page-shell">
  <aside className="sidebar">...</aside>
  <section className="page-content">
    <header className="page-header">...</header>
    <div className="page-body">...</div>
  </section>
</main>

// BAD - Unclear divs with inline Tailwind
<div className="flex h-screen bg-[#0a0a0a]">
  <div className="w-[220px] border-r border-[#333]">...</div>
  <div className="flex-1">...</div>
</div>
```

---

## Rule 9: Component Props = Attributes

Component props should be named clearly:

```tsx
// GOOD
<ColorNodeCard
  nodeId="color-1"
  colorName="Primary Blue"
  hue={220}
  saturation={85}
  lightness={50}
  onColorChange={handleColorChange}
/>

// BAD
<ColorNodeCard d={data} x={true} cb={fn} />
```

---

## Rule 10: API Layer Separation

- Pages call API functions from `/src/api/`
- Pages NEVER contain `fetch()` calls directly
- API functions handle errors and return clean data

```tsx
// IN PAGE (Good):
const projects = await getProjects();

// IN PAGE (Bad):
const res = await fetch("https://...");
```

---

## Rule 11: Keep It Simple

- No complex abstractions
- No unnecessary state management libraries
- React `useState` + `useEffect` is sufficient
- If a designer can't understand the code structure, simplify it
- Code comments should explain "why", not just "what"
- No speculative abstractions. Three similar lines > a premature helper.

---

## Rule 12: CSS Class Quick Reference

| Category | Classes |
|---|---|
| **Page layout** | `.page-shell`, `.page-content`, `.page-header`, `.page-body`, `.page-center` |
| **Sidebar** | `.sidebar`, `.sidebar-item`, `.sidebar-item.when-selected` |
| **Cards** | `.card`, `.card-header`, `.card-title`, `.card-description`, `.card-body`, `.card-footer` |
| **Buttons** | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-lg`, `.btn-icon` |
| **Inputs** | `.input`, `.input-label`, `.textarea` |
| **Text** | `.text-heading`, `.text-subheading`, `.text-body`, `.text-caption`, `.text-muted`, `.text-label`, `.text-link`, `.text-error`, `.text-success` |
| **Badges** | `.badge`, `.badge-success`, `.badge-error`, `.badge-warning`, `.badge-info` |
| **Panels** | `.panel`, `.panel-header`, `.panel-body`, `.section-divider` |
| **Dropdowns** | `.dropdown`, `.dropdown-item`, `.dropdown-divider`, `.dropdown-label` |
| **Tabs** | `.tab-list`, `.tab-trigger`, `.tab-trigger.when-selected`, `.tab-content` |
| **States** | `.loading`, `.skeleton`, `.spinner`, `.when-disabled`, `.when-selected`, `.hover`, `.focus` |
| **Tooltip** | `.tooltip` |
| **Scrollbar** | `.scrollbar-thin` |
| **Icons** | `.icon`, `.icon-sm`, `.icon-lg`, `.icon-muted` |

---

## Quick Reference: Visual Tool -> Code Mapping

| Visual Tool Concept | React Code Equivalent |
|---|---|
| Page | File in `/pages/` |
| Component | File in `/components/` |
| Variable | `useState()` |
| Formula | `useMemo()` or `const computed = ...` |
| Workflow | Regular function |
| Event Handler | `onClick`, `onChange`, `onSubmit` |
| Attribute | Component `props` |
| Auto-fetch | `useEffect(() => {}, [])` |
| Conditional Show | `{condition && <Element />}` |
| Loop/Repeat | `{array.map(item => <Element />)}` |
| API Call | Function in `/api/` |
| Navigate | `useNavigate()` from react-router |
| Toast | `toast()` from sonner |
| CSS Token | `var(--surface-2)`, `var(--text-primary)`, `var(--border-on-surface-1)` from variables.css |
| CSS Class | `.card`, `.btn-primary`, etc. from globals.css |
