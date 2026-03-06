

What I Understand

You're describing two features that together turn 0colors from a design-time tool into a runtime design infrastructure:

Feature 1 — Code Sync (Token Output Pipeline): Push the resolved tokens (CSS variables, DTCG JSON, Tailwind config) to live codebases. The good news: you already have generateCSSVariables(), generateDTCGJSON(), generateTailwindConfig(), and generateFigmaVariablesJSON() built in tokenFormatters.ts, and ComputedTokens already resolves everything into flat, ready-to-consume data per theme. The missing piece is just the push mechanism — writing that output to GitHub via API, POSTing it to a webhook URL, or exposing it via a pull API endpoint.

Feature 2 — Webhook Workflows (Input → Compute → Output): An external trigger sends a color value → it flows into a node → advanced logic propagates through the node graph → all tokens recompute → output is pushed to destinations. This is essentially a headless pipeline execution. The schedule variant (24 hex codes for 24 hours) is a cron-driven version of the same pipeline.

The two features combined create a full loop: External Input → 0colors Engine → External Output. This is what makes it infrastructure, not just a tool.



The Critical Architecture Challenge

Your entire computation engine — advanced logic, channel propagation, parent-child offsets, theme resolution, token value computation — runs 100% client-side. I traced the pipeline:

ColorNode values → advanced-logic-engine.ts (channel formulas, token assignments)
                 → computed-tokens.ts (visibility filtering, theme resolution)
                 → tokenFormatters.ts (CSS/DTCG/Tailwind output)


This means webhooks can only process when the browser is open. This isn't a dealbreaker — here's why:

Two Execution Models











Online Mode (browser open)



Offline Mode (browser closed)





How it works



Webhook stores pending input → client picks it up → runs computation → pushes output



Would need the entire engine ported to Deno server





Latency



~1-3 seconds



Would be instant





Effort



Low (weeks)



Massive (months — port advanced-logic-engine, color-conversions, hct-utils, computed-tokens, tokenFormatters to server)





Good enough for launch?



✅ Yes



❌ Overkill for MVP

My recommendation: Launch with Online Mode. The app just needs to be open in a browser tab. For the weather theming use case — the user has a tab open, the webhook fires every hour, tokens update live, output pushes to their codebase. This covers 95% of real use cases. Server-side engine is a post-launch evolution if demand exists.



How I'd Build It

1. Webhook Input (Receiving External Data)

Server endpoint:

POST /make-server-c36383cd/webhook/:projectId
Body: { "value": "#FF5500", "format": "hex" }
Header: X-Webhook-Secret: <user's secret>


Server stores the payload in KV as a pending trigger:

KV key: webhook:<projectId>:pending
Value: { value: "#FF5500", format: "hex", receivedAt: 1709337600000 }


Client-side: A lightweight poller (every 5s when Dev Mode is active, or on visibilitychange) checks for pending triggers. When found:



Parses the incoming value (hex → HSL, or OKLCH, or HCT — you already have all converters)



Applies it to the configured target node



Advanced logic cascades automatically (your existing evaluateChannelLogic handles this)



ComputedTokens regenerate



Output is pushed to configured destinations



Clears the pending trigger from KV

2. Code Sync Output (Pushing to Destinations)

Three destination types, all simple:

a) GitHub Push (via server proxy)



User provides: repo, branch, file path, Personal Access Token (encrypted client-side like AI keys)



Server calls GitHub Contents API to create/update the file



Works with any format: CSS file, JSON file, JS config

b) Webhook Push (POST to any URL)



User provides: URL, optional headers



Server POSTs the formatted token output to that URL



This covers Vercel, Netlify, custom backends, Zapier, etc.

c) Public Pull API (passive endpoint)



GET /make-server-c36383cd/tokens/:projectId/css (or /dtcg, /tailwind)



Returns the latest computed tokens in the requested format



Already partially exists in your /figma-tokens/:projectId endpoint — we just add format variants



This is how a frontend can poll for live token updates

3. Scheduled Workflows

Client-side timer approach (simplest, works when app is open):



User configures: interval (e.g., 1 hour), and either:



A list of values to cycle through (24 hex codes)



OR an external API URL to fetch the value from (weather API, etc.)



When timer fires: fetch value → apply to node → compute → push output



