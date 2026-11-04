# Formula editor v3: research, UX audit, and interaction specification

Research date: 4 November 2026. Audience: product designers and the formula editor implementers.

**Recommended direction:** make a formula a small sequence of editable tags, with guided arguments and a result beside each statement. Keep one visibly labeled final channel output. A designer should be able to choose **Blend colors**, fill three slots, add a row, and reuse the blend without first learning function syntax or variable declarations.

The strongest precedents are **Numbers for argument filling**, **Shortcuts for reusable output tags**, and **Soulver for results beside each line**. This combination fits the requested experience more closely than a miniature general-purpose code editor. The language can remain available for people who want to type.

This is an audit of the preceding editor and a specification for v3. It is **not a claim that the implementation has passed usability or accessibility testing**. Recommendations beyond the fixed engine/UI contract are identified below.

## 1. Scope and evidence

The fixed architecture remains: one stored expression string; one row per statement; named earlier results; the final statement supplies the output. `{name}` represents an unfilled argument. A final color contributes the channel being edited. The implementation uses CodeMirror 6. This report does not propose a different storage model, a workflow execution engine, or a new formula language.

### Method

- Read the project conventions, formula documentation, current editor/inspector, language/completion service, shared plan, and engine brief.
- Inspected the supplied dark-appearance screenshot and captured the existing editor in an isolated Chrome profile against `localhost:3000`. A sample formula was entered into the demo project in that profile.
- Retrieved the official product and accessibility documentation in the source register on this date. Product comparisons describe documented behavior; the borrow/avoid judgments are design recommendations, not measured usability effects.
- Used Nielsen's heuristics as the audit framework, with separate keyboard/accessibility considerations [S14]. No participant sessions, screen-reader sessions, or comprehensive contrast measurements were conducted.

### Evidence ledger

| ID | Evidence | What it establishes |
|---|---|---|
| E1 | Supplied screenshot, copied to `.context/formula-v3/shots/ux-provided-current-editor.png` | Lightness shows `if parent.h > 100 then 100 else 0`, one `= 100%` result, and `@ nodes · ⇧↵ new line`. The editable expression appears as syntax-colored text. |
| E2 | `.context/formula-v3/ux-baseline-source.md` | Timestamped, hashed source snapshot before the UI replacement. Source locations in the audit table refer to this snapshot, not potentially changed current line numbers. |
| E3 | `shots/ux-baseline-multiline-edit.png` and `shots/ux-baseline-multiline-display.png` under `.context/formula-v3/` | A two-statement expression has one visible result; the actual desktop inspector measured 320 CSS px wide. Its usable formula field is narrower because of padding and scrolling. |
| E4 | `.context/formula-v3/shots/ux-baseline-multiline-explain.png` | “How it’s computed” reveals intermediate values separately after leaving editing. |
| E5 | `.context/formula-v3/ux-browser-multiline.json`, `ux-browser-evidence.json`, and `ux-evidence.md` | Captured DOM, timestamps, panel dimensions, and a record of the live textarea attribute inspection. |

The `.context` artifacts are workspace evidence and are gitignored; the descriptions here remain usable without them. The engine was being edited concurrently, so live completion experiments during that interval were inconclusive and are excluded from baseline behavioral conclusions. Completion findings below use the frozen source. Stable UI layout observations are not tests of numeric accuracy or of the completed v3 implementation.

## 2. Audit of the preceding editor

Severity: **critical** blocks a core task without recovery or creates serious loss; **major** prevents a common task or requires substantial knowledge/workarounds; **minor** causes friction while the task remains achievable. These are expert judgments, not measured incidence. No critical issue was established from the available evidence.

| ID / severity | Heuristic and finding | Evidence | Design implication |
|---|---|---|---|
| A1 · Major | **Recognition rather than recall / error prevention.** Choosing a function does not show fillable arguments. The user must know what to insert and where. | E2, `formula-service.ts:383–385`: function insertion is `name()` with the caret inside. `FormulaEditor.tsx:255–265`: a signature is available, but only while editing and while the suggestion list is closed. E1 shows the underlying code-like editing model. | Insert the complete required-argument skeleton, select its first hole, and show that argument's type, examples, and meaning in the picker. Keep help available alongside suggestions. |
| A2 · Major | **Visibility of system state.** Multiple statements are supported, but their values are hidden during the work of composing them. | E3; E2, `FormulaEditor.tsx:277–301` and `305–323`: editing shows the channel result; step values are behind a disclosure in display mode. | Each semantic row needs its own value. Keep the final channel output visibly distinct from intermediate values. |
| A3 · Major | **Match to designers' mental models.** A valid color-producing expression such as `mix(self, white, 0.5)` is rejected as the final channel formula. | E2, `formula.ts:398` describes `mix` as returning a color; `685–686` requires a numeric final result and asks the user to pick a channel. This is a source-supported finding, not a live v3 failure. | Apply the fixed final-color-to-channel rule and explain it as “Lightness from [color]”. Preserve the color type in intermediate rows. |
| A4 · Major | **Error diagnosis and recovery.** An error removes access to otherwise useful step explanations. | E2, `FormulaEditor.tsx:165`: `canExplain` requires no error. In the baseline evaluator, successful steps are accumulated locally, but `FormulaError` does not carry them. Parsing also occurs before row evaluation. | Locate the first failing row, retain current successful prefix values when available, and identify later results as not evaluated. Label the fallback separately. |
| A5 · Major | **Keyboard consistency.** Shift+Tab can accept a completion instead of moving backward. | E2, `FormulaEditor.tsx:207–213`: the `Tab` handler accepts the active completion without checking `shiftKey`. Code-supported; not verified with a stable live completion session. | Give placeholder navigation, completion acceptance, and backward focus movement separate, explicit precedence. Never consume Shift+Tab as acceptance. |
| A6 · Major | **Accessibility / visibility of focus.** Suggestions have visual selection, but the textarea does not expose a relationship to the list or active option. Errors/results also lack explicit live-status and error associations. | E2, `FormulaEditor.tsx:181–218`, `268–289`, `483–499`; E5 field attributes. The field does have a useful channel-specific accessible name and the popup has listbox/option roles. No actual screen-reader failure is asserted. | Preserve those names and add a tested editor-to-popup relationship, active-option announcements, and linked error/help text. Verify the actual accessibility tree and assistive-technology behavior. |
| A7 · Minor | **Consistency / direct manipulation.** Color references look like chips in display mode, then become syntax-colored text in edit mode. Clicking the formula opens editing at its end rather than acting on the clicked argument. | E1; E2, `FormulaEditor.tsx:72–103`, `231–243`, `363–383`, `415–438`. | Keep token appearance stable and use the clicked span as the replacement target. Preserve normal caret-based editing. |
| A8 · Minor | **Discoverability / flexibility.** Multi-step logic requires learning Shift+Enter and declaration syntax; there is no row action beside the expression. | E1 and E3; E2, `FormulaEditor.tsx:215`, `285–287`; README's named-step example. | Add a visible `+ Add row` action. Teach reuse by creating a reference to the preceding result automatically. Update the keyboard hint when Enter changes meaning. |
| A9 · Minor | **Minimalism / readability.** The panel is appropriately compact, but signatures, tiny secondary labels, tags, and results compete for a narrow width. | E3: 320px outer inspector. E2, `FormulaEditor.tsx:256`, `419–425`, `479–482`, `512–513`: 10.5–12px secondary text, minimum 260px popup, nonshrinking signature detail. This establishes a crowding risk, not a measured contrast failure. | Wrap expressions, constrain popup detail, keep results aligned, and increase the hit area without filling every token with a loud color. Test long references and zoom. |
| A10 · Minor | **Explainability / consistency.** Comments that explain a formula's purpose are absent from its formatted display. | E2, baseline `formulaDisplay` reconstructs parsed statements without comments; `FormulaEditor.tsx:437` also omits comment tokens. Comments remain stored. | Preserve readable comments or an explicit comment disclosure. They are annotations, not result-producing rows. |
| A11 · Minor | **Mental model / explainable values.** A channel result and the displayed swatch's converted color can differ after gamut mapping. | E3 shows `= 71%`, a hero value near `70.35%`, and “Outside sRGB”. This is an observed presentation difference; it does not establish a calculation bug. | Distinguish the requested channel result from the rendered, gamut-mapped color in details. Avoid labeling both numbers simply “output”. |

