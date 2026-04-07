#!/usr/bin/env node
import { spawn } from 'child_process';
import { getRunContext, resolveRunId, setLayerMeta, updateLatestRawPointer } from './qa-run-utils.mjs';

const runId = resolveRunId(process.env.QA_RUN_ID);
const startedAt = process.env.QA_RUN_STARTED_AT || new Date().toISOString();
const ctx = getRunContext(runId);
const reportFile = ctx.reports.e2e;

setLayerMeta(runId, 'e2e', {
  layer: 'e2e',
  tool: 'playwright',
  reportPath: reportFile,
  status: 'running',
  startedAt,
});
updateLatestRawPointer(runId);

const env = {
  ...process.env,
  QA_RUN_ID: runId,
  QA_RUN_STARTED_AT: startedAt,
  QA_E2E_REPORT_FILE: reportFile,
};

const child = spawn('npx', ['playwright', 'test'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('close', (code) => {
  setLayerMeta(runId, 'e2e', {
    status: code === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
  });
  process.exit(code ?? 1);
});
