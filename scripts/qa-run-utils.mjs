#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..');
export const QA_REPORTS_DIR = path.join(ROOT, 'QA-automation/reports');
export const QA_RUNS_DIR = path.join(QA_REPORTS_DIR, 'runs');
export const QA_LATEST_RAW_POINTER = path.join(QA_REPORTS_DIR, 'latest-raw-run.json');

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function toRootRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

export function sanitizeRunId(runId) {
  return String(runId || 'manual-local').replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function resolveRunId(explicitRunId) {
  if (explicitRunId) return sanitizeRunId(explicitRunId);
  return 'manual-local';
}

export function getRunContext(runIdInput) {
  const runId = resolveRunId(runIdInput);
  const runDir = path.join(QA_RUNS_DIR, runId);
  const metaFile = path.join(runDir, 'meta.json');
  ensureDir(runDir);
  return {
    runId,
    runDir,
    metaFile,
    reports: {
      unit: path.join(runDir, 'unit-results.json'),
      domain: path.join(runDir, 'domain-results.json'),
      property: path.join(runDir, 'property-results.json'),
      component: path.join(runDir, 'component-results.json'),
      integration: path.join(runDir, 'integration-results.json'),
      e2e: path.join(runDir, 'e2e-results.json'),
      'qa-unit': path.join(runDir, 'qa-unit-results.json'),
      'qa-domain': path.join(runDir, 'qa-domain-results.json'),
      'qa-integration': path.join(runDir, 'qa-integration-results.json'),
      'qa-e2e': path.join(runDir, 'qa-e2e-results.json'),
      'qa-smoke': path.join(runDir, 'qa-smoke-results.json'),
    },
  };
}

export function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function readRunMeta(runIdInput) {
  const { metaFile } = getRunContext(runIdInput);
  return readJsonSafe(metaFile, null);
}

export function writeRunMeta(runIdInput, updater) {
  const ctx = getRunContext(runIdInput);
  const current =
    readJsonSafe(ctx.metaFile, {
      schemaVersion: 1,
      runId: ctx.runId,
      source: 'manual',
      status: 'created',
      startedAt: null,
      finishedAt: null,
      layers: {},
    }) || {};
  const next = typeof updater === 'function' ? updater(current, ctx) : updater;
  writeJson(ctx.metaFile, next);
  return next;
}

export function updateLatestRawPointer(runIdInput) {
  const ctx = getRunContext(runIdInput);
  writeJson(QA_LATEST_RAW_POINTER, {
    schemaVersion: 1,
    runId: ctx.runId,
    metaPath: toRootRelative(ctx.metaFile),
    updatedAt: new Date().toISOString(),
  });
}

export function resolveLatestRunId() {
  const pointer = readJsonSafe(QA_LATEST_RAW_POINTER, null);
  if (pointer?.runId) return pointer.runId;

  if (!fs.existsSync(QA_RUNS_DIR)) return null;
  const dirs = fs
    .readdirSync(QA_RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aMeta = readRunMeta(a);
      const bMeta = readRunMeta(b);
      const aWhen = aMeta?.finishedAt || aMeta?.startedAt || '';
      const bWhen = bMeta?.finishedAt || bMeta?.startedAt || '';
      return String(bWhen).localeCompare(String(aWhen));
    });
  return dirs[0] || null;
}

export function setLayerMeta(runIdInput, layer, patch) {
  return writeRunMeta(runIdInput, (current) => {
    const existingLayer = current.layers?.[layer] || {};
    return {
      ...current,
      layers: {
        ...(current.layers || {}),
        [layer]: {
          ...existingLayer,
          ...patch,
        },
      },
    };
  });
}
