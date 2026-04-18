#!/usr/bin/env node
/**
 * Reads run-scoped Playwright + Vitest JSON reports, enriches them with manifest + overlay
 * metadata, builds the QA hub payload, appends run history, and copies TEST-CATALOG.md into
 * the frontend public folder.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ROOT,
  QA_LATEST_RAW_POINTER,
  getRunContext,
  readJsonSafe,
  resolveLatestRunId,
  toRootRelative,
} from './qa-run-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = ROOT || path.join(__dirname, '..');
const outDir = path.join(root, 'packages/frontend/public/qa-reports');
const outFile = path.join(outDir, 'latest-run.json');
const historyFile = path.join(outDir, 'runs-history.json');
const catalogSrc = path.join(root, 'QA-automation/TEST-CATALOG.md');
const catalogOutDir = path.join(root, 'packages/frontend/public/qa-docs');
const catalogOutFile = path.join(catalogOutDir, 'TEST-CATALOG.md');
const overlaysPath = path.join(root, 'QA-automation/automation-overlays.json');
const manifestPath = path.join(root, 'QA-automation/automated-case-manifest.json');
const layerOrder = [
  'unit',
  'domain',
  'property',
  'component',
  'integration',
  'qa-unit',
  'qa-domain',
  'qa-integration',
  'e2e',
  'qa-e2e',
  'qa-smoke',
];
const playwrightLayers = new Set(['e2e', 'qa-e2e', 'qa-smoke']);

function loadOverlays() {
  return (
    readJsonSafe(overlaysPath, {
      version: 0,
      files: {},
      introForNonTechnicalReaders: '',
      catalogVsAutomation: '',
      notYetAutomatedInPlaywright: [],
    }) || {}
  );
}

function loadManifest() {
  return (
    readJsonSafe(manifestPath, {
      schemaVersion: 0,
      files: {},
      layerDescriptions: {},
    }) || {}
  );
}

function walkDirFiles(dir) {
  const acc = [];
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) acc.push(...walkDirFiles(p));
    else acc.push(p);
  }
  return acc;
}

function reportPathLabel(filePath) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? toRootRelative(filePath) : String(filePath).split(path.sep).join('/');
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function repoTestInventory() {
  const frontendSrc = path.join(root, 'packages/frontend/src');
  const e2eDir = path.join(root, 'packages/frontend/tests/e2e');
  const qaTestsDir = path.join(root, 'QA-automation/projects/0colors/tests');
  const files = walkDirFiles(frontendSrc);
  const qaFiles = walkDirFiles(qaTestsDir);
  const countByPattern = (suffix) => files.filter((p) => p.endsWith(suffix));
  const e2eSpecs = fs.existsSync(e2eDir)
    ? fs.readdirSync(e2eDir).filter((f) => f.endsWith('.spec.ts'))
    : [];
  const qaSpecs = qaFiles.filter((p) => p.endsWith('.spec.ts'));
  return {
    unitFiles: countByPattern('.unit.test.ts'),
    domainFiles: countByPattern('.domain.test.ts'),
    propertyFiles: countByPattern('.property.test.ts'),
    componentFiles: files.filter((p) => p.endsWith('.component.test.ts') || p.endsWith('.component.test.tsx')),
    integrationFiles: files.filter((p) => p.endsWith('.integration.test.ts') || p.endsWith('.integration.test.tsx')),
    e2eSpecs,
    qaUnitFiles: qaFiles.filter((p) => p.endsWith('.unit.test.ts')),
    qaDomainFiles: qaFiles.filter((p) => p.endsWith('.domain.test.ts')),
    qaIntegrationFiles: qaFiles.filter((p) => p.endsWith('.integration.test.ts') || p.endsWith('.integration.test.tsx')),
    qaE2eSpecs: qaSpecs.filter((p) => p.includes(`${path.sep}e2e${path.sep}`)),
    qaSmokeSpecs: qaSpecs.filter((p) => !p.includes(`${path.sep}e2e${path.sep}`)),
  };
}

function findManifestCase(fileName, title, manifest) {
  const baseFile = path.basename(fileName || '');
  const normalizedFile = String(fileName || '').split(path.sep).join('/');
  const qaNormalizedFile = normalizedFile.startsWith('QA-automation/')
    ? normalizedFile
    : `QA-automation/${normalizedFile}`;
  const fileEntry = manifest.files?.[normalizedFile] || manifest.files?.[qaNormalizedFile] || manifest.files?.[baseFile];
  if (!fileEntry) return null;
  const exact = (fileEntry.cases || []).find((entry) => entry.exactTitle === title);
  if (exact) return { fileEntry, caseEntry: exact };
  const partial = (fileEntry.cases || []).find((entry) => entry.match && title.includes(entry.match));
  return partial ? { fileEntry, caseEntry: partial } : { fileEntry, caseEntry: null };
}

function inferCaseKind(layer, manifestFile, manifestCase) {
  return (
    manifestCase?.kind ||
    manifestFile?.kind ||
    (playwrightLayers.has(layer) ? 'workflow' : layer === 'property' ? 'generated-matrix' : 'check')
  );
}

function inferSurfaces(layer, row, manifestFile, manifestCase) {
  if (Array.isArray(manifestCase?.surfacesChecked) && manifestCase.surfacesChecked.length) return manifestCase.surfacesChecked;
  if (Array.isArray(manifestFile?.surfacesChecked) && manifestFile.surfacesChecked.length) return manifestFile.surfacesChecked;

  if (playwrightLayers.has(layer)) {
    const title = String(row.title || '').toLowerCase();
    const surfaces = ['browser'];
    if (title.includes('token')) surfaces.push('token-table');
    if (title.includes('code')) surfaces.push('code-view');
    if (title.includes('export')) surfaces.push('export-view');
    if (title.includes('advanced')) surfaces.push('advanced-popup');
    return surfaces;
  }
  if (layer === 'component') return ['component-ui'];
  if (layer === 'integration') return ['store', 'effects'];
  if (layer === 'property') return ['logic-matrix'];
  return ['logic'];
}

function enrichTestRow(row, overlays, manifest) {
  const base = path.basename(row.file || '');
  const overlayEntry = overlays.files?.[base];
  const manifestMatch = findManifestCase(row.file || base, String(row.title || ''), manifest);
  const manifestFile = manifestMatch?.fileEntry;
  const manifestCase = manifestMatch?.caseEntry;
  const normalizedTitle = String(row.title || '').replace(/^\[[^\]]+\]\s*/g, '');

  let plainDescription = '';
  if (overlayEntry?.plainByPhrase) {
    const t = normalizedTitle.toLowerCase();
    for (const phrase of overlayEntry.plainByPhrase) {
      if (t.includes(String(phrase.includes).toLowerCase())) {
        plainDescription = phrase.plain;
        break;
      }
    }
  }
  if (!plainDescription) plainDescription = overlayEntry?.fallbackPlain || manifestCase?.plainDescription || `Checks: ${normalizedTitle}`;

  const moduleName =
    overlayEntry?.module ||
    manifestCase?.module ||
    manifestFile?.module ||
    (row.layer === 'e2e' ? 'Browser tests (unspecified file)' : 'Code tests (unspecified file)');
  const moduleOrder =
    typeof overlayEntry?.moduleOrder === 'number'
      ? overlayEntry.moduleOrder
      : typeof manifestFile?.moduleOrder === 'number'
        ? manifestFile.moduleOrder
        : 900;
  const flakeStatus =
    row.status === 'flaky'
      ? 'flaky'
      : row.retries > 0 && row.status === 'passed'
        ? 'recovered'
        : 'stable';
  const kind = inferCaseKind(row.layer, manifestFile, manifestCase);
  const generatedRuns =
    manifestCase?.generatedRuns ??
    manifestFile?.generatedRuns ??
    (kind === 'generated-matrix' ? 40 : null);
  const subcaseCount =
    manifestCase?.subcaseCount ??
    manifestFile?.subcaseCount ??
    (kind === 'generated-matrix' ? generatedRuns : 1);

  return {
    ...row,
    caseId: manifestCase?.caseId || null,
    layer: manifestCase?.layer || manifestFile?.layer || row.layer,
    profile: manifestCase?.profile || manifestFile?.profile || 'full',
    module: moduleName,
    moduleOrder,
    tags: manifestCase?.tags || manifestFile?.tags || [],
    parentScenario: manifestCase?.parentScenario || manifestFile?.parentScenario || null,
    equivalenceClass: manifestCase?.equivalenceClass || manifestFile?.equivalenceClass || null,
    fixture: manifestCase?.fixture || manifestFile?.fixture || null,
    seed: manifestCase?.seed ?? manifestFile?.seed ?? null,
    generatedFrom: manifestCase?.generatedFrom || manifestFile?.generatedFrom || null,
    sourceKind: manifestCase?.source || manifestFile?.source || null,
    kind,
    scenarioId: manifestCase?.scenarioId || manifestCase?.parentScenario || manifestFile?.scenarioId || manifestFile?.parentScenario || null,
    subcaseCount,
    surfacesChecked: inferSurfaces(row.layer, row, manifestFile, manifestCase),
    stepList: manifestCase?.stepList || manifestFile?.stepList || null,
    generatedRuns,
    assertionCount: manifestCase?.assertionCount ?? manifestFile?.assertionCount ?? 1,
    plainDescription,
    fileBlurb: overlayEntry?.fileBlurb ?? manifestFile?.fileBlurb ?? null,
    flakeStatus,
  };
}

