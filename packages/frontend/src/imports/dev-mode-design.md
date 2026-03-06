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
Data	Size	Where
Dev config per project	~2-3 KB	Inside project snapshot (devConfig key)
Webhook pending queue	~100 bytes	KV: webhook:<projectId>:pending
GitHub PAT (encrypted)	~300 bytes	KV: user:<id>:dev-secrets
Cached token output (for pull API)	~5-50 KB	KV: project:<id>:token-output
Total per user	~10-55 KB	Negligible
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