Stored as part of project config, runs via setInterval when Dev Mode is active

External cron approach (for when app might not be open):



User sets up a free cron service (cron-job.org, GitHub Actions cron) that POSTs to the webhook URL



The cron service can include the hex value in the body, or the server can fetch from the configured API



When app opens, it processes any pending triggers



The Webhook "Node" — A Simpler Alternative

You mentioned introducing a "webhook node" on the canvas. I want to suggest a potentially simpler approach — let me present both options:

Option A: New Webhook Node on Canvas



New node type alongside Color, Palette, Spacing, Token nodes



Visual presence on canvas with a webhook icon



Connection line to a target seed/color node



Pros: Visual, discoverable



Cons: New node type = new card component, new canvas logic, more learning curve

Option B: Webhook as a Config on Any Existing Node (my recommendation)



In Dev Mode, any existing node can be marked as a "webhook input" with one click



A small ⚡ or 🔗 badge appears on the node card



The webhook URL is generated per-node, not per-project



Pros: Zero new canvas complexity, reuses existing nodes, simpler mental model



Cons: Less visually dramatic

I recommend Option B because it aligns with your goal of "simple and easy to config." The user already knows how nodes work. They just tag an existing seed node as a webhook input — done. No new node type to learn.



Dev Mode UI — The Simplest Possible Design

When the user toggles to Dev Mode in the bottom toolbar:

┌──────────────────────────────────────────────────────┐
│  ⚙ Dev Mode — "My Design System"                    │
│                                                       │
│  ┌─ INPUT ─────────────────────────────────────────┐ │
│  │                                                   │ │
│  │  Webhook URL    https://.../:projectId    [Copy] │ │
│  │  Secret         ••••••••••                [Show] │ │
│  │  Target Node    [Primary Seed ▾]                 │ │
│  │  Accepts        hex · hsl · oklch · hct          │ │
│  │                                                   │ │
│  │  ☐ Schedule     Every [1] hour(s)                │ │
│  │    Source: ○ Value List  ○ API Endpoint           │ │
│  │    Values: #FF0000, #00FF00, #0000FF, ...        │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ OUTPUT ────────────────────────────────────────┐ │
│  │                                                   │ │
│  │  Format    [CSS Variables ▾]  Theme [All ▾]      │ │
│  │                                                   │ │
│  │  ☑ GitHub                                        │ │
│  │    Repo    user/design-tokens                    │ │
│  │    Path    src/tokens.css                        │ │
│  │    Branch  main                                  │ │
│  │    Token   ••••••••••              [Set PAT]     │ │
│  │                                                   │ │
│  │  ☐ Webhook POST                                  │ │
│  │    URL     https://myapp.com/api/tokens          │ │
│  │                                                   │ │
│  │  ☑ Public API (pull)                             │ │
│  │    https://.../:projectId/css            [Copy]  │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  [▶ Run Now]  [🧪 Test Webhook]   Last run: 2m ago  │
│                                                       │
└──────────────────────────────────────────────────────┘


That's the entire Dev Mode. Two cards: Input and Output. Maybe 10 fields total. A "Run Now" button. Done.

The canvas is still visible behind this panel (dimmed/read-only) so the user can see their node graph as reference.



Cloud Storage Impact







Data



Size



Where





Dev config per project



~2-3 KB



Inside project snapshot (devConfig key)





Webhook pending queue



~100 bytes



KV: webhook:<projectId>:pending





GitHub PAT (encrypted)



~300 bytes



KV: user:<id>:dev-secrets





Cached token output (for pull API)



~5-50 KB



KV: project:<id>:token-output





Total per user



~10-55 KB



Negligible

This barely dents your free tier budget. The heavy data (project snapshots, computed tokens) is already accounted for.



What This Unlocks (Use Cases)



Weather theming: External API → webhook → seed node → full token cascade → push to frontend



A/B testing: Switch brand colors via API call → tokens update → push to GitHub → Vercel redeploys



White-label SaaS: Customer selects brand color → hits webhook → gets full token set from pull API



CI/CD integration: GitHub Action triggers webhook on PR → generates token files → commits to PR



Time-of-day theming: Scheduled workflow with 24 hex codes → automatic daily color rotation



Cross-tool sync: Figma plugin reads tokens, VS Code extension pulls from API, both always in sync