function parseVitestLayer(layer, reportPath, overlays, manifest) {
  const report = readJsonSafe(reportPath, null);
  if (!report) return null;

  const allResults = [];
  let durationMs = 0;
  for (const file of report.testResults || []) {
    for (const assertion of file.assertionResults || []) {
      const status =
        assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped';
      const row = enrichTestRow(
        {
          title: assertion.fullName || assertion.title || 'Unnamed test',
          file: reportPathLabel(file.name),
          status,
          durationMs: Math.round(Number(assertion.duration) || 0),
          errorMessage: stripAnsi((assertion.failureMessages || []).join('\n')),
          layer,
          retries: 0,
          artifacts: [],
        },
        overlays,
        manifest,
      );
      durationMs += row.durationMs || 0;
      allResults.push(row);
    }
  }

  return {
    layer,
    tool: 'vitest',
    summary: {
      passed: report.numPassedTests ?? allResults.filter((r) => r.status === 'passed').length,
      failed: report.numFailedTests ?? allResults.filter((r) => r.status === 'failed').length,
      skipped: report.numPendingTests ?? allResults.filter((r) => r.status === 'skipped').length,
      flaky: 0,
      durationMs,
      total: report.numTotalTests ?? allResults.length,
    },
    allResults,
    success: report.success === true,
    rawPath: toRootRelative(reportPath),
  };
}

