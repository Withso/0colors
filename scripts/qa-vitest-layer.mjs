#!/usr/bin/env node
import { spawn } from 'child_process';
import { getRunContext, resolveRunId, setLayerMeta, updateLatestRawPointer } from './qa-run-utils.mjs';

const layer = process.argv[2];
const allowedLayers = new Set(['unit', 'domain', 'property', 'component', 'integration']);

if (!allowedLayers.has(layer)) {
  console.error(`qa-vitest-layer: expected one of ${[...allowedLayers].join(', ')}`);
  process.exit(1);
}

const runId = resolveRunId(process.env.QA_RUN_ID);
const startedAt = process.env.QA_RUN_STARTED_AT || new Date().toISOString();
const ctx = getRunContext(runId);
const reportFile = ctx.reports[layer];

setLayerMeta(runId, layer, {
  layer,
  tool: 'vitest',
  reportPath: reportFile,
  status: 'running',
  startedAt,
});
updateLatestRawPointer(runId);

const child = spawn(
  'npx',
  ['vitest', 'run', '--config', 'packages/frontend/vitest.config.ts', '--project', layer, '--reporter=json', '--outputFile', reportFile],
  {
    cwd: ctx.runDir ? process.cwd() : process.cwd(),
    env: {
      ...process.env,
      QA_RUN_ID: runId,
      QA_RUN_STARTED_AT: startedAt,
    },
    stdio: 'inherit',
    shell: false,
  },
);

child.on('close', (code) => {
  setLayerMeta(runId, layer, {
    status: code === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
  });
  process.exit(code ?? 1);
});