### Strengths to preserve

The current editor already updates the canvas live, supports plain-text copy/paste, offers node/channel/local completion, shows color-reference swatches, and explains clamping/wrapping. Errors identify a source range and say when the parent/stored value is used. The 700ms typing delay avoids showing every transient syntax error immediately. Those are useful foundations; tag styling must preserve their capabilities.

## 3. Comparable-product research

### Closest precedents

**Apple Numbers: a function is something to fill in.** Its guide describes inserting a function with its required and optional arguments, selecting an argument, and replacing it with a value or cell reference. Smart Cell View shows results, reference values, errors, and warnings [S1]. Borrow argument selection and localized help. For 0colors, insert only required arguments, as the fixed contract specifies; a separate function browser and every optional parameter would overwhelm this inspector.

**Apple Shortcuts: previous outputs are usable objects.** Variables are pill-shaped tokens. Each action's output is available as a Magic Variable without first adding a manual variable declaration; the output can be used in subsequent actions. Tokens show their source action's icon and expose details/type adjustments when tapped [S2]. Borrow output reuse and source identity. A row reference should retain its name, current type, and current value. Do not copy arbitrary type conversion or mutable workflow state into this pure formula language.

**Soulver: show the work and its answer together.** Earlier line answers can be inserted by dragging or double-clicking, and dependent lines recalculate when a previous line changes. Its documentation explicitly limits references to lines above the current line [S3]. Borrow adjacent results and backward-only reuse. Use stable local names, rather than making a visual row number appear to be a permanent identifier. An output click can be a future shortcut for inserting a reference; the initial release should also expose references in the picker.

### Supporting comparisons

| Product / documented behavior | Borrow for 0colors | Avoid or adapt |
|---|---|---|
| **Google Sheets.** Function entry includes a help box with definition, syntax, and an example; suggestions can be accepted or rejected. Range selection has its own explicit mode [S4]. | Keep one argument-specific explanation visible while choosing a value. Suggestions should assist, never change the formula merely because focus leaves. | Do not commandeer ordinary arrows to move around the canvas. Keep canvas-reference picking an explicit future mode if added. |
| **Notion formulas 2.0.** The editor supports multiple lines, tabs, comments, direct error highlighting/type checks, and richer output types [S5]. | Give long expressions room to wrap; make type errors local; distinguish a color result from a number result. | Do not expose a database language's entire function library before the user has filled a single argument. “Multiple lines” alone does not provide per-statement outputs. |
| **Airtable.** Its formula editor documents syntax colors, parenthesis matching, multiline folding, and warnings for malformed parentheses. A formula field applies to each record and references fields, rather than arbitrary spreadsheet cells [S6]. | Differentiate roles and prevent delimiter errors; explain scope explicitly. A 0colors local belongs to this channel's formula. | Do not borrow its table-row mental model: a 0colors row is a computation step, not a record. Syntax color alone does not make an argument discoverable. |
| **Figma prototyping.** Expressions can supply number/string/boolean variable values; conditionals use a boolean `If` expression and separate `Else` actions [S7] [S8]. | Designers already encounter “condition → value if true → value otherwise”. Use that plain-language explanation for condition slots. | Do not suggest that a formula executes actions or changes other variables. Keep this editor's available types and operators explicit. |
| **n8n.** Expressions can use earlier node data, offer immediate value previews, and be built by dragging input data into an expression field. Missing upstream execution has a distinct diagnostic [S9] [S10]. | Show source + current value in reference choices. Explain unavailable dependencies specifically instead of calling every failure “invalid formula”. | Avoid JSON paths, execution buttons, and workflow plumbing for a local color calculation. A blank preview should not be confused with a valid empty value. |
| **Retool, classic app transformers.** A named transformer exposes `.value`, can be tested, and reruns when referenced inputs change. Transformers are read-only computations. The documentation distinguishes testing from saving [S11]. | Reusable named results with visible provenance; a clear guarantee that a row computes a value. | Do not add a Test/Save split to an editor whose canvas already reacts live. This source concerns Retool's classic editor, not its newer AI app builder. |
| **Tokens Studio.** Math can combine numeric token values and references; it resolves values before application. Mixed units and composite-token references have limitations [S12]. | Make numeric ranges, units, and color-space context visible before insertion. Keep editable expression and resolved value distinguishable. | Its `{token.name}` reference syntax conflicts with 0colors' `{name}` hole syntax. Use dashed “argument” tags and filled `@color` tags; do not imply that curly braces look up a token. |
| **Linear filters.** Clicking an operator or value opens the choices appropriate to that part; available operators depend on the filter type [S13]. | A clicked token should have a small, relevant replacement menu. Operator choices should belong to the current operator family. | Do not make expression structure permanently unchangeable. Users still need to select and replace a whole formula or type freely. |

### Synthesis

Three useful patterns recur: make required inputs visible, carry source/type information with references, and keep the value close to the expression. None of the sources proves that “more pills” improves usability. The hypothesis to test is that **explicit slots plus contextual choices reduce the amount of syntax a designer must remember**.

The sources also reveal important mismatches. Unit-bearing design tokens are not the same as 0colors numeric literals; workflow actions are not pure rows; rich text/database results are not color channels; and a statement row is not a visual line. Borrow the interaction, not the other product's vocabulary or execution model.

The comparison deliberately focuses on verified, relevant documentation. Initial Excel/Coda/Observable/Hex URLs were unavailable or blocked in this environment; no feature claims here rely on them. Numi's accessible landing page did not provide enough detailed interaction evidence for this audit. This is a focused comparison, not a feature inventory of every suggested product.

## 4. Design principles