function pushPlaywrightSpecs(layer, suite, prefix, rows, overlays, manifest) {
  const segment = suite.title ? `${suite.title} › ` : '';
  const nextPrefix = prefix + segment;

  for (const spec of suite.specs || []) {
    const specTitle = spec.title || '';
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const finalResult = results[results.length - 1] || {};
      const errors = finalResult.errors || [];
      const errorMessage = errors
        .map((e) => stripAnsi(typeof e === 'string' ? e : e?.message || JSON.stringify(e)))
        .filter(Boolean)
        .join('\n');
      const errorStack = errors
        .map((e) => stripAnsi(e && typeof e === 'object' ? e.stack : ''))
        .filter(Boolean)
        .join('\n');
      const attachments = results
        .flatMap((result) => result.attachments || [])
        .map((attachment) => attachment.path)
        .filter(Boolean)
        .map((attachmentPath) => toRootRelative(attachmentPath));

      let status = 'passed';
      if (test.status === 'unexpected') status = 'failed';
      else if (test.status === 'skipped') status = 'skipped';
      else if (test.status === 'flaky') status = 'flaky';
      else if (finalResult.status === 'timedOut') status = 'failed';

      rows.push(
        enrichTestRow(
          {
            title: nextPrefix + specTitle,
            file: reportPathLabel(spec.file || suite.file || ''),
            status,
            playwrightTestStatus: test.status,
            durationMs: finalResult.duration ?? 0,
            errorMessage,
            errorStack,
            layer,
            retries: Math.max(0, results.length - 1),
            artifacts: attachments,
          },
          overlays,
          manifest,
        ),
      );
    }
  }

  for (const child of suite.suites || []) {
    pushPlaywrightSpecs(layer, child, nextPrefix, rows, overlays, manifest);
  }
}

function parsePlaywrightLayer(layer, reportPath, overlays, manifest) {
  const raw = readJsonSafe(reportPath, null);
  if (!raw) return null;
  const rows = [];
  for (const suite of raw.suites || []) {
    pushPlaywrightSpecs(layer, suite, '', rows, overlays, manifest);
  }
  return {
    layer,
    tool: 'playwright',
    summary: {
      passed: rows.filter((r) => r.status === 'passed').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      flaky: rows.filter((r) => r.status === 'flaky').length,
      durationMs: rows.reduce((sum, row) => sum + (row.durationMs || 0), 0),
      total: rows.length,
    },
    allResults: rows,
    success: rows.every((row) => row.status !== 'failed'),
    rawPath: toRootRelative(reportPath),
    playwrightStats: raw.stats || null,
  };
}

