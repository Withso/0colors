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

### Color tokens available (grey palette for backgrounds, text, borders, icons):

| Token | Hex | Purpose |
|---|---|---|
| `--grey-900` | #171717 | Darkest background |
| `--grey-800` | #262626 | Card/section background |
| `--grey-700` | #404040 | Borders, elevated hover |
| `--grey-600` | #525252 | Muted elements, icon dim |
| `--grey-500` | #737373 | Muted text, placeholders |
| `--grey-400` | #A3A3A3 | Secondary text, labels |
| `--grey-300` | #D4D4D4 | Body text |
| `--grey-200` | #E5E5E5 | Bright body text |
| `--grey-100` | #F5F5F5 | Primary text |
| `--grey-50`  | #FAFAFA | Headings, buttons |

### Full color palettes (50-900 scale):

red, sky, blue, cyan, lime, pink, teal, green, indigo, orange, purple, yellow, fuchsia

### Rules:

- **NO hardcoded hex values** in TSX files. Use `var(--token-name)` only.
- **NO semantic aliases** (no `--background`, `--foreground`). Use the grey palette directly.
- **Use CSS classes** for all styling. NOT inline styles (except for dynamic values like computed colors).
- **Tailwind for layout ONLY**: `flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `items-*`, `justify-*`
- **All component-specific styling** uses CSS classes in `/src/styles/globals.css`
- **CSS class naming**: use descriptive names with state variants:
  - `.card`, `.card:hover`, `.card.when-selected`
  - `.btn-primary`, `.btn-primary:hover`, `.btn-primary:focus-visible`
  - `.sidebar-item`, `.sidebar-item.when-selected`
  - `.input`, `.input:focus`, `.input.when-disabled`
  - `.loading`, `.skeleton`, `.when-dim`

### Exception:

Dynamic colors computed at runtime (HSL gradients, user-defined colors in the canvas) may use inline styles. Third-party brand SVGs may use their official colors.

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
| CSS Token | `var(--grey-900)` from variables.css |
| CSS Class | `.card`, `.btn-primary`, etc. from globals.css |