1. **Show what is missing.** An argument tag names the next input and explains its expected form when selected.
2. **Guide without trapping.** Suggestions work for beginners; typing, nesting, paste, selection, and undo remain normal editing operations.
3. **Keep values explainable.** Show what each statement produces, what the final channel receives, and why a fallback or adjustment is in use.
4. **Preserve intent through structural edits.** Adding a row preserves a valid output; renaming updates references; deletion exposes its consequences.
5. **Spend emphasis sparingly.** The active slot, incomplete/error state, and final result deserve emphasis. Most filled tags should be quiet.
6. **Keep scope visible.** An intermediate color is a color; a final output affects this channel. Earlier rows are reusable only inside this formula.
7. **Start small and reveal depth when needed.** One row should feel like one control. Additional rows should not introduce a different application.

## 5. Interaction specification

The following is the target behavior. “Required” denotes the essential v3 flow or a correctness/accessibility safeguard. “Refinement” denotes a useful extension that should not block the basic flow if explicitly deferred.

### 5.1 Structure and visual hierarchy

Use a single editor surface beneath the channel heading, with quiet statement boundaries, per-row values, and `+ Add row` below. Keep the final row labeled **Output · Lightness**, **Output · Hue**, etc. The label remains even when there is one row; it explains the scope of a color-producing function.

At approximately 278–290px of usable width, put the row name and result on a compact header line when needed, and allow its expression to wrap below. A short row can remain on one visual line. Do not require a fixed five-column grid of number, name, expression, result, and actions.

```text
Lightness .l                 ƒ Formula
┌────────────────────────────────────┐
│ row1                   ■ #…        │
│ [mix]([■ parent], [■ white], [0.5]) │
│                                    │
│ Output · Lightness          71%     │
│ [row1 · l] [−] [10]                 │
└────────────────────────────────────┘
+ Add row
```

This sketch specifies hierarchy, not exact pixel fit or literal pill widths. Brackets stand for token surfaces; ordinary parentheses and commas remain quieter separators. The numeric result is illustrative, not a universal value for `parent`.

Use the app's semantic surface, text, border, accent, warning, and danger tokens. Do not make function identity, type, or error state depend on hue alone. Start with roughly 12–13px formula text, a 24px line rhythm, and 4–6px corner radii; verify the result at actual inspector width rather than shrinking until everything fits. Interactive tags need adequate target size or spacing; 24px is the WCAG 2.2 target-size baseline, with defined exceptions [S17].

### 5.2 Tag taxonomy

| Tag / example | Visual treatment | Click or keyboard action / accessible description |
|---|---|---|
| **Function** `mix` | Quiet accent text and a soft surface; no extra icon required on every occurrence. | Open function help/compatible replacements. “mix function, blends two colors, three required arguments.” |
| **Argument placeholder** `{a}` | Dashed border, neutral fill, visible short name. Focus gets a distinct ring. | Select the whole hole and open slot choices. “a, first color, required, not filled.” |
| **Color reference/literal** `parent`, `self`, `@brand`, `white`, `#3366ff` | Small swatch with an edge/checker treatment plus a readable name. Never a swatch alone. | Replace the color; show source and current hex. “parent, input color”; “self, stored color”; “Brand, canvas color.” |
| **Channel / member chain** `parent.l`, `row1.hsl.s` | Reference and channel remain visually related; a smaller channel suffix may share one compound surface. | Whole-chain selection offers alternatives for that channel/source. Focusing the suffix offers available channels/spaces. Name includes the actual space: “parent lightness, OKLCH.” |
| **Row reference / declaration** `row1`, `blend` | Neutral or subtle local-reference accent; consistent with the row header. Add a swatch when its type is color. | A reference opens reusable-result choices. A declaration exposes Rename. “row1, earlier color result,” or “ratio, earlier numeric result, 4.7.” |
| **Number** `0.5`, `180`, `0.1` | Neutral solid tag, tabular digits. Keep any explanatory unit visually outside the editable literal. | Select for replacement; show parameter examples/range. Allow typing arbitrary syntactically valid numbers. |
| **Operator** `+`, `×`, `≥`, `and` | Lighter surface than values; preserve clear separation. | Open its family: arithmetic, comparison, or boolean. Accessible names say “multiplied by”, “greater than or equal to”, etc. |
| **Keyword / boolean** `if`, `then`, `else`, `dark`, `true` | Quiet keyword styling; distinguish a literal value from structural syntax through the label/help. | Contextual help/valid replacement. Do not offer `else` as an arbitrary replacement for a number. |
| **Comment** `// why this step exists` | Muted readable annotation with a subtle shared surface if needed; can wrap across the row width. | Ordinary text editing. It has no computed result and is not a separate statement row. |
| **Punctuation** `(`, `,`, `)`, `.` | Plain, lower-emphasis separators. | Normal text/caret behavior. Decorative punctuation does not need its own tab stop or menu. |

Every meaningful token can look like a tag without every token becoming a separate button. CodeMirror distinguishes decoration from atomic cursor behavior [S21]; that is an implementation capability, not a reason to make every character boundary inaccessible.

### 5.3 Inserting and filling a function

Required sequence for `mix`:

1. The user picks **Blend colors** or types/searches `mix` and accepts it.
2. Insert `mix({a}, {b}, {t})` as one undoable edit. Parentheses, commas, and required holes are already present.
3. Select the entire `{a}` range, including its delimiters. Open the picker with **a · First color** and a short **Choose a color** description.
4. Selecting `parent` replaces that range. Keep the caret after the inserted value. A small **Tab: next argument** hint makes the next action explicit; selecting a value should not unpredictably move the user's pointer target.
5. Tab selects `{b}` and opens **b · Second color**. Selecting `white` fills it.
6. Tab selects `{t}` and opens **t · Blend amount · 0–1**. Offer `0.25`, `0.5`, `0.75`, with **0 = first color · 1 = second color**.
7. After `0.5` is accepted, the final channel result appears. Enter with the picker closed can add a row; Tab with no remaining hole moves out of the editor.

The initial selected slot makes typing or pasting a value replace the hole completely. Do not leave `{parent}`, append `parent` after `{a}`, or require users to delete placeholder punctuation themselves.

Typing a recognized `name(` can use the same skeleton when the call is new and empty. Do not expand during IME composition, inside a comment, or into an already populated call. If `(` is already present when a completion changes the function name, preserve it and the existing arguments. Replacing `mix` with a different function must not silently discard arguments; show the resulting type/arity issue and offer an explicit, undoable template replacement if needed.

For `round`, omit optional `step` initially. For `min`/`max`, start with the two slots specified by the snippet contract; preserve evaluator-accepted arities when users type their own expressions. Typed commas and nested expressions remain available. **Refinement:** expose **Add step** or **Add argument** from function help when applicable; avoid permanently showing unused optional slots. Selecting a nested function in a slot selects its first hole, then hole navigation returns to remaining outer arguments in source order.

**Keyboard choice:** accepting a value does not automatically jump to the next hole; Tab does. This keeps focus behavior consistent for pointer and keyboard users and permits immediate editing of the chosen expression. Automatic advancement can be compared in usability testing, but should not be mixed unpredictably with this rule.

### 5.4 Slot-aware suggestions

The replacement span is as important as the candidate list. Suggestions must replace the clicked hole, number, reference, channel suffix, or operator—not append at the document's final caret position. Recompute the span after edits or close a stale popup.