function summarizeCombined(layers) {
  const summary = { passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0, total: 0 };
  for (const layer of Object.values(layers)) {
    if (!layer?.summary) continue;
    summary.passed += layer.summary.passed || 0;
    summary.failed += layer.summary.failed || 0;
    summary.skipped += layer.summary.skipped || 0;
    summary.flaky += layer.summary.flaky || 0;
    summary.durationMs += layer.summary.durationMs || 0;
    summary.total += layer.summary.total || 0;
  }
  return summary;
}

function buildTextReport({ runId, startedAt, finishedAt, layers, failures, integrity }) {
  const lines = [];
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('0colors — QA automation text report');
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push(`Run ID:        ${runId || '(n/a)'}`);
  lines.push(`Started:       ${startedAt || '(n/a)'}`);
  lines.push(`Finished:      ${finishedAt || '(n/a)'}`);
  lines.push('');

  const combined = summarizeCombined(layers);
  lines.push('── Combined summary ──');
  lines.push(`  Passed:   ${combined.passed}`);
  lines.push(`  Failed:   ${combined.failed}`);
  lines.push(`  Skipped:  ${combined.skipped}`);
  lines.push(`  Flaky:    ${combined.flaky}`);
  lines.push(`  Total:    ${combined.total}`);
  lines.push(`  Duration: ${combined.durationMs} ms (sum of per-test durations)`);
  lines.push('');

  lines.push('── Layer summary ──');
  for (const layerName of layerOrder) {
    const layer = layers[layerName];
    if (!layer) continue;
    lines.push(
      `  ${layerName}: ${layer.summary.passed} passed, ${layer.summary.failed} failed, ${layer.summary.skipped} skipped, ${layer.summary.total} total`,
    );
  }
  lines.push('');

  if (failures.length) {
    lines.push('── Failures ──');
    failures.forEach((failure, index) => {
      lines.push(`  ${index + 1}. [${failure.id}] ${failure.title}`);
      lines.push(`     Layer: ${failure.layer} · File: ${failure.file}`);
      lines.push(`     ${failure.summary}`);
    });
    lines.push('');
  }

  if (integrity) {
    lines.push('── Integrity ──');
    lines.push(`  ${integrity.message}`);
    lines.push('');
  }

  lines.push('── Notes ──');
  lines.push('  This report is report-only. Fix defects in separate development work.');
  lines.push('  Full machine catalog: QA-automation/automated-case-manifest.json');
  lines.push('  Full human catalog: QA-automation/TEST-CATALOG.md');
  lines.push('══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

function appendHistory(entry) {
  let prev = { schemaVersion: 1, runs: [] };
  try {
    if (fs.existsSync(historyFile)) prev = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch {
    prev = { schemaVersion: 1, runs: [] };
  }

  const runs = Array.isArray(prev.runs) ? prev.runs : [];
  const merged = [entry, ...runs.filter((run) => run.runId !== entry.runId)].slice(0, 25);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify({ schemaVersion: 1, runs: merged }, null, 2));
}

function copyCatalog() {
  try {
    if (!fs.existsSync(catalogSrc)) return;
    fs.mkdirSync(catalogOutDir, { recursive: true });
    fs.copyFileSync(catalogSrc, catalogOutFile);
    console.log(`sync-qa-dashboard: copied TEST-CATALOG.md → ${path.relative(root, catalogOutFile)}`);
  } catch (error) {
    console.warn('sync-qa-dashboard: catalog copy skipped', error.message);
  }
}

function resolveRunMeta() {
  const explicitRunId = process.env.QA_RUN_ID;
  const runId = explicitRunId || resolveLatestRunId();
  if (!runId) return null;
  const ctx = getRunContext(runId);
  const meta = readJsonSafe(ctx.metaFile, null);
  if (!meta) return null;
  return { runId, ctx, meta };
}

function buildIntegrity(meta, layers, inventory) {
  const expectedLayers = meta?.source === 'qa:full' ? layerOrder : Object.keys(meta?.layers || {});
  const missingLayers = expectedLayers.filter((layer) => !layers[layer]);
  const failedLayers = expectedLayers.filter((layer) => layers[layer]?.summary?.failed > 0);
  const details = [];

  if (missingLayers.length) details.push(`missing layer data: ${missingLayers.join(', ')}`);
  if (failedLayers.length) details.push(`failed layers: ${failedLayers.join(', ')}`);
  if (meta?.status && meta.status !== 'passed' && meta.status !== 'failed') details.push(`run status: ${meta.status}`);
  if ((layers.e2e?.summary?.total || 0) > 0 && (layers.e2e?.summary?.total || 0) < Math.min(inventory.e2eSpecs.length, 5)) {
    details.push('browser test count is unexpectedly low for this repo');
  }
  if (meta?.source === 'qa:full' && !layers['qa-e2e']) details.push('QA auth/cloud browser layer was not reported');
  if (meta?.source === 'qa:full' && !layers['qa-smoke']) details.push('QA smoke browser layer was not reported');

  if (!details.length) return null;
  const hasCompletenessProblem = missingLayers.length > 0 || details.some((detail) => detail.includes('not reported') || detail.includes('unexpectedly low') || detail.startsWith('run status:'));
  const prefix = hasCompletenessProblem ? 'This run looks incomplete or partial' : 'This run completed with test failures';
  return {
    level: failedLayers.length ? 'warning' : 'info',
    message: `${prefix}: ${details.join('; ')}.`,
    details,
  };
}

function main() {
  const overlays = loadOverlays();
  const manifest = loadManifest();
  const resolved = resolveRunMeta();
  const startedAt = process.env.QA_RUN_STARTED_AT || resolved?.meta?.startedAt || null;
  const finishedAt = process.env.QA_RUN_FINISHED_AT || resolved?.meta?.finishedAt || new Date().toISOString();
  const generatedAt = finishedAt;
  const inventory = repoTestInventory();

  const layers = {};
  if (resolved?.meta?.layers) {
    for (const layerName of layerOrder) {
      const layerMeta = resolved.meta.layers[layerName];
      if (!layerMeta?.reportPath) continue;
      const reportPath = path.isAbsolute(layerMeta.reportPath)
        ? layerMeta.reportPath
        : path.join(root, layerMeta.reportPath);
      const parsed =
        playwrightLayers.has(layerName)
          ? parsePlaywrightLayer(layerName, reportPath, overlays, manifest)
          : parseVitestLayer(layerName, reportPath, overlays, manifest);
      if (parsed) layers[layerName] = parsed;
    }
  } else {
    // Legacy fallback for old local files.
    const legacyUnit = path.join(root, 'QA-automation/reports/unit-results.json');
    const legacyE2e = path.join(root, 'QA-automation/reports/e2e-results.json');
    const parsedUnit = parseVitestLayer('unit', legacyUnit, overlays, manifest);
    const parsedE2e = parsePlaywrightLayer('e2e', legacyE2e, overlays, manifest);
    if (parsedUnit) layers.unit = parsedUnit;
    if (parsedE2e) layers.e2e = parsedE2e;
  }

  const allResults = layerOrder.flatMap((layerName) =>
    (layers[layerName]?.allResults || []).map((row) => ({ ...row, suite: layerName })),
  );
  const failures = allResults
    .filter((row) => row.status === 'failed')
    .map((row, index) => ({
      id: `BUG-${String(row.layer || row.suite || 'qa').toUpperCase()}-${index + 1}`,
      layer: row.layer || row.suite || 'unknown',
      module: row.module,
      title: row.title,
      file: row.file,
      plainDescription: row.plainDescription,
      summary: stripAnsi(row.errorMessage?.split('\n')[0] || 'Failed'),
      detail: stripAnsi(row.errorMessage),
      stack: stripAnsi(row.errorStack || ''),
      caseId: row.caseId || null,
      fixture: row.fixture || null,
      seed: row.seed ?? null,
    }));
  const skippedTests = allResults
    .filter((row) => row.status === 'skipped')
    .map((row) => ({
      title: row.title,
      file: row.file,
      module: row.module,
      plainDescription: row.plainDescription,
      layer: row.layer || row.suite || null,
      caseId: row.caseId || null,
    }));

  const integrity = buildIntegrity(resolved?.meta || null, layers, inventory);
  const combined = summarizeCombined(layers);
  const coverageByModule = {};
  for (const row of allResults) {
    const moduleName = row.module || 'Other';
    if (!coverageByModule[moduleName]) {
      coverageByModule[moduleName] = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
    }
    coverageByModule[moduleName].total += 1;
    coverageByModule[moduleName][row.status] += 1;
  }

  const coverage = {
    introForNonTechnicalReaders: overlays.introForNonTechnicalReaders || '',
    catalogVsAutomation: overlays.catalogVsAutomation || '',
    automationGaps: Array.isArray(overlays.notYetAutomatedInPlaywright) ? overlays.notYetAutomatedInPlaywright : [],
    repo: {
      unitTestFiles: inventory.unitFiles.length,
      domainTestFiles: inventory.domainFiles.length,
      propertyTestFiles: inventory.propertyFiles.length,
      componentTestFiles: inventory.componentFiles.length,
      integrationTestFiles: inventory.integrationFiles.length,
      e2eSpecFiles: inventory.e2eSpecs.length,
      qaUnitTestFiles: inventory.qaUnitFiles.length,
      qaDomainTestFiles: inventory.qaDomainFiles.length,
      qaIntegrationTestFiles: inventory.qaIntegrationFiles.length,
      qaE2eSpecFiles: inventory.qaE2eSpecs.length,
      qaSmokeSpecFiles: inventory.qaSmokeSpecs.length,
      unitTestPaths: inventory.unitFiles.map((filePath) => toRootRelative(filePath)),
      domainTestPaths: inventory.domainFiles.map((filePath) => toRootRelative(filePath)),
      propertyTestPaths: inventory.propertyFiles.map((filePath) => toRootRelative(filePath)),
      componentTestPaths: inventory.componentFiles.map((filePath) => toRootRelative(filePath)),
      integrationTestPaths: inventory.integrationFiles.map((filePath) => toRootRelative(filePath)),
      e2eSpecNames: inventory.e2eSpecs,
      qaUnitTestPaths: inventory.qaUnitFiles.map((filePath) => toRootRelative(filePath)),
      qaDomainTestPaths: inventory.qaDomainFiles.map((filePath) => toRootRelative(filePath)),
      qaIntegrationTestPaths: inventory.qaIntegrationFiles.map((filePath) => toRootRelative(filePath)),
      qaE2eSpecNames: inventory.qaE2eSpecs.map((filePath) => toRootRelative(filePath)),
      qaSmokeSpecNames: inventory.qaSmokeSpecs.map((filePath) => toRootRelative(filePath)),
    },
    thisRun: {
      combinedCases: combined.total,
      layerCounts: Object.fromEntries(
        layerOrder.map((layerName) => [layerName, layers[layerName]?.summary?.total || 0]),
      ),
    },
    caseManifest: {
      path: toRootRelative(manifestPath),
      totalFiles: Object.keys(manifest.files || {}).length,
      totalCases: Object.values(manifest.files || {}).reduce((sum, fileEntry) => sum + ((fileEntry.cases || []).length || 0), 0),
    },
    coverageByModule,
    integrity,
  };

  const textReport = buildTextReport({
    runId: resolved?.runId || readJsonSafe(QA_LATEST_RAW_POINTER, {}).runId || null,
    startedAt,
    finishedAt,
    layers,
    failures,
    integrity,
  });

  const payload = {
    schemaVersion: 4,
    runId: resolved?.runId || null,
    startedAt,
    finishedAt,
    generatedAt,
    source: resolved?.meta?.source || 'sync-script',
    textReport,
    summary: combined,
    coverage,
    layers,
    unit: layers.unit || { summary: { passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0, total: 0 }, allResults: [] },
    e2e: layers.e2e || { summary: { passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0, total: 0 }, allResults: [] },
    failures,
    skippedTests,
    allResults,
    catalogPath: 'QA-automation/TEST-CATALOG.md',
    catalogUrl: '/qa-docs/TEST-CATALOG.md',
    bugs: failures,
    reportMeta: resolved?.meta || null,
    caseManifestPath: toRootRelative(manifestPath),
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(
    `sync-qa-dashboard: wrote ${path.relative(root, outFile)} (combined: ${combined.passed} passed, ${combined.failed} failed, ${combined.skipped} skipped)`,
  );

  appendHistory({
    runId: payload.runId || generatedAt,
    startedAt,
    finishedAt,
    textReport,
    summary: payload.summary,
    payload,
  });
  console.log(`sync-qa-dashboard: updated ${path.relative(root, historyFile)}`);
  copyCatalog();
}

main();
