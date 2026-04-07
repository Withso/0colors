#!/usr/bin/env node
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { getRunContext, resolveRunId, setLayerMeta, updateLatestRawPointer, writeRunMeta, toRootRelative } from './qa-run-utils.mjs';

function logPhase(phase) {
  console.log(`[qa:phase] ${phase}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
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

logPhase('sync');
const finishedAt = new Date().toISOString();
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