| Context | Useful choices, in order | Help / guardrail |
|---|---|---|
| `mix.a`, `mix.b`, `contrast.a` | Connected `parent`; `self`; earlier color rows; output-capable canvas colors; `white`, `black`, hex entry. | Swatch, source name, current hex. Hide `parent` when there is no parent. “Self” means stored values, not the current computed output. |
| `mix.t`, `lerp.t`, `huelerp.t` | `0.25`, `0.5`, `0.75`; suitable earlier numeric rows; typed expression. | **Blend amount · 0–1**. Examples are guidance; actual clamping/domain behavior must match the evaluator. |
| Ordinary channel number | Channel-aware examples; `parent.<channel>` if available; `self.<channel>`; earlier numeric rows; suitable functions. | L/alpha: 0, 50, 100; hue: 0, 90, 180, 270; OKLCH C: 0, 0.05, 0.1, 0.2. Read the actual channel definition rather than assuming every space uses those keys or ranges. |
| Domain-specific numeric parameter | Parameter examples before generic channel numbers. | Contrast thresholds: 3, 4.5, 7; angles: 30, 90, 180; rounding steps: 1, 5, 10. Label contrast as a ratio, not a percentage or a universal readability guarantee. |
| Condition | `dark`, `light`; an appropriate channel comparison; a contrast comparison; `true`, `false`. | **When should this be true?** If a generic lightness example is needed across spaces, an explicit supported chain such as `self.oklch.l > 50` avoids assuming `.l` exists in every active space. |
| Existing member chain, e.g. `parent.l` | Same channel from other valid colors/earlier color rows; then other channels from this color. | Keep source and channel visible. Explicit space selection should continue into that space's channel list. |
| Channel suffix | Channels of the selected source/space; supported spaces when selecting from a color. | Show full name and range, not only `l`, `c`, or `h`. Channel groups alone are not final values. |
| Arithmetic operator | `+`, `−`, `×`, `÷` and the supported remainder operator where appropriate. | Replacement preserves operands. Display symbols may map to canonical source syntax. |
| Comparison operator | `>`, `≥`, `<`, `≤`, `=`, `≠` as display labels. | Displayed comparison `=` inserts `==`; declaration `=` keeps its different meaning. Accessible labels must distinguish them. |
| Boolean operator | `and`, `or`; `not` where a unary expression is valid. | Do not suggest an operator that cannot occupy the selected span. |
| Named row's whole expression | Useful starters, compatible references, and functions of any supported result type. | Named rows may hold colors, numbers, or booleans. Unknown static type should not make a valid expression impossible to enter. |
| Final expression | Channel-number suggestions first, plus a discoverable route to color-producing expressions such as `mix`. | Final colors are legal under the fixed contract. Do not label them incompatible merely because the default completion heuristic expects a number. |

Keep about 5–7 options visible, with scrolling for more. Place the expected type/range and one useful example in a stable header/footer, rather than repeating a full signature on every option. Search should match human-readable node names as well as their stored slugs. Exclude items identical to the current text. If filtering finds nothing, show **No matching colors** or **No matching functions** while retaining the typed expression.

Anchor the popup near the selected tag/caret; clamp it to the viewport and flip above when needed. It may extend left over the canvas when the inspector is at the right edge. Do not allow a menu to cover the selected hole, detach during scrolling, or overflow the right edge. Avoid a second independent scrolling help panel inside a tiny picker.

**Units:** `0.5` is not `50`. L/alpha use displayed 0–100 values; blend `t` uses 0–1; OKLCH chroma uses decimals; hue uses degrees. The current language's `%` is remainder, not a percent suffix. Show `%`/`°` as explanatory UI outside the inserted literal, and keep copied source valid. Do not imply universal unit checking for arbitrary intermediate numbers.

### 5.5 Adding and identifying rows

One row corresponds to a statement, including a statement that wraps or continues across source lines. Comment-only lines have no row result. Pasted semicolon-separated statements should also receive separate semantic rows. Avoid using the number of rendered lines as the row identity.

**Required invariant:** for a valid formula in the same environment, adding a row leaves the final result unchanged until the user changes the newly added expression.

```text
Before                         After + Add row
mix(parent, white, 0.5)         row1 = mix(parent, white, 0.5)
                               row1
```

The new final row references the preceding color. Only the final boundary extracts the current channel. Do not substitute `row1.l` automatically: that would change behavior when editing a different channel.

```text
Before                         After + Add row
row1 = parent.l - 10            row1 = parent.l - 10
row1 * 0.8                     row2 = row1 * 0.8
                               row2
```

For a named final statement, append its reference. For insertion after a nonfinal row, insert a new named row that references that row and leave the final statement unchanged, following the engine contract. Name an unnamed source row first when necessary. `+ Add row` at the bottom extends the final result; a per-row **Add below** action can be secondary.

Use `row1`, `row2`, etc., where the next name is **max currently existing rowN + 1**, checking collisions. Never renumber surviving names after deletion. The contract does not guarantee names are never reused after the highest-numbered row is deleted; names are not permanent IDs.

Place the caret after the newly inserted reference and scroll it into view. Its source/result should be visible. Use an undo boundary around the entire add operation, including naming the previous row. Empty/comment-only source has no value to preserve; the current row helper makes Add a no-op. Offer a starter in that state rather than a working-looking Add button that does nothing.

Enter is a structural **Add row after this statement** operation when suggestions are closed. It must not split a token or expression at the caret. For a structurally unfinished statement, guide the user to the missing input rather than appending a misleading successful result. This is distinct from an intentional formatting newline inside a continued expression.

### 5.6 Reusing, renaming, and removing rows

**Reuse.** Earlier results appear in slot choices with name, current type, and value. Show a color swatch for a color row. Numeric contexts can offer an earlier color's relevant member, such as `row1.l`, rather than presenting a bare color as a number. Future rows are absent from these choices. A typed forward reference receives a positioned explanation: **“row3 is defined below. Use an earlier row.”**

**Rename.** The row header/declaration exposes Rename on click and through keyboard access. Start with the current name selected. Enter applies a valid name; Escape cancels only this temporary rename. Rename the declaration and later uses as one undoable operation, leaving comments, `@node` names, and property names untouched. Examples of validation copy:

- **Use letters, numbers, or underscores; start with a letter or underscore.**
- **That name is already used.**
- **“parent” is reserved. Choose another name.**

Do not demand naming on every added row. Naming is useful once a designer wants to describe intent, such as `blend` or `contrast_ratio`.

**Remove.** Row actions appear on focus as well as hover. Removing an unused row should be immediate and undoable. If other rows reference it, identify the consequences before removal, e.g. **“Used by row3 and Output”**, with a contextual **Remove anyway** action. If removed, affected rows show unresolved-reference errors and an Undo action restores the whole operation. Do not silently inline another expression, renumber survivors, or replace missing values with zero.

The low-level `removeRow` contract does not perform dependency repair. It also strips the preceding named row's declaration when that row becomes final. The UI must follow the returned text/selection rather than retaining stale row labels. Removing the last row returns to the empty state. Removing a row also removes its leading comments under the fixed contract; make that consequence visible in the row action or preserve the annotation through an explicit user edit first.