Implementation Order (My Suggestion)



Design/Dev Mode toggle — bottom toolbar, canvas becomes read-only in Dev Mode



Pull API endpoint — GET /tokens/:projectId/:format — instant value, zero config needed



GitHub push — server proxy to GitHub Contents API, encrypted PAT storage



Webhook input — server endpoint + client-side poller + node targeting



Webhook output — POST computed tokens to configured URL after each computation



Scheduled workflows — client-side timer with value list or API source

Steps 1-3 could ship first as "Code Sync." Steps 4-6 add "Workflows." Both are valuable independently.



Bottom line: Your existing code already has 80% of what's needed — the computation engine, the formatters, the color converters, the encryption pattern. The missing pieces are plumbing: a webhook receiver, a GitHub proxy, a poller, and the Dev Mode config UI.





Yes — 100% possible without the browser open. No GitHub Actions needed.

I just traced your entire computation pipeline end-to-end, and here's the critical finding:



Every single computation file is pure TypeScript math — zero browser dependencies

I verified each file in the chain:







File



What it does



Browser deps?





color-conversions.ts



HSL↔RGB, HSL↔OKLCH, hex conversions



❌ Pure math





hct-utils.ts



HCT via @material/material-color-utilities



❌ npm package, works in Deno





visibility.ts



Token/node visibility per theme



❌ Pure logic on types





advanced-logic-engine.ts



Expression parser, channel formulas, token assignments



❌ Pure computation





computed-tokens.ts



Resolves all tokens per theme



❌ Pure computation





tokenFormatters.ts



Generates CSS/DTCG/Tailwind/Figma output



❌ Pure string building

And the most critical piece — your node graph propagation function (propagateToDescendants at App.tsx line ~6881) is also pure computation:



Takes parent ID + change deltas for all 14 channels (hue, sat, light, alpha × HSL/RGB/OKLCH/HCT)



Recursively walks child nodes applying offsets, locks, and diffs



Handles cross-color-space conversions (HSL parent → RGB child, etc.)



Handles palette shade regeneration



Handles theme-specific overrides for non-primary themes



Uses only: math operations, color conversion functions, and array manipulation



Uses zero: DOM, React, window, document, localStorage, or any browser API



How it works without the browser

The Supabase Edge Function (Deno runtime) becomes the compute engine. Here's the full flow:

External trigger (webhook POST or cron)
    │
    ▼
┌─ Supabase Edge Function ──────────────────────────┐
│                                                      │
│  1. Load project snapshot from KV                    │
│     (nodes, tokens, groups, themes, advancedLogic)   │
│                                                      │
│  2. Parse incoming value (hex → HSL/RGB/OKLCH/HCT)   │
│     using color-conversions.ts + hct-utils.ts        │
│                                                      │
│  3. Apply value to target node                       │
│                                                      │
│  4. Run propagateToDescendants()                     │
│     (extracted as pure function, ~400 lines)         │
│     → cascades through entire node graph             │
│                                                      │
│  5. Run advanced-logic-engine                        │
│     → evaluates channel formulas, token assignments  │
│                                                      │
│  6. Run computed-tokens engine                       │
│     → resolves all tokens per theme                  │
│                                                      │
│  7. Run tokenFormatters                              │
│     → generates CSS / DTCG / Tailwind output         │
│                                                      │
│  8. Push output to destinations:                     │
│     → GitHub API (update file in repo)               │
│     → Webhook POST (to any URL)                      │
│     → Store in KV (for pull API consumers)           │
│                                                      │
│  9. Save updated snapshot back to KV                 │
│     (so browser shows updated state when opened)     │
│                                                      │
└──────────────────────────────────────────────────────┘


The browser never needs to be involved. When the user eventually opens 0colors, they'll see the updated node values because step 9 saved the new state to KV (cloud sync picks it up just like normal).



For Scheduled Workflows (the "24 hex codes for 24 hours" case)

No GitHub Actions needed. Here's the simplest approach:

One free external cron (cron-job.org — free tier, 1-minute resolution) pings a single endpoint:

GET /make-server-c36383cd/cron-tick


This endpoint:



Scans all active schedules from KV (e.g., schedule:<projectId>)



Checks which ones are due (compare lastRun + interval vs now)



