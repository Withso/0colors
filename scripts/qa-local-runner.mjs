#!/usr/bin/env node
/**
 * Local-only HTTP service: runs the layered QA pipeline when you click "Run all tests" in the QA hub.
 * Binds 127.0.0.1 only — never expose to a network.
 *
 * Usage (separate terminal): npm run qa:runner
 * Frontend (localhost): POST http://127.0.0.1:47841/run  { "baseUrl": "http://localhost:3000" }
 */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.QA_RUNNER_PORT || 47841);
const HOST = '127.0.0.1';

const state = {
  running: false,
  phase: 'idle',
  startedAt: null,
  finishedAt: null,
  runId: null,
  log: [],
  lastExitCodes: { qaFull: null },
};

const MAX_LOG = 800;

function appendLog(chunk) {
  const lines = String(chunk).split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const match = line.match(/^\[qa:phase\]\s+(.+)$/);
    if (match) {
      state.phase = match[1];
      continue;
    }
    state.log.push({ t: Date.now(), line });
  }
  while (state.log.length > MAX_LOG) state.log.shift();
}

function allowedOrigin(origin) {
  if (!origin) return '*';
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function setCors(res, origin) {
  const ao = allowedOrigin(origin);
  if (ao) {
    res.setHeader('Access-Control-Allow-Origin', ao);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function runCmd(command, args, options = {}) {
  return new Promise((resolve) => {
    appendLog(`\n$ ${command} ${args.join(' ')}\n`);
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...options.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      shell: false,
    });
    child.stdout.on('data', (d) => appendLog(d));
    child.stderr.on('data', (d) => appendLog(d));
    child.on('error', (err) => {
      appendLog(`\nspawn error: ${err.message}\n`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function runPipeline(baseUrl, runId) {
  if (state.running) return;
  state.running = true;
  state.phase = 'starting';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.runId = runId;
  state.log = [];
  state.lastExitCodes = { qaFull: null };

  try {
    state.lastExitCodes.qaFull = await runCmd('node', [path.join(ROOT, 'scripts/qa-full-run.mjs')], {
      cwd: ROOT,
      env: {
        QA_RUN_ID: state.runId,
        QA_RUN_STARTED_AT: state.startedAt,
        BASE_URL: baseUrl || 'http://localhost:3000',
        PLAYWRIGHT_SKIP_WEB_SERVER: '1',
      },
    });

    state.phase = 'done';
    state.finishedAt = new Date().toISOString();
    appendLog(`\n[qa-runner] Finished run ${state.runId} (qa:full exit=${state.lastExitCodes.qaFull})\n`);
  } catch (e) {
    appendLog(`\n[qa-runner] fatal: ${e}\n`);
    state.phase = 'error';
    state.finishedAt = new Date().toISOString();
  } finally {
    state.running = false;
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: '0colors-qa-runner', bind: `${HOST}:${PORT}` }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        running: state.running,
        phase: state.phase,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt,
        runId: state.runId,
        log: state.log.slice(-200),
        lastExitCodes: state.lastExitCodes,
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let baseUrl = 'http://localhost:3000';
    try {
      const j = body ? JSON.parse(body) : {};
      if (j.baseUrl) baseUrl = String(j.baseUrl);
    } catch {
      /* ignore */
    }

    if (state.running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Already running' }));
      return;
    }

    const rid = randomUUID();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, runId: rid, message: 'Pipeline started' }));

    void runPipeline(baseUrl, rid);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`0colors QA runner listening on http://${HOST}:${PORT} (local only)`);
  console.log('Start the Vite app on :3000, then use QA hub → Run all tests.');
});