**Refinement:** inserting a reference by clicking a row's result is useful, but requires a clear active insertion target. Do not let a result click unexpectedly replace an unrelated selection. Drag-to-reorder is deferred: forward-only references make reorder a semantic operation, not merely a visual rearrangement.

### 5.7 Per-row values and final output

| Result kind | Row display | Detail / implication |
|---|---|---|
| Color | Swatch + hex, including alpha when relevant. | Accessible name includes color identity/value. Copying a value and inserting a live reference are different actions. |
| Number | Concise numeric value with adequate precision. | Do not attach the edited channel's unit to every intermediate number; a contrast ratio or blend amount is not a lightness percentage. |
| Boolean | `true` / `false` or a consistently explained equivalent. | A boolean can feed a condition in a later row; it is not a valid final channel output on its own. |
| Channel group | Space/group label, e.g. `HSL group`. | Prompt for a channel before numeric use/final output. A group is neither a color nor a number. |
| Final number | Emphasized channel-formatted value, with `%`/`°` when appropriate. | Show clamped/wrapped detail if the evaluator adjusts the raw number. |
| Final color | Emphasized extracted channel value; secondary source swatch/detail. | **Lightness from [swatch]**. Only this channel follows the final color; other channel rules remain independently meaningful. |
| Incomplete or failed row | `—` with a specific state label. | Never present the fallback channel value as this row's successful answer. |

Changing an earlier row recomputes dependent results. Keep stable alignment and tabular digits so updates are easy to compare. Rounding is presentation only; operations and inserted references retain underlying precision. Full precision and raw→adjusted values belong in an accessible detail view or copy-value action, not a persistent second decimal column.

Separate three concepts where they differ: **expression value**, **channel value after wrap/clamp**, and **rendered color after gamut mapping**. The last belongs to color details. A final expression that returns a color should not create the impression that the entire node becomes that color.

### 5.8 Empty, incomplete, and error states

| State | Visible behavior | Copy example |
|---|---|---|
| Switch a channel to Formula | Preserve the current channel value as the starting expression; select it so a starter/typing replaces it. | **Blend colors · Adjust a channel · Use a theme condition** |
| Truly empty formula | One focusable entry area; compact starters; no fake row output. Add row is unavailable until there is a statement to extend. | **Choose a function or type a value** |
| Fresh function with holes | Dashed placeholders; active slot explanation; a neutral incomplete value. Avoid immediately coloring every placeholder as an error. | **Choose a color** / **Enter a number from 0 to 1** |
| Leave an incomplete row | Keep its dashed hole and add one local message; focus/click can reopen its choices. | **Fill in b — a color** |
| Invalid argument type | Mark the offending span; explain what belongs there and offer useful replacements. | **Choose a color for b** |
| Malformed expression | Point to the missing/incorrect syntax; retain the user's text. | **Close this parenthesis** / **Use == to compare values** |
| Missing parent | Exclude `parent` from new choices; explain an existing reference. | **No parent is connected. Use self or choose a color.** |
| Missing row or node | Name the unavailable source and provide a replacement path. | **“blend” is no longer available. Choose another result.** |
| Runtime/domain error | Show the engine's specific diagnosis on that row. | **Division by zero** / **log needs a positive value** |
| Later rows not evaluated | Keep their formulas visible and distinguish waiting from failure. | **Waiting for row 2** |
| Formula fallback | A quiet status outside successful row results explains the actual canvas behavior. | **Using the parent value until this is complete** / **Using the stored value until this is complete** |

Do not announce a fresh hole as an urgent alert. Preserve the current gentle typing delay for transient syntax errors, but show guidance immediately for the selected slot. A persistent error should appear when the user leaves the row or attempts the next structural action. Do not rely on red alone: use text, shape/underline, and the error relationship.

The requirement to keep values above an error has an important limit. Evaluation errors can carry successful `steps`; a whole-program parse failure may not. **Required:** display those current steps when supplied. If they are unavailable, show **Not evaluated** instead of inventing a value or asserting that every earlier row failed. Keeping separately evaluated valid prefix rows during parse errors is an integration requirement to resolve; cached values must be explicitly marked **Previous result**, and become invalid when their source/dependencies/environment change. Do not silently label stale values as live.

Unfilled holes can also exist in an unexecuted conditional branch. Show their dashed state even if evaluation currently succeeds. A present theme yielding a valid result does not prove the other branch is ready.

### 5.9 Keyboard model

Priority is **IME composition → active popup → placeholder navigation → editor command → ordinary text editing**. A composition-confirming Enter is never an Add row command. Arrow-key suggestion navigation must not leak to the canvas.

| Key / context | Behavior |
|---|---|
| Enter, picker open | Accept the active suggestion once. Insert a function skeleton or a value as appropriate; do not also add a row. |
| Up/Down, picker open | Navigate suggestions. Maintain a visible active option and scroll it into view. |
| Escape, picker open | Close it, preserve the source and selection, and keep editor focus. |
| Tab, a later hole exists | Close the picker without accepting its highlighted option; select the next hole in source order and show its choices. A skipped hole remains visibly incomplete. |
| Shift+Tab, an earlier hole exists | Select that hole; never accept a completion. |
| Tab / Shift+Tab, no hole in that direction | Move to the next/previous focusable control outside the editor. Do not cycle indefinitely. |
| Enter, picker closed | Add after the current semantic row with output-preserving behavior. Do not split at the caret or perform the old “finish editing” action. |
| Shift+Enter | Insert a literal newline for advanced text editing. The grammar determines whether it continues a statement or begins another one; it is not a promise of a new independent result row. |
| Ctrl+Space | Explicitly open relevant suggestions. Provide pointer access too, since OS/input-method shortcuts may intercept this key. |
| Escape, picker closed | Leave the editing interaction and restore a visible focus target. Changes are already live; Escape does not undo them. |
| Left/Right, Home/End, selection shortcuts | Preserve expected text movement/selection. Atomic tags must not strand the caret or prevent reaching a boundary/nested argument. |
| Backspace/Delete | Delete the selected text/tag once, with ordinary undo. Do not secretly remove the containing function or dependent rows. |
| Cmd/Ctrl+C, X, V | Copy/cut/paste canonical source text. A pasted function or multi-statement program remains editable. |
| Cmd/Ctrl+Z, redo shortcut | One structural operation undoes/redoes as one action. Editor history and project history must not both react to the same keypress. |

Contextual hints should match the active state: **Enter choose · Esc close** while choosing; **Tab next argument** while filling; **Enter add row** when there is a statement to extend. Put the complete keyboard map in help, not as a persistent footer full of shortcuts. No task should require memorizing an invisible gesture.

### 5.10 Accessibility requirements

**Editable text remains the primary accessible representation.** Keep a clearly named multiline editor, e.g. **Lightness formula**, and a concise description of its scope and keyboard behavior. Do not turn every decorative chip into a separate Tab stop. CodeMirror deliberately leaves Tab unbound by default to avoid a keyboard trap and documents an Escape-then-Tab escape hatch when Tab is bound [S22]. Custom hole navigation and widgets still need testing; preserve an equivalent documented escape route as well as exit at the last hole.