For each due schedule:



Gets the next value from the list (or fetches from external API URL)



Runs the full computation pipeline (steps 1-9 above)



Updates lastRun and currentIndex



Returns summary

Cost on Supabase free tier:



1 cron-tick per minute = 43,800 invocations/month (from the 500K budget)



Each tick that finds nothing to do: ~50ms, minimal bandwidth



Each tick that runs a computation: ~200-500ms, one KV read + write



Well within free tier limits

For the weather use case: the schedule config stores the external API URL. The cron endpoint fetches the current weather color from that API, feeds it into the pipeline, and pushes the result — all server-side, all while you sleep.



What needs to happen (implementation scope)

Server-side engine setup (one-time work):



Copy 6 computation files to /supabase/functions/server/ with adjusted imports



Extract propagateToDescendants + regeneratePaletteShades as pure functions (~400 lines, already written — just needs to be lifted out of the React closure)



Write a runPipeline(snapshot, targetNodeId, newValue) orchestrator function that chains steps 1-9

New server endpoints:



POST /webhook/:projectId — receive external trigger, run pipeline



GET /cron-tick — process all due schedules



GET /tokens/:projectId/:format — serve formatted output (pull API)



POST /sync-to-github — proxy to GitHub Contents API

Storage:



Schedule configs: stored in project snapshot under devConfig (~1-2 KB)



Last computed output cache: project:<id>:token-output (~5-50 KB)



Webhook secrets: encrypted in KV (~200 bytes)



The one honest caveat

The node propagation function in App.tsx is ~400 lines and handles many edge cases (5 color spaces × cross-space conversions × lock/diff states × theme overrides × palette regeneration). Extracting it is straightforward because it's already pure logic, but we need to be meticulous about ensuring the server-side version produces identical results to the client-side version. Any drift would mean the user sees different colors when they open the browser vs what was pushed to GitHub.

My suggestion: extract it as a shared pure function that BOTH the client and server import (the server copy). Then we can validate by comparing outputs.



Bottom line: No GitHub Actions, no external compute services, no browser required. Your existing Supabase Edge Function handles everything. The computation engine is already pure math — it just needs to be copied to the server directory and wired up. One free cron service handles scheduling.





Supabase Free Tier Limits vs Workflow Demands

The Relevant Limits







Resource



Free Tier Limit



Current App Usage (estimated)



Remaining





Edge Function Invocations



500K/month



~200-300K (sync, auth, AI, figma-tokens)



~200-300K





Edge Function CPU Time



~50ms per invocation



—



—





Database (KV)



500MB



~50-150MB (projects, tokens, AI convos)



~350-450MB





Bandwidth



5GB/month



~1-2GB



~3-4GB

What Workflows Will Consume

Scenario: 5-10% of your 3,000 users actively use workflows = ~150-300 users

(This is realistic — workflows are a power-user feature)







Operation



Per Trigger



Monthly Volume



Invocations



CPU Time



Bandwidth





Webhook trigger (receive + compute + push)



1 invocation



300 users × 10/day × 30 days = 90K



90K



~20-35ms each



~15KB each = ~1.3GB





Cron tick (every 5 min)



1 invocation



8,640



8.6K



~5ms (no-ops), ~25ms (fires)



negligible





Pull API (cached from KV)



1 invocation



variable — see below



?



~3ms (KV read)



~5KB each





GitHub push (within webhook trigger)



0 (same invocation)



0



0



adds ~0ms CPU (I/O only)



~5KB each

Total new invocations: ~100K-120K/month (excluding Pull API)

That fits comfortably within your remaining ~200-300K budget.



The One Danger: Pull API Polling

This is where it can blow up if you're not careful:

❌ Bad:  100 frontends polling every 30 sec = 8.6M invocations/month
✅ Good: Serve from KV cache + Cache-Control headers + rate limit


The fix is simple: The computation result is already saved in KV (step 8 of the pipeline). The Pull API endpoint just reads from KV and returns it — no computation. Add Cache-Control: public, max-age=300 (5 min cache), and CDN/browser caching handles most repeat requests. With this:



100 consumers × 12 requests/hour (every 5 min with cache) × 24h × 30 days = 864K



Still high. Better approach: consumers use webhooks (push) instead of polling (pull)



