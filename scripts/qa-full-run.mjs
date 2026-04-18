#!/usr/bin/env node
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { ROOT, getRunContext, resolveRunId, setLayerMeta, updateLatestRawPointer, writeRunMeta, toRootRelative } from './qa-run-utils.mjs';

function logPhase(phase) {
  console.log(`[qa:phase] ${phase}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

const runId = resolveRunId(process.env.QA_RUN_ID || randomUUID());
const startedAt = process.env.QA_RUN_STARTED_AT || new Date().toISOString();
const ctx = getRunContext(runId);

writeRunMeta(runId, {
  schemaVersion: 1,
  runId,
  source: 'qa:full',
  status: 'running',
  startedAt,
  finishedAt: null,
  layers: {},
});
updateLatestRawPointer(runId);

const vitestLayers = ['unit', 'domain', 'property', 'component', 'integration'];
const failures = [];

for (const layer of vitestLayers) {
  logPhase(layer);
  const reportFile = ctx.reports[layer];
  setLayerMeta(runId, layer, {
    layer,
    tool: 'vitest',
    reportPath: reportFile,
    status: 'running',
    startedAt,
  });
  const rc = await runCommand('npx', ['vitest', 'run', '--config', 'packages/frontend/vitest.config.ts', '--project', layer, '--reporter=json', '--outputFile', reportFile], {
    env: {
      QA_RUN_ID: runId,
      QA_RUN_STARTED_AT: startedAt,
    },
  });
  setLayerMeta(runId, layer, {
    status: rc === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
  });
  if (rc !== 0) failures.push(layer);
}

// ── QA-automation vitest layers (auth, sync, db, session tests) ──
const qaVitestLayers = ['qa-unit', 'qa-domain', 'qa-integration'];
const qaVitestProjectMap = { 'qa-unit': 'unit', 'qa-domain': 'domain', 'qa-integration': 'integration' };

for (const layer of qaVitestLayers) {
  logPhase(layer);
  const reportFile = ctx.reports[layer];
  setLayerMeta(runId, layer, {
    layer,
    tool: 'vitest',
    reportPath: reportFile,
    status: 'running',
    startedAt,
  });
  const rc = await runCommand('npx', ['vitest', 'run', '--config', 'QA-automation/vitest.config.ts', '--project', qaVitestProjectMap[layer], '--reporter=json', '--outputFile', reportFile], {
    env: {
      QA_RUN_ID: runId,
      QA_RUN_STARTED_AT: startedAt,
    },
  });
  setLayerMeta(runId, layer, {
    status: rc === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
  });
  if (rc !== 0) failures.push(layer);
}

logPhase('e2e');
setLayerMeta(runId, 'e2e', {
  layer: 'e2e',
  tool: 'playwright',
  reportPath: ctx.reports.e2e,
  status: 'running',
  startedAt,
});
const e2eEnv = {
  QA_RUN_ID: runId,
  QA_RUN_STARTED_AT: startedAt,
  QA_E2E_REPORT_FILE: ctx.reports.e2e,
};
if (process.env.BASE_URL) {
  e2eEnv.BASE_URL = process.env.BASE_URL;
  e2eEnv.PLAYWRIGHT_SKIP_WEB_SERVER = process.env.PLAYWRIGHT_SKIP_WEB_SERVER || '1';
}
const e2eRc = await runCommand('npx', ['playwright', 'test'], { env: e2eEnv });
setLayerMeta(runId, 'e2e', {
  status: e2eRc === 0 ? 'passed' : 'failed',
  finishedAt: new Date().toISOString(),
});
if (e2eRc !== 0) failures.push('e2e');

// ── QA-automation Playwright layers (auth/cloud browser flows + reusable smoke specs) ──
const qaPlaywrightLayers = [
  { layer: 'qa-e2e', project: '0colors' },
  { layer: 'qa-smoke', project: '0colors-smoke' },
];
const qaAutomationCwd = path.join(ROOT, 'QA-automation');

for (const { layer, project } of qaPlaywrightLayers) {
  logPhase(layer);
  const reportFile = ctx.reports[layer];
  setLayerMeta(runId, layer, {
    layer,
    tool: 'playwright',
    project,
    reportPath: reportFile,
    status: 'running',
    startedAt,
  });
  const env = {
    QA_RUN_ID: runId,
    QA_RUN_STARTED_AT: startedAt,
    QA_PLAYWRIGHT_REPORT_FILE: reportFile,
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  };
  if (process.env.BASE_URL) {
    env.PLAYWRIGHT_SKIP_WEB_SERVER = process.env.PLAYWRIGHT_SKIP_WEB_SERVER || '1';
  } else if (process.env.PLAYWRIGHT_SKIP_WEB_SERVER) {
    env.PLAYWRIGHT_SKIP_WEB_SERVER = process.env.PLAYWRIGHT_SKIP_WEB_SERVER;
  }
  const rc = await runCommand('npx', ['playwright', 'test', '-c', 'playwright.config.ts', '--project', project], {
    cwd: qaAutomationCwd,
    env,
  });
  setLayerMeta(runId, layer, {
    status: rc === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
  });
  if (rc !== 0) failures.push(layer);
}

logPhase('sync');
const finishedAt = new Date().toISOString();
writeRunMeta(runId, (current) => ({
  ...current,
  finishedAt,
  status: failures.length === 0 ? 'passed' : 'failed',
  rawMetaPath: toRootRelative(ctx.metaFile),
}));

const syncRc = await runCommand('node', ['scripts/sync-qa-dashboard.mjs'], {
  env: {
    QA_RUN_ID: runId,
    QA_RUN_STARTED_AT: startedAt,
    QA_RUN_FINISHED_AT: finishedAt,
  },
});

writeRunMeta(runId, (current) => ({
  ...current,
  finishedAt,
  status: failures.length === 0 && syncRc === 0 ? 'passed' : 'failed',
  rawMetaPath: toRootRelative(ctx.metaFile),
}));

logPhase('done');
process.exit(failures.length === 0 && syncRc === 0 ? 0 : 1);