**Expose the current slot and popup.** When an argument is selected, announce its name, expected type, position, and filled/unfilled state—for example, **“b, second color, argument 2 of 3, not filled.”** Give the suggestion list and options stable IDs, expose the controlled list and active option, and preserve focus/selection when the popup closes. If a dedicated single-slot input uses the combobox pattern, expose its expanded state and follow that pattern's semantics [S15]. Do not blindly apply a single-line combobox role to the entire multiline document; validate the actual editor/textbox and listbox integration.

**Associate help, errors, and values.** Link concise help/error descriptions to the editor or active editing control. Apply invalid state when a meaningful validation error is being presented, rather than treating every newly inserted hole as an urgent failure. A reader must be able to find “row2 error” and distinguish an earlier successful result from the final channel value. Swatches always have text equivalents.

**Announce deliberate changes politely.** After accepting a value, adding/renaming/removing a row, or a settled validation change, use a concise status message. Examples: **“Added row2. Output unchanged.”**, **“Renamed row1 to blend.”**, **“Row 2 needs a color.”** Avoid reading every intermediate result after every keystroke. Status messages should be programmatically available without moving focus [S19].

**Preserve a way out.** Tab must leave at the ends of hole navigation; Escape closes a popup without swallowing future focus movement. Row actions and Rename must be keyboard reachable even when their icons are normally revealed on hover. WCAG's no-keyboard-trap requirement is explicit [S16].

**Contrast and targeting.** Small formula/help text should meet 4.5:1 text contrast [S18]. Necessary control/state indicators should meet the applicable 3:1 non-text contrast requirement [S20]. A dashed outline or icon plus wording distinguishes empty/error states even without color. Aim for at least 24×24 CSS px targets or adequate spacing and account for the standard's exceptions [S17]; do not enlarge adjacent invisible hit areas until they overlap. A white/transparent swatch needs an identifiable boundary against the current surface.

**Zoom and focus visibility.** Check 200% browser zoom, keyboard focus, long names, and both appearance themes. A popup, sticky result, or inspector header must not fully cover the focused control [S23]; the design should keep the active token and its immediate context visible. Retain the full reference name in accessible text when shortened visually, and provide a keyboard/pointer route to inspect it in full.

**Verification limit:** the source and DOM review identify risks; they do not establish screen-reader compatibility or WCAG conformance. Test the actual implementation with VoiceOver/Safari on macOS and NVDA with a supported Windows browser. Neither setup was available in this cloud audit.

### 5.11 Motion and updates

Use a short opacity transition for opening suggestions or revealing a row. A roughly 120–160ms transition is a design starting point, not a researched threshold. Respect `prefers-reduced-motion`; keep the interaction immediate without slide/scale effects in that mode. Avoid animated counting, automatic scrolling while a user is inspecting another row, and result badges that continually pulse as the canvas recomputes.

Keep existing rows stationary when selecting suggestions. Add/remove should move focus deliberately and scroll only enough to show the target. Suggestion ordering may follow the query, but should not reshuffle under a stationary pointer because a color's live value changed.

### 5.12 One line through five or more rows

| Size / constraint | Layout behavior |
|---|---|
| One short row | One compact surface, visible final channel label/value, and Add row. Avoid a separate inspector-within-an-inspector. |
| One long statement | Soft-wrap between tokens; keep the result aligned with its semantic row's header. A wrap is not another row or another output. |
| Two to five rows | Repeat the same modest hierarchy. Header names and right-aligned values provide a scan path; expressions use the remaining/full row width. |
| More than five rows | Prefer the existing inspector scroll to another tiny nested scroller. Keep the active row visible and the final row easy to locate. Do not automatically collapse a row being edited. |
| Final row offscreen | **Refinement:** a compact “Go to Output” or a clearly labeled summary may help. It must refer to the same final value, not suggest a second output. Avoid it until the actual scrolling problem is observed. |
| Very long reference/token | Let its label wrap or shorten with a full-name inspection path. Never change the underlying reference, clip its focused state, or copy an ellipsis as source. |
| 200% zoom / narrower available width | Stack header/value/expression when necessary; let the picker fit the viewport. An expanded editing view is a later option, not a substitute for the required narrow-panel flow. |

## 6. Edge cases and integration risks

These are acceptance scenarios, not claims that the in-progress implementation fails them.

| Risk / scenario | Expected handling |
|---|---|
| Identically named holes in nested functions, e.g. two `{a}` slots | Track the selected source span, not the label. Filling one must not replace every occurrence. |
| Incomplete `{`, `{}`, more than 32 characters, or newline inside a hole | Use the engine's positioned placeholder diagnostic; keep text recoverable. Never treat an invalid hole as a node reference. |
| Manual punctuation after a snippet | Do not duplicate `(`, `)`, or commas already inserted. Preserve ordinary edits if the user intentionally changes the structure. |
| Optional/variadic arguments | Missing optional arguments are not errors. Required slots remain obvious. Additional arguments are reachable by typing; a contextual Add argument affordance can follow. |
| Mixed/unknown branch types | A conservative completion type is not proof of invalidity. Preserve free entry and show the actual evaluation outcome. Final boolean/group values need a clear explanation. |
| A hole in an inactive conditional branch | Retain its incomplete appearance and check both themes. Do not claim all paths are complete because one currently evaluates. |
| A final color in Hue, Lightness, Chroma, RGB, or alpha | Extract the channel named by the current environment, with its actual space/range. Alpha uses 0–100. Intermediate color rows stay colors. |
| Suggestion heuristic assumes final numeric output | Ensure the user can still discover `mix` and enter a valid final color. Number-first ranking must not become a false prohibition. |
| Generic `.l` suggestion in HCT/RGB | Use the available channel definitions or an explicit supported space chain. A friendly sample must itself be valid. |
| Enter inside an expression, comment, or nested call | Structural Add uses the enclosing semantic row. Literal newlines follow the language's continuation rules. IME confirmation takes precedence over both. |
| Paste with semicolons, CRLF, continuation lines, or comments | Preserve source and derive rows from statements. One action undoes the paste. Comments do not become blank output rows. |
| Rename to a reserved/colliding name, or names that are substrings of one another | Validate before applying; rewrite whole local tokens only. Do not touch `@row1`, `row10`, a property suffix, or comment text accidentally. |
| Delete a referenced row or a row with leading comments | Expose dependency/comment impact and provide undo. Do not advertise automatic repair the helper does not perform. |
| Two canvas names resolve to the same reference slug | The picker must not imply that identical inserted text chooses different stable identities. Surface ambiguity and a naming remedy consistent with the node model. |
| Missing/deleted node or changed parent | Recompute candidates and error locations. Old swatches/results must not masquerade as current values. |
| Parse failure before evaluation | Do not fabricate successful steps. Resolve prefix-evaluation support or show unavailable/stale status honestly, as specified in §5.8. |
| Theme, color space, or upstream values change while a popup is open | Refresh type/unit/value context without changing the selected source unexpectedly. Dismiss a replacement span that no longer exists. |
| Copy pretty comparison `=` or multiplication `×` | Copy canonical, parseable source. In particular, a displayed equality test must remain `==` in source; declaration `=` is different. |
| Intermediate ratio/amount vs channel percentage | Do not format every numeric row as `%`. Use channel units only at the final boundary or where the quantity is actually known. |
| Gamut mapping changes the hero swatch's values | Explain the requested channel value and the rendered color separately. Do not silently overwrite the formula's intent with rounded display values. |
| CodeMirror undo and project undo both installed | Verify one keypress performs one intended undo and that row names, references, source, and computed result stay synchronized across focus changes. |
| External undo/reload while editing; persist incomplete source | Reconcile from the stored string without destroying caret/selection unnecessarily. Restored holes should render as holes, with no schema migration. |
| Long list of nodes or long formulas | Keep picker filtering responsive and its active option stable. Do not virtualize away a screen reader's active option or lose its ID. |