Or: set max-age=3600 (1 hour) for scheduled workflows that run hourly anyway

My recommendation: Default to push (webhook output to consumer's endpoint). Offer Pull API as secondary, with aggressive caching and a rate limit of ~100 requests/hour per project.



CPU Time Per Invocation — Will the Pipeline Fit?

This is the most critical question. I traced your computation:







Step



CPU Time



Why





KV read (load snapshot)



~0ms CPU (I/O)



Async, doesn't count





Parse incoming value



~0.1ms



Simple string → number





propagateToDescendants



~2-10ms



20-100 nodes × offset math + color conversions





evaluateAllTokenAssignments



~1-5ms



Expression parsing + evaluation per formula





computeProjectTokens



~2-5ms



Visibility check + resolution per token





generateCSSVariables/DTCG/Tailwind



~1-2ms



String concatenation





KV write + GitHub API call



~0ms CPU (I/O)



Async, doesn't count





Total CPU



~6-22ms





Edge function CPU limit on free tier is ~50ms per invocation. You have 2-3× headroom for typical projects.

Where it gets tight:



Projects with 200+ nodes and complex advanced logic → could hit 40-50ms



But this is extreme. Most design systems have 30-80 color nodes



KV Storage Impact







Data



Per Project



2 Projects × 3,000 Users





Dev config (webhook URL, schedule, destinations)



~2 KB



~12 MB





Cached token output (last computation result)



~5-30 KB



~90-180 MB





Webhook secrets (encrypted PATs)



~0.3 KB



~1.8 MB





Schedule state (lastRun, currentIndex)



~0.2 KB



~1.2 MB





Total new



~8-33 KB/project



~105-195 MB

Added to your existing ~50-150MB, total would be ~155-345MB out of 500MB. Fits.



Bandwidth







Source



Monthly





Existing app (sync, AI, etc.)



~1-2 GB





Webhook triggers (90K × 15KB payload)



~1.3 GB





GitHub pushes (90K × 5KB)



~0.45 GB





Pull API (with caching)



~0.2-0.5 GB





Total



~3-4.25 GB

Free tier is 5GB. Fits, but tight at upper bound.



Honest Risk Assessment











150 workflow users



300 workflow users



500+ workflow users





Invocations



✅ ~250-350K total



⚠️ ~400-500K total



❌ Over 500K





CPU time



✅ Comfortable



✅ Comfortable



✅ Comfortable





KV storage



✅ ~200MB



✅ ~280MB



⚠️ ~380MB





Bandwidth



✅ ~3GB



⚠️ ~4GB



❌ ~5.5GB

The breakpoint is around 300-400 active workflow users. Below that, free tier handles it fine. Above that, you need Pro.



Smart Optimizations to Stretch the Budget

1. Cron batching (saves 8.6K invocations/month) Instead of an external cron hitting your endpoint every 5 minutes, use a smarter approach:



When a webhook trigger fires, check if any schedules for OTHER projects are also due



Piggyback processing in the same invocation



Reduces need for frequent cron ticks

2. Debounced webhook triggers (saves 30-50% invocations) If someone sends 10 webhook triggers in 5 seconds (e.g., rapid color picker changes), don't process all 10:



Store latest value in KV



Process after 2-second quiet period



Only run the pipeline once with the final value

3. Incremental computation (saves CPU time) Instead of recomputing ALL tokens on every trigger:



Track which nodes are affected by the changed seed node



Only recompute the affected subtree



For a project with 100 nodes where the webhook targets a seed with 20 descendants, this cuts CPU by ~80%

4. Output caching with ETags (saves bandwidth + invocations)



Store a hash of the last computation result



Pull API returns 304 Not Modified if nothing changed



GitHub push skips if output matches current file content



Bottom Line

Yes, free tier handles this for launch and early growth. The math works for your target of 2,000-3,000 total users with ~150-300 using workflows. The critical mitigations are:



Push over pull — have consumers receive webhooks rather than polling your API



Debounce webhook inputs — batch rapid-fire triggers



Cache aggressively — computed output in KV, Cache-Control headers

When you hit ~400+ active workflow users or need guaranteed reliability, that's your signal to move to Supabase Pro — which aligns perfectly with your monetization plan of making cloud features paid at that point.