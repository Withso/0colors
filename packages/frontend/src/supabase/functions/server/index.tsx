// ═══════════════════════════════════════════════════════════════
// 0colors — Supabase Edge Function (DEPRECATED STUB)
// ═══════════════════════════════════════════════════════════════
//
// ALL API routes have been migrated to the Railway backend:
//   https://api-server-production-0064.up.railway.app/api
//
// Supabase is now used ONLY for authentication (supabase.auth).
// This file is kept as a minimal stub because the Figma Make
// infrastructure expects a Deno.serve() entrypoint to exist.
//
// The real backend lives at: github.com/Withso/0colors-Backend
// ═══════════════════════════════════════════════════════════════

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    maxAge: 600,
  }),
);

// Health check — only route kept alive for infrastructure probes
app.get("/make-server-c36383cd/health", (c) => {
  return c.json({
    status: "ok",
    message: "Edge function stub — all routes migrated to Railway backend",
    railway: "https://api-server-production-0064.up.railway.app/api",
    timestamp: Date.now(),
  });
});

// Catch-all: inform callers that routes have moved
app.all("/make-server-c36383cd/*", (c) => {
  return c.json(
    {
      error: "This endpoint has been migrated to the Railway backend.",
      railway: "https://api-server-production-0064.up.railway.app/api",
      path: c.req.path,
    },
    410, // 410 Gone
  );
});

console.log("[Server] 0colors edge function stub (all routes on Railway)");
Deno.serve((req) => app.fetch(req));