The highest-risk integration points are **partial results on parse errors**, **keyboard precedence**, **color-to-channel explanation**, **dependency-aware deletion**, and **history/focus consistency**. They matter more than a larger number of chip colors or elaborate animation.

## 7. Open design questions and recommended defaults

These questions do not reopen the fixed architecture and do not require blocking the implementation handoff.

| Question | Default for this iteration | What would change the decision |
|---|---|---|
| Should accepting a value automatically advance? | Keep the caret after the accepted value; Tab advances. | Tests show designers repeatedly stall despite the visible hint, and auto-advance does not increase accidental edits. |
| “Row” or “Step”? | Use **Add row** to match the requested interaction; describe a row as a step in help. | Novices consistently interpret “row” as a record or expect unrelated outputs. |
| How much type information belongs on a filled tag? | Name plus color swatch/channel suffix where useful; type and current value in the picker/detail. | Users cannot tell color rows from numeric rows, or clutter measurably slows scanning. |
| What should clicking a result do? | Inspect/copy its value through an explicit action; reuse through the active slot picker. | A clearly indicated insertion target makes direct result-to-reference insertion predictable. |
| How should parse-error prefix values be retained? | Require a correct current-prefix path if implemented; otherwise visibly mark unavailable/previous results. | Engine/UI integration supplies trustworthy prefix results without reporting stale values as current. This is a correctness decision, not only visual polish. |
| Is an expanded editor needed? | Keep the narrow inspector usable for at least five rows; defer a second surface. | Long formulas remain difficult after wrapping, stable values, and reliable scrolling are in place. |
| How are repeated color-space conversions explained? | Show the current channel/space in the output label or detail and explicit spaces on member chains. | Users mispredict the output when switching spaces even after seeing those labels. |

## 8. Usability test plan

Run formative sessions with about **six practicing product designers**, including four who rarely write formulas and two who use spreadsheets or design-token expressions. Use a small fixed canvas with a parent, two named colors, and light/dark themes. Record attempts and errors locally with consent; no product telemetry is needed.

Allow about 30–40 minutes per session. Use equivalent baseline/v3 tasks with counterbalanced order where comparison is practical. Do not teach `mix(a,b,t)` or declaration syntax before the first task. Ask participants to explain what they expect before pressing Add row or changing a source.

| Task | Observable success criterion |
|---|---|
| 1. Blend the input color halfway toward white in Lightness. | At least 5/6 finish without syntax instruction in roughly 90 seconds; identify both colors and explain `0.5`. Track first-slot discovery separately. |
| 2. Replace only the second color and change the amount to one quarter. | At least 5/6 choose the intended tags without rebuilding the function; no participant unintentionally replaces the whole formula without finding recovery. |
| 3. Add a row, reuse the blend, and lower its lightness by 10. | Every Add operation preserves the prior result before editing. At least 5/6 complete reuse within roughly 90 seconds and identify which row is the final channel output. |
| 4. Build five rows, rename the first meaningful result, then remove a row used below. | References remain consistent after rename. All participants can identify the affected rows and restore the deletion with Undo; no text/value loss. Record overflow and excessive scrolling. |
| 5. Recover from an unfilled color slot and a division-by-zero example. | At least 5/6 locate the cause and distinguish successful earlier rows, unevaluated later rows, and the fallback. They should not believe the fallback is a valid computed answer. |
| 6. Use the keyboard to insert a function, fill holes, move backward, add a row, close suggestions, and leave the editor. | No traps, accidental Shift+Tab acceptance, double Enter action, or lost focus. Normal paste and a single undo work across a multi-row expression. |

Add short comprehension probes: **What does self refer to? Does this blend replace the entire node color? Is 50 the same as 0.5 here? What happens in the other theme?** A visually successful task can still expose an incorrect mental model.

Track completion, assistance, time, wrong-slot replacements, invalid-input attempts, unnecessary backtracking, and final-output understanding. The thresholds above are release hypotheses for a small formative study, not statistically established benchmarks. Investigate serious failures even when the aggregate target is met.

Separately verify assistive technology with experienced VoiceOver and NVDA users or testers; include editing, announcements, popup navigation, error recovery, and exiting the editor. Check 200% zoom, reduced motion, both appearance themes, long node names, and 320px inspector screenshots. A keyboard-only pass does not substitute for a screen-reader pass.

## 9. Handoff and release checks

### Required before calling the core v3 flow complete

- `mix` insertion creates all three required holes and selects the first; clicked suggestions replace the right span.
- A designer can complete the flow with both pointer and keyboard, including moving backward and leaving the editor.
- Each statement is identifiable with its own typed value/status; the final channel output is explicit.
- Add row preserves a valid output for both numeric and color results and can be undone as one action.
- Renaming preserves later references; deleting a dependency has visible, recoverable consequences.
- Errors identify the row/slot, current successful steps remain visible when supplied, and fallback/unavailable values are honest.
- Units, `self`, color-space selection, and final color coercion do not create false expectations.
- Wrapping, long names, popup placement, focus, and output remain usable in the actual narrow inspector.
- Copy/paste, nested functions, comments, external undo, and persisted expression strings remain usable.

### Useful refinements after the core flow

Optional-argument controls, direct result-to-reference insertion, a persistent offscreen-output shortcut, and an expanded editor can be evaluated later. Drag reorder, extra editing modes, and a broad permanent function browser add complexity before the main learning problem is solved.

This research deliverable supplies design criteria and evidence. The orchestrator/implementation owners still need to verify the final built UI and engine together; no completed-v3 test result is implied by this document.

## 10. Source register

All sources below were retrieved successfully on **4 November 2026**. Product documentation is primary evidence of documented behavior, not independent usability research. W3C Understanding documents explain the associated WCAG criteria; the APG supplies interaction guidance. Local extracted source copies are under `.context/formula-v3/ux-source-*` (n8n Markdown is stored as `ux-discovery-n8n*-3.txt`).

| Source | Official document | Used for |
|---|---|---|
| S1 | [Apple Numbers — Calculate values using data in table cells][S1] | Function arguments, argument selection, Smart Cell View. |
| S2 | [Apple Shortcuts — Variable types][S2] | Pill-shaped variables, earlier action outputs, variable details. |
| S3 | [Soulver — Line References][S3] | Adjacent answer references, recalculation, earlier-lines-only constraint. |
| S4 | [Google Sheets — Add formulas & functions][S4] | Function help, examples, suggestions, range-selection mode. |
| S5 | [Notion — Formulas 2.0: what's changed][S5] | Multiline editing, comments, type checks, rich outputs. |
| S6 | [Airtable — Getting started with the formula field][S6] | Editor behaviors, field/record scope. |
| S7 | [Figma — Use expressions in prototypes][S7] | Typed expression contexts and operations. |
| S8 | [Figma — Multiple actions and conditionals][S8] | Boolean If / Else model and error indication. |
| S9 | [n8n — Expressions versus data nodes][S9] | Immediate previews and expression/workflow distinctions. |
| S10 | [n8n — Expressions for data transformation][S10] | Input mapping, direct entry, upstream-data diagnostics. |
| S11 | [Retool — Transform data with JavaScript][S11] | Named read-only transformer values, testing/saving, reactive inputs; classic apps scope. |
| S12 | [Tokens Studio — Using Math in Token Values][S12] | References in math, unit limitations, resolved values. |
| S13 | [Linear — Filters][S13] | Contextual operator/value replacement. |
| S14 | [Nielsen Norman Group — 10 Usability Heuristics][S14] | Audit framework. |
| S15 | [WAI-ARIA APG — Combobox Pattern][S15] | Popup/active-option relationships, focus and keyboard behavior. |
| S16 | [WCAG 2.2 — Understanding No Keyboard Trap][S16] | Keyboard exit requirements. |
| S17 | [WCAG 2.2 — Understanding Target Size (Minimum)][S17] | 24px target/spacing baseline and exceptions. |
| S18 | [WCAG 2.2 — Understanding Contrast (Minimum)][S18] | Small-text contrast. |
| S19 | [WCAG 2.2 — Understanding Status Messages][S19] | Status announcements without moving focus. |
| S20 | [WCAG 2.2 — Understanding Non-text Contrast][S20] | Necessary control and state-indicator contrast. |
| S21 | [CodeMirror — Decoration Example][S21] | Widget decoration and atomic-range distinctions. |
| S22 | [CodeMirror — Tab Handling][S22] | Default Tab behavior and documented keyboard escape routes. |
| S23 | [WCAG 2.2 — Understanding Focus Not Obscured (Minimum)][S23] | Preventing author-created UI from hiding focused controls. |

[S1]: https://support.apple.com/guide/numbers/calculate-values-using-data-in-table-cells-tan727173a8/mac
[S2]: https://support.apple.com/guide/shortcuts/variable-types-apdd2b316022/ios
[S3]: https://documentation.soulver.app/documentation/line-references
[S4]: https://support.google.com/docs/answer/46977?hl=en
[S5]: https://www.notion.com/help/guides/new-formulas-whats-changed
[S6]: https://support.airtable.com/articles/8772429326-getting-started-with-the-airtable-formula-field
[S7]: https://help.figma.com/hc/en-us/articles/15253194385943-Use-expressions-in-prototypes
[S8]: https://help.figma.com/hc/en-us/articles/15253220891799-Multiple-actions-and-conditionals
[S9]: https://docs.n8n.io/build/work-with-data/expressions-versus-data-nodes.md
[S10]: https://docs.n8n.io/build/work-with-data/transform-data/expressions-for-data-transformation.md
[S11]: https://docs.retool.com/queries/guides/transformers
[S12]: https://docs.tokens.studio/manage-tokens/token-values/math
[S13]: https://linear.app/docs/filters
[S14]: https://www.nngroup.com/articles/ten-usability-heuristics/
[S15]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
[S16]: https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html
[S17]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[S18]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
[S19]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
[S20]: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
[S21]: https://codemirror.net/examples/decoration/
[S22]: https://codemirror.net/examples/tab/
[S23]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

## 11. As built (v3) and deliberate differences

What shipped, for designers reviewing the live editor. Section numbers refer to this document.

| Area | As built | Differs from the spec? |
|---|---|---|
| Tags (§5.2) | Colors (swatch + name + channel), earlier rows (live value or swatch), functions with their `(`, dashed blanks, numbers, operators as math glyphs, quiet keywords, comments. Parentheses and commas stay plain punctuation. The same rendering is used while editing and while reading. | No. |
| Inserting a function (§5.3) | Accepting a function, or typing `name(`, inserts one blank per required argument and selects the first, with choices for it. Typing `,` or `)` over the snippet steps to the next blank or drops the remaining blanks, so typing a whole call by hand gives the same text. | **Yes — auto-advance.** Picking a value for a blank moves on to the row's next blank, like a short guided form. Editing a filled tag never jumps. Tab / Shift+Tab still move between blanks, and Escape closes the choices. This is the open question in §7, and it should be compared in the usability sessions (§8 tasks 1 and 6). |
| Slot choices (§5.4) | Clicking a tag selects it and opens choices for that span: colors with swatches (`self` is labelled "Stored color"), numbers on the argument's own scale (`t`: 0.25/0.5/0.75; never a 0–100 channel reading), channel values for plain numbers, other channels for a member chain, operators of the same family, conditions. The header names the argument and explains it. | No. |
| Rows (§5.5, §5.6) | Enter adds a row after the current one (with blanks left in the row, Enter moves to the next blank first); **+ Add row** appends. A new row starts from the previous row's result, so the output doesn't change. Clicking a row's name (or F2 in the row) opens Rename / Delete; it shows which rows use it, and delete can be undone. | Shift+Enter inserts a literal line break, as specified. Dependency warning is shown in the rename popover instead of a separate "Remove anyway" step. |
| Output (§5.1, §5.7) | Each row's value sits on the right (swatch for colors, numbers without channel units); the last row shows the channel's value in bold, with a swatch when it came from a color. An **Output** label marks the last row once there are two or more rows. | **Yes — label only with 2+ rows.** A single-row formula is already "the output", and the label would cost a fifth of the 290px width. |
| Incomplete and errors (§5.8) | Blanks are calm (dashed tag, neutral message "Fill in t — a number from 0 to 1 · using the parent value for now"; the canvas node says "Formula has blanks to fill in"). Rows above an error keep their values; rows below show "…" (waiting). | No. |
| Keyboard (§5.9) | Popup: arrows choose, Enter accepts, Escape closes; Tab accepts only while completing a typed word, and on a blank moves on without filling it. Escape again (or ⌘Enter) leaves the field but keeps focus on it; Enter goes back in. Backspace treats a call, a row break and a row name as units. Undo and redo use the app's one history, and every structural edit (a pick, a row added, renamed or removed) is its own step. | No. |
| Accessibility (§5.10) | The field is a named textbox wired to its listbox (`aria-expanded`, `aria-controls`, `aria-activedescendant`); a polite live region reports the settled output and row changes ("Added a row. Lightness is unchanged."). | Not yet tested with VoiceOver or NVDA. |
| Formulas toggled off | Switching a channel from Formula to another rule keeps the text; switching back restores it. | Addition. |
