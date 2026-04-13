import { useCallback, useEffect, useRef, useState, type ChangeEventHandler, type ReactNode } from 'react';
import { FlaskConical, ClipboardCopy, Upload, RefreshCw, Play, ArrowLeft, BookOpen, LayoutList, Loader2, Copy, Check } from 'lucide-react';
import './AdminQaDashboard.css';

const HISTORY_KEY = '0colors-qa-run-history';

/** Inline copy button with feedback */
function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    });
  }, [text]);
  return (
    <button className="admin-qa-copy-inline" onClick={handleCopy} title={label} data-testid="admin-qa-copy-btn">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

/** Build a consolidated plain-text bug report for clipboard */
function buildFullBugReport(bugs: QaFailure[]): string {
  if (!bugs.length) return 'No bugs found in this run.';
  const lines: string[] = [];
  lines.push(`0colors QA — ${bugs.length} bug(s) found`);
  lines.push('═'.repeat(60));
  lines.push('');
  bugs.forEach((b, i) => {
    lines.push(`── Bug ${i + 1}: ${b.id} ──`);
    lines.push(`Module:  ${b.module}`);
    lines.push(`Title:   ${b.title}`);
    lines.push(`File:    ${b.file}`);
    if (b.plainDescription) lines.push(`What:    ${b.plainDescription}`);
    lines.push(`Summary: ${b.summary}`);
    if (b.detail && b.detail !== b.summary) {
      lines.push('');
      lines.push('Call log / error detail:');
      lines.push(b.detail);
    }
    if (b.stack) {
      lines.push('');
      lines.push('Stack trace:');
      lines.push(b.stack);
    }
    lines.push('');
  });
  lines.push('═'.repeat(60));
  lines.push('Report-only — fix defects in separate development work.');
  return lines.join('\n');
}
const MAX_LOCAL = 15;
const RUNNER_PREFIX = '/__qa-runner';

const PHASE_LABELS: Record<string, string> = {
  idle: 'Runner idle — ready for a new run',
  starting: 'Sending request to the local runner…',
  unit: 'Running unit tests (Vitest) — usually quick',
  domain: 'Running domain tests — deep pure-logic coverage',
  property: 'Running property tests — seeded generated combinations',
  component: 'Running component tests — isolated UI coverage',
  integration: 'Running integration tests — store/effect wiring checks',
  e2e: 'Running browser tests (Playwright) — often several minutes; log updates below',
  sync: 'Writing merged report for this hub…',
  done: 'Pipeline finished',
  error: 'Pipeline stopped with an error',
};

const LAYER_LABELS: Record<string, string> = {
  unit: 'Unit',
  domain: 'Domain',
  property: 'Property',
  component: 'Component',
  integration: 'Integration',
  e2e: 'Browser',
};

const isViteDev = import.meta.env.DEV;

export interface QaFailure {
  id: string;
  module: string;
  title: string;
  file: string;
  summary: string;
  detail?: string;
  stack?: string;
  plainDescription?: string;
}

export interface QaCoverage {
  introForNonTechnicalReaders?: string;
  catalogVsAutomation?: string;
  repo?: {
    unitTestFiles: number;
    domainTestFiles?: number;
    propertyTestFiles?: number;
    componentTestFiles?: number;
    integrationTestFiles?: number;
    e2eSpecFiles: number;
    unitTestPaths: string[];
    domainTestPaths?: string[];
    propertyTestPaths?: string[];
    componentTestPaths?: string[];
    integrationTestPaths?: string[];
    e2eSpecNames: string[];
  };
  thisRun?: {
    combinedCases: number;
    layerCounts?: Record<string, number>;
  };
  integrity?: { level: string; message: string } | null;
  automationGaps?: { name: string; code: string; howWeTestToday: string; why: string }[];
  caseManifest?: { path: string; totalFiles: number; totalCases: number };
  coverageByModule?: Record<string, { total: number; passed: number; failed: number; skipped: number; flaky: number }>;
}

type QaCaseRow = {
  title: string;
  file: string;
  status: string;
  durationMs: number;
  errorMessage?: string;
  module?: string;
  moduleOrder?: number;
  plainDescription?: string;
  fileBlurb?: string | null;
  caseId?: string | null;
  layer?: string;
  profile?: string;
  fixture?: string | null;
  seed?: number | null;
  generatedFrom?: string | null;
  flakeStatus?: string;
  kind?: 'check' | 'workflow' | 'generated-matrix' | string;
  scenarioId?: string | null;
  subcaseCount?: number | null;
  surfacesChecked?: string[] | null;
  stepList?: string[] | null;
  generatedRuns?: number | null;
  assertionCount?: number | null;
};

type QaLayerReport = {
  layer?: string;
  summary: QaRunPayload['summary'];
  allResults: QaCaseRow[];
  success?: boolean;
  rawPath?: string;
};

export interface QaRunPayload {
  schemaVersion?: number;
  runId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  generatedAt?: string | null;
  source?: string;
  textReport?: string;
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    durationMs: number;
    total?: number;
  };
  unit?: {
    summary: QaRunPayload['summary'];
    allResults: QaCaseRow[];
    success?: boolean;
  };
  e2e?: {
    summary: QaRunPayload['summary'];
    allResults: QaCaseRow[];
  };
  layers?: Record<string, QaLayerReport>;
  failures: QaFailure[];
  skippedTests: { title: string; file: string; module?: string; plainDescription?: string }[];
  allResults?: (QaCaseRow & { suite?: string })[];
  coverage?: QaCoverage;
  catalogPath?: string;
  catalogUrl?: string;
  note?: string;
  bugs?: QaFailure[];
}

interface HistoryRun {
  runId: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  textReport?: string;
  summary: QaRunPayload['summary'];
  payload: QaRunPayload;
}

const EMPTY: QaRunPayload = {
  generatedAt: null,
  summary: { passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0, total: 0 },
  failures: [],
  skippedTests: [],
  textReport: '',
  note: 'No report loaded yet.',
};

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

function loadLocalFallbackHistory(): HistoryRun[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalFallbackHistory(runs: HistoryRun[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(0, MAX_LOCAL)));
  } catch {
    /* quota */
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.text();
}

/** Indian Standard Time (UTC+5:30) for QA run labels */
const QA_DISPLAY_TZ = 'Asia/Kolkata';

function formatInstantIst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleString('en-IN', {
    timeZone: QA_DISPLAY_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })} IST`;
}

function formatRunHeading(run: HistoryRun): { title: string; idLine?: string } {
  const when = run.finishedAt || run.startedAt;
  const ist = formatInstantIst(when);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run.runId);
  if (ist) {
    return {
      title: ist,
      idLine: uuid ? `Run id ${run.runId}` : undefined,
    };
  }
  const fromKey = formatInstantIst(run.runId);
  if (fromKey) {
    return { title: fromKey };
  }
  return {
    title: run.runId.length > 24 ? `Run ${run.runId.slice(0, 8)}…` : `Run ${run.runId}`,
    idLine: run.runId.length > 24 ? run.runId : undefined,
  };
}

function inlineBoldSegments(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(/\*\*/);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}

function groupCasesByModule<T extends { module?: string; moduleOrder?: number }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const m = r.module || 'Other';
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(r);
  }
  return [...map.entries()].sort((a, b) => {
    const oa = Math.min(...a[1].map((x) => x.moduleOrder ?? 999));
    const ob = Math.min(...b[1].map((x) => x.moduleOrder ?? 999));
    return oa - ob || a[0].localeCompare(b[0]);
  });
}

function uniqueBlurbs(rows: { fileBlurb?: string | null }[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.fileBlurb) s.add(r.fileBlurb);
  }
  return [...s];
}

function CoveragePanel({ coverage, compact }: { coverage: QaCoverage; compact?: boolean }) {
  const { introForNonTechnicalReaders, catalogVsAutomation, repo, thisRun, integrity } = coverage;
  return (
    <div className={compact ? 'admin-qa-coverage admin-qa-coverage--compact' : 'admin-qa-coverage'}>
      {integrity?.level === 'warning' && (
        <div className="admin-qa-callout admin-qa-callout--warn" role="status">
          {integrity.message}
        </div>
      )}
      {introForNonTechnicalReaders && (
        <p className="admin-qa-coverage-p">{inlineBoldSegments(introForNonTechnicalReaders)}</p>
      )}
      {catalogVsAutomation && <p className="admin-qa-coverage-p">{inlineBoldSegments(catalogVsAutomation)}</p>}
      {thisRun && repo && (
        <div className="admin-qa-coverage-grid">
          <div className="admin-qa-coverage-stat">
            <span className="admin-qa-coverage-label">This run (automated only)</span>
            <span className="admin-qa-coverage-value">
              {thisRun.combinedCases} cases in this report
            </span>
          </div>
          <div className="admin-qa-coverage-stat">
            <span className="admin-qa-coverage-label">Defined in the repo</span>
            <span className="admin-qa-coverage-value">
              {repo.unitTestFiles} unit, {repo.domainTestFiles || 0} domain, {repo.propertyTestFiles || 0} property,{' '}
              {repo.componentTestFiles || 0} component, {repo.integrationTestFiles || 0} integration, {repo.e2eSpecFiles} browser file(s)
            </span>
          </div>
        </div>
      )}
      {thisRun?.layerCounts ? (
        <div className="admin-qa-coverage-grid">
          {Object.entries(thisRun.layerCounts).map(([layerName, total]) => (
            <div key={layerName} className="admin-qa-coverage-stat">
              <span className="admin-qa-coverage-label">{LAYER_LABELS[layerName] || layerName}</span>
              <span className="admin-qa-coverage-value">{total} case(s)</span>
            </div>
          ))}
        </div>
      ) : null}
      {!compact && coverage.caseManifest ? (
        <div className="admin-qa-coverage-grid">
          <div className="admin-qa-coverage-stat">
            <span className="admin-qa-coverage-label">Automated case manifest</span>
            <span className="admin-qa-coverage-value">
              {coverage.caseManifest.totalCases} cases across {coverage.caseManifest.totalFiles} files
            </span>
          </div>
        </div>
      ) : null}
      {!compact && repo?.e2eSpecNames?.length ? (
        <details className="admin-qa-coverage-details">
          <summary>Browser spec files in the repo ({repo.e2eSpecNames.length})</summary>
          <ul className="admin-qa-coverage-list">
            {repo.e2eSpecNames.map((n) => (
              <li key={n} className="admin-qa-mono">
                {n}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!compact && repo?.unitTestPaths?.length ? (
        <details className="admin-qa-coverage-details">
          <summary>Unit test files ({repo.unitTestPaths.length})</summary>
          <ul className="admin-qa-coverage-list">
            {repo.unitTestPaths.map((p) => (
              <li key={p} className="admin-qa-mono">
                {p}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!compact && coverage.coverageByModule ? (
        <details className="admin-qa-coverage-details">
          <summary>Coverage by module ({Object.keys(coverage.coverageByModule).length})</summary>
          <ul className="admin-qa-coverage-list">
            {Object.entries(coverage.coverageByModule).map(([moduleName, stats]) => (
              <li key={moduleName}>
                <strong>{moduleName}</strong>: {stats.passed} passed, {stats.failed} failed, {stats.skipped} skipped, {stats.total} total
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!compact && coverage.automationGaps && coverage.automationGaps.length > 0 ? (
        <details className="admin-qa-coverage-details admin-qa-coverage-details--gaps">
          <summary>Complex UI not covered by Playwright yet (check catalog / manual)</summary>
          <ul className="admin-qa-gap-list">
            {coverage.automationGaps.map((g) => (
              <li key={g.name} className="admin-qa-gap-item">
                <div className="admin-qa-gap-name">{g.name}</div>
                <div className="admin-qa-gap-code admin-qa-mono">{g.code}</div>
                <p className="admin-qa-gap-text">{inlineBoldSegments(g.howWeTestToday)}</p>
                <p className="admin-qa-gap-why">{g.why}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function CaseTablesByModule({ rows, kind }: { rows: QaCaseRow[]; kind: string }) {
  const groups = groupCasesByModule(rows);
  return (
    <>
      {groups.map(([moduleName, list]) => (
        <div key={`${kind}-${moduleName}`} className="admin-qa-module">
          <h3 className="admin-qa-module-title">{moduleName}</h3>
          {uniqueBlurbs(list).map((b) => (
            <p key={b} className="admin-qa-module-blurb">
              {b}
            </p>
          ))}
          <div className="admin-qa-table-wrap">
            <table className="admin-qa-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Status</th>
                  <th>What this checked</th>
                  <th>Technical name</th>
                  <th>File</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={`${r.title}-${i}`}>
                    <td className="admin-qa-mono">{r.caseId || '—'}</td>
                    <td>
                      <span
                        className={`admin-qa-pill admin-qa-pill--${
                          r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : r.status === 'skipped' ? 'skip' : 'flaky'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="admin-qa-plain">
                      <div>{r.plainDescription || '—'}</div>
                      {(r.kind || r.scenarioId || r.subcaseCount || r.generatedRuns || r.surfacesChecked?.length) && (
                        <div className="admin-qa-meta">
                          {[
                            r.kind,
                            r.scenarioId ? `scenario ${r.scenarioId}` : null,
                            r.subcaseCount && r.subcaseCount > 1 ? `${r.subcaseCount} subcases` : null,
                            r.generatedRuns ? `${r.generatedRuns} generated runs` : null,
                            r.surfacesChecked?.length ? `surfaces: ${r.surfacesChecked.join(', ')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                      {r.stepList?.length ? <div className="admin-qa-meta">{r.stepList.join(' -> ')}</div> : null}
                    </td>
                    <td>{r.title}</td>
                    <td className="admin-qa-mono">{r.file}</td>
                    <td>{r.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function LayerSummaryGrid({ layers }: { layers: Record<string, QaLayerReport> }) {
  const names = Object.keys(layers).filter((name) => layers[name]?.summary);
  if (names.length === 0) return null;
  return (
    <div className="admin-qa-grid admin-qa-grid--compact">
      {names.map((name) => (
        <div key={name} className="admin-qa-stat">
          <div className="admin-qa-stat-label">{LAYER_LABELS[name] || name}</div>
          <div className="admin-qa-stat-value">{layers[name].summary.total}</div>
          <div className="admin-qa-meta">
            {layers[name].summary.failed} failed · {layers[name].summary.skipped} skipped
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminQaDashboard() {
  const [tab, setTab] = useState<'overview' | 'catalog'>('overview');
  const [selectedRun, setSelectedRun] = useState<HistoryRun | null>(null);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [latest, setLatest] = useState<QaRunPayload>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogMd, setCatalogMd] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [runnerUp, setRunnerUp] = useState<boolean | null>(null);
  const [runnerRunning, setRunnerRunning] = useState(false);
  const [runnerPhase, setRunnerPhase] = useState('');
  const [runnerLog, setRunnerLog] = useState<{ t: number; line: string }[]>([]);
  const [runnerStatusMessage, setRunnerStatusMessage] = useState<string | null>(null);
  const [runnerFinishedHint, setRunnerFinishedHint] = useState<string | null>(null);
  const [runElapsedTick, setRunElapsedTick] = useState(0);
  const runnerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runWallStartRef = useRef(0);

  useEffect(
    () => () => {
      if (runnerPollRef.current) {
        clearInterval(runnerPollRef.current);
        runnerPollRef.current = null;
      }
    },
    [],
  );

  const mergeRuns = useCallback((fromFile: HistoryRun[], latestPayload: QaRunPayload | null) => {
    const map = new Map<string, HistoryRun>();
    for (const r of fromFile) {
      map.set(r.runId, r);
    }
    if (latestPayload?.runId || latestPayload?.generatedAt) {
      const id = String(latestPayload.runId || latestPayload.generatedAt);
      const entry: HistoryRun = {
        runId: id,
        startedAt: latestPayload.startedAt,
        finishedAt: latestPayload.finishedAt || latestPayload.generatedAt,
        textReport: latestPayload.textReport,
        summary: latestPayload.summary,
        payload: latestPayload,
      };
      map.set(id, entry);
    }
    if (map.size === 0) {
      const local = loadLocalFallbackHistory();
      setRuns(local);
      return;
    }
    const merged = [...map.values()].sort((a, b) => String(b.finishedAt || b.runId).localeCompare(String(a.finishedAt || a.runId)));
    setRuns(merged);
    saveLocalFallbackHistory(merged.slice(0, MAX_LOCAL));
  }, []);

  const recheckRunnerHealth = useCallback(async () => {
    setRunnerUp(null);
    const h = await fetchJson<{ ok?: boolean }>(`${RUNNER_PREFIX}/health`);
    setRunnerUp(!!h?.ok);
  }, []);

  const refreshReports = useCallback(async () => {
    setLoadError(null);
    const hist = await fetchJson<{ runs?: HistoryRun[] }>('/qa-reports/runs-history.json');
    const fileRuns = hist?.runs && Array.isArray(hist.runs) ? hist.runs : [];
    const primary = await fetchJson<QaRunPayload>('/qa-reports/latest-run.json');
    if (primary && primary.summary) {
      setLatest({ ...EMPTY, ...primary });
      mergeRuns(fileRuns, primary);
    } else {
      const sample = await fetchJson<QaRunPayload>('/qa-reports/latest-run.sample.json');
      if (sample) {
        setLatest({ ...EMPTY, ...sample });
        mergeRuns(fileRuns, sample);
      } else if (fileRuns.length) {
        setLatest(fileRuns[0].payload);
        mergeRuns(fileRuns, null);
      } else {
        const local = loadLocalFallbackHistory();
        if (local.length) {
          setRuns(local);
          setLatest(local[0].payload);
        } else {
          setLoadError('No latest-run.json yet. Run tests and npm run qa:sync-report, or use Run all tests.');
          setLatest(EMPTY);
          mergeRuns([], null);
        }
      }
    }
  }, [mergeRuns]);

  useEffect(() => {
    refreshReports();
  }, [refreshReports]);

  useEffect(() => {
    if (!isViteDev) {
      setRunnerUp(false);
      return;
    }
    let cancelled = false;
    const ping = async () => {
      const h = await fetchJson<{ ok?: boolean }>(`${RUNNER_PREFIX}/health`);
      if (!cancelled) setRunnerUp(!!h?.ok);
    };
    void ping();
    const onFocus = () => void ping();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!runnerRunning) return;
    const id = window.setInterval(() => setRunElapsedTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [runnerRunning]);

  useEffect(() => {
    if (tab !== 'catalog') return;
    let cancelled = false;
    (async () => {
      setCatalogError(null);
      const text = await fetchText('/qa-docs/TEST-CATALOG.md');
      if (cancelled) return;
      if (text) setCatalogMd(text);
      else {
        setCatalogMd(null);
        setCatalogError('Could not load /qa-docs/TEST-CATALOG.md — run npm run qa:sync-report from the repo root.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const ingestUpload = useCallback(
    (payload: QaRunPayload) => {
      setLatest(payload);
      setLoadError(null);
      const id = String(payload.runId || payload.generatedAt || `upload-${Date.now()}`);
      const entry: HistoryRun = {
        runId: id,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt || payload.generatedAt,
        textReport: payload.textReport,
        summary: payload.summary,
        payload,
      };
      setRuns((prev) => {
        const next = [entry, ...prev.filter((r) => r.runId !== id)].slice(0, MAX_LOCAL);
        saveLocalFallbackHistory(next);
        return next;
      });
    },
    [],
  );

  const onUpload: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as QaRunPayload;
        ingestUpload(payload);
      } catch {
        setLoadError('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const copyCli = () => {
    const cmd =
      'Option A (one terminal): npm run dev:qa\nOption B: Terminal 1: npm run dev  |  Terminal 2: npm run qa:runner\nThen QA hub → Run all tests (or: npm run test:e2e:report)';
    void navigator.clipboard.writeText(cmd);
  };

  const startRunner = async () => {
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    if (runnerPollRef.current) {
      clearInterval(runnerPollRef.current);
      runnerPollRef.current = null;
    }
    setLoadError(null);
    setRunnerStatusMessage(null);
    setRunnerFinishedHint(null);
    runWallStartRef.current = Date.now();
    setRunElapsedTick(0);
    setRunnerRunning(true);
    setRunnerLog([]);
    setRunnerPhase('starting');

    let completionHandled = false;
    const finishPoll = async (st: { phase: string; runId?: string | null; lastExitCodes?: { unit: number | null; e2e: number | null } }) => {
      if (completionHandled) return;
      completionHandled = true;
      if (runnerPollRef.current) {
        clearInterval(runnerPollRef.current);
        runnerPollRef.current = null;
      }
      setRunnerRunning(false);
      setRunnerPhase(st.phase);
      const u = st.lastExitCodes?.unit;
      const e = st.lastExitCodes?.e2e;
      if (st.phase === 'done') {
        setRunnerFinishedHint(
          `Run ${st.runId ? `${st.runId.slice(0, 8)}… ` : ''}finished. Unit exit ${u ?? '—'}, E2E exit ${e ?? '—'}. Scroll down for the latest summary or open the full report.`,
        );
      } else {
        setRunnerFinishedHint(`Run stopped (${st.phase}). Check the log below and terminal output. Unit exit ${u ?? '—'}, E2E exit ${e ?? '—'}.`);
      }
      await refreshReports();
    };

    try {
      const res = await fetch(`${RUNNER_PREFIX}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl }),
      });
      if (!res.ok) {
        const err = (await res.text()).trim();
        const emptyProxy = !err && (res.status === 500 || res.status === 502 || res.status === 504);
        setLoadError(
          emptyProxy
            ? `Dev server could not reach the QA runner on 127.0.0.1:47841 (${res.status}, empty body). Nothing is listening there yet. From the repo root run a second process: npm run qa:runner — or use one terminal: npm run dev:qa (starts backend + frontend + runner together).`
            : `Runner returned ${res.status}: ${err || '(empty body)'}. If the runner is not running, use: npm run qa:runner or npm run dev:qa.`,
        );
        setRunnerRunning(false);
        setRunnerPhase('idle');
        return;
      }
      let expectedRunId: string | undefined;
      try {
        const body = (await res.json()) as { runId?: string };
        if (body?.runId) expectedRunId = String(body.runId);
      } catch {
        /* 202 may have empty body in theory */
      }

      let sawRunning = false;
      const pollOnce = async () => {
        const st = await fetchJson<{
          running: boolean;
          phase: string;
          log: { t: number; line: string }[];
          runId?: string | null;
          lastExitCodes?: { unit: number | null; e2e: number | null };
        }>(`${RUNNER_PREFIX}/status`);
        if (!st) {
          setRunnerStatusMessage('Cannot read runner status (network or proxy). Check: npm run qa:runner');
          return;
        }
        setRunnerStatusMessage(null);
        if (st.running) sawRunning = true;
        setRunnerPhase(st.phase);
        setRunnerLog(st.log || []);

        const idMatch = expectedRunId && st.runId === expectedRunId;
        const finished = !st.running && (st.phase === 'done' || st.phase === 'error');
        if (finished && (idMatch || (!expectedRunId && sawRunning))) {
          await finishPoll(st);
        }
      };

      void pollOnce();
      runnerPollRef.current = setInterval(() => void pollOnce(), 400);
    } catch {
      setLoadError(
        'Network error talking to /__qa-runner. Start the runner: npm run qa:runner — or use npm run dev:qa (backend + frontend + runner). Then click Run all tests again.',
      );
      setRunnerRunning(false);
      setRunnerPhase('idle');
      if (runnerPollRef.current) {
        clearInterval(runnerPollRef.current);
        runnerPollRef.current = null;
      }
    }
  };

  const openRun = (r: HistoryRun) => {
    setSelectedRun(r);
  };

  const detailPayload = selectedRun?.payload;
  const bugs = detailPayload?.bugs?.length ? detailPayload.bugs : detailPayload?.failures || [];
  const detailLayers = detailPayload?.layers || {};

  const runElapsedSec =
    runnerRunning && runWallStartRef.current > 0
      ? Math.max(0, Math.floor((Date.now() - runWallStartRef.current) / 1000))
      : 0;

  if (selectedRun && detailPayload) {
    const runHead = formatRunHeading(selectedRun);
    return (
      <div className="admin-qa" data-testid="admin-qa-dashboard">
        <div className="admin-qa-detail-header">
          <button type="button" className="admin-qa-back" onClick={() => setSelectedRun(null)} data-testid="admin-qa-back">
            <ArrowLeft size={18} />
            All runs
          </button>
          <h1 className="admin-qa-title admin-qa-title-sm">{runHead.title}</h1>
        </div>
        {runHead.idLine && <p className="admin-qa-run-key admin-qa-mono">{runHead.idLine}</p>}
        <p className="admin-qa-meta">
          Started: {formatInstantIst(selectedRun.startedAt) || selectedRun.startedAt || '—'} · Finished:{' '}
          {formatInstantIst(selectedRun.finishedAt) || selectedRun.finishedAt || '—'}
        </p>

        {detailPayload.coverage && <CoveragePanel coverage={detailPayload.coverage} />}

        <div className="admin-qa-grid admin-qa-grid--compact">
          <div className="admin-qa-stat admin-qa-stat--pass">
            <div className="admin-qa-stat-label">Passed</div>
            <div className="admin-qa-stat-value">{detailPayload.summary.passed}</div>
          </div>
          <div className="admin-qa-stat admin-qa-stat--fail">
            <div className="admin-qa-stat-label">Failed</div>
            <div className="admin-qa-stat-value">{detailPayload.summary.failed}</div>
          </div>
          <div className="admin-qa-stat admin-qa-stat--skip">
            <div className="admin-qa-stat-label">Skipped</div>
            <div className="admin-qa-stat-value">{detailPayload.summary.skipped}</div>
          </div>
          <div className="admin-qa-stat">
            <div className="admin-qa-stat-label">Flaky</div>
            <div className="admin-qa-stat-value">{detailPayload.summary.flaky}</div>
          </div>
          <div className="admin-qa-stat">
            <div className="admin-qa-stat-label">Duration Σ ms</div>
            <div className="admin-qa-stat-value">{detailPayload.summary.durationMs}</div>
          </div>
        </div>
        {Object.keys(detailLayers).length > 0 && (
          <>
            <h2 className="admin-qa-section-title">Layer summary</h2>
            <LayerSummaryGrid layers={detailLayers} />
          </>
        )}

        {detailPayload.unit && (detailPayload.unit.allResults?.length ?? 0) > 0 && (
          <>
            <h2 className="admin-qa-section-title">Unit tests (Vitest)</h2>
            <p className="admin-qa-meta">
              Passed {detailPayload.unit.summary.passed} · Failed {detailPayload.unit.summary.failed} · Skipped{' '}
              {detailPayload.unit.summary.skipped} · {detailPayload.unit.allResults?.length || 0} cases — grouped by area below.
            </p>
            <CaseTablesByModule rows={detailPayload.unit.allResults || []} kind="unit" />
          </>
        )}

        {detailPayload.e2e && detailPayload.e2e.allResults && detailPayload.e2e.allResults.length > 0 && (
          <>
            <h2 className="admin-qa-section-title">Browser tests (Playwright)</h2>
            <p className="admin-qa-meta">
              Passed {detailPayload.e2e.summary.passed} · Failed {detailPayload.e2e.summary.failed} · Skipped{' '}
              {detailPayload.e2e.summary.skipped} · Flaky {detailPayload.e2e.summary.flaky} ·{' '}
              {detailPayload.e2e.allResults.length} cases — grouped by feature area below.
            </p>
            <CaseTablesByModule rows={detailPayload.e2e.allResults} kind="e2e" />
          </>
        )}

        {Object.entries(detailLayers)
          .filter(([layerName]) => layerName !== 'unit' && layerName !== 'e2e')
          .map(([layerName, layer]) =>
            layer.allResults && layer.allResults.length > 0 ? (
              <div key={layerName}>
                <h2 className="admin-qa-section-title">{LAYER_LABELS[layerName] || layerName} tests</h2>
                <p className="admin-qa-meta">
                  Passed {layer.summary.passed} · Failed {layer.summary.failed} · Skipped {layer.summary.skipped} ·{' '}
                  {layer.summary.total} cases.
                </p>
                <CaseTablesByModule rows={layer.allResults} kind={layerName} />
              </div>
            ) : null,
          )}

        {detailPayload.skippedTests && detailPayload.skippedTests.length > 0 && (
          <>
            <h2 className="admin-qa-section-title">Skipped browser cases</h2>
            <p className="admin-qa-meta">These did not execute in this run (intentionally skipped or not reached).</p>
            <ul className="admin-qa-skipped-list">
              {detailPayload.skippedTests.map((s, i) => (
                <li key={`sk-${i}`}>
                  <span className="admin-qa-mono">{s.file}</span>
                  {s.module ? <span className="admin-qa-skipped-mod"> · {s.module}</span> : null}
                  <div>{s.plainDescription || s.title}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        {bugs.length > 0 && (
          <>
            <h2 className="admin-qa-section-title">
              Issues & bugs ({bugs.length})
              <CopyBtn text={buildFullBugReport(bugs)} label="Copy all bugs" />
            </h2>
            {bugs.map((b) => (
              <article key={b.id + b.title} className="admin-qa-bug">
                <div className="admin-qa-bug-id">
                  {b.id} · {b.module}
                  <CopyBtn text={[b.id, b.module, b.title, b.file, b.summary, b.detail || ''].join('\n')} label="Copy" />
                </div>
                <div className="admin-qa-bug-title">{b.title}</div>
                {b.plainDescription && <p className="admin-qa-bug-plain">{b.plainDescription}</p>}
                <div className="admin-qa-bug-file">{b.file}</div>
                <div className="admin-qa-bug-summary">{b.summary}</div>
                {b.detail && b.detail !== b.summary && (
                  <div style={{ position: 'relative' }}>
                    <CopyBtn text={b.detail} label="Copy log" />
                    <pre className="admin-qa-text-report-block">{b.detail}</pre>
                  </div>
                )}
              </article>
            ))}
          </>
        )}

        <h2 className="admin-qa-section-title">
          Text report
          <CopyBtn text={detailPayload.textReport || ''} label="Copy report" />
        </h2>
        <pre className="admin-qa-text-report" data-testid="admin-qa-text-report">
          {detailPayload.textReport || 'No text report in this payload.'}
        </pre>
      </div>
    );
  }

  return (
    <div className="admin-qa" data-testid="admin-qa-dashboard">
      <header className="admin-qa-header">
        <h1 className="admin-qa-title">
          <FlaskConical size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
          QA hub
        </h1>
        <p className="admin-qa-sub">
          <strong>Admin only</strong> — the QA hub tab appears only for admin accounts; other roles cannot open this UI.{' '}
          <strong>Local automation</strong> — “Run all tests” talks to a runner on your computer; it does not run tests on a production
          server from the browser. <strong>Report-only</strong> triage: note failures here; fixing code is separate. Master catalog:{' '}
          <code className="admin-qa-code">{latest.catalogPath || 'QA-automation/TEST-CATALOG.md'}</code> (see <em>Test catalog</em> tab).
        </p>
      </header>

      <div className="admin-qa-tabs">
        <button
          type="button"
          className={`admin-qa-tab ${tab === 'overview' ? 'is-active' : ''}`}
          onClick={() => setTab('overview')}
          data-testid="admin-qa-tab-overview"
        >
          <LayoutList size={16} />
          Runs & actions
        </button>
        <button
          type="button"
          className={`admin-qa-tab ${tab === 'catalog' ? 'is-active' : ''}`}
          onClick={() => setTab('catalog')}
          data-testid="admin-qa-tab-catalog"
        >
          <BookOpen size={16} />
          Test catalog
        </button>
      </div>

      {tab === 'catalog' && (
        <div className="admin-qa-catalog-panel" data-testid="admin-qa-catalog-panel">
          {catalogError && <p className="admin-qa-meta" style={{ color: 'var(--red-400)' }}>{catalogError}</p>}
          {catalogMd ? (
            <pre className="admin-qa-catalog-md">{catalogMd}</pre>
          ) : (
            !catalogError && <p className="admin-qa-meta">Loading catalog…</p>
          )}
        </div>
      )}

      {tab === 'overview' && (
        <>
          {isViteDev && !isLocalDevHost() && (
            <div className="admin-qa-callout admin-qa-callout--info" role="note">
              You are on <code className="admin-qa-code">{typeof window !== 'undefined' ? window.location.host : ''}</code> (network URL).
              Run all tests still works: the QA runner and Playwright must run on the <strong>same machine</strong> as{' '}
              <code className="admin-qa-code">npm run dev</code>, using this page&apos;s URL as the app under test.
            </div>
          )}

          {runnerRunning && (
            <div className="admin-qa-live-run" role="status" aria-live="polite" data-testid="admin-qa-live-run">
              <Loader2 size={22} className="admin-qa-spin admin-qa-live-run-icon" aria-hidden />
              <div className="admin-qa-live-run-body">
                <div className="admin-qa-live-run-title">Automation in progress</div>
                <div className="admin-qa-live-run-phase">{PHASE_LABELS[runnerPhase] || runnerPhase}</div>
                <div className="admin-qa-live-run-time">Elapsed {runElapsedSec}s · log lines below update live</div>
              </div>
            </div>
          )}

          {!runnerRunning && runnerFinishedHint && (
            <div
              className="admin-qa-callout admin-qa-callout--success"
              role="status"
              data-testid="admin-qa-run-finished-hint"
            >
              {runnerFinishedHint}
            </div>
          )}

          <div className="admin-qa-actions">
            {isViteDev && (
              <button
                type="button"
                className="admin-qa-btn"
                onClick={startRunner}
                disabled={runnerRunning}
                title={
                  runnerUp === false
                    ? 'Runner offline — click anyway to try, or start: npm run qa:runner'
                    : 'Runs Vitest, then Playwright, then refreshes reports for this hub'
                }
                data-testid="admin-qa-run-all"
              >
                {runnerRunning ? <Loader2 size={16} className="admin-qa-spin" /> : <Play size={16} />}
                Run all tests (unit + E2E)
              </button>
            )}
            <button type="button" className="admin-qa-btn admin-qa-btn--ghost" onClick={refreshReports} data-testid="admin-qa-refresh">
              <RefreshCw size={16} />
              Reload reports
            </button>
            <button type="button" className="admin-qa-btn admin-qa-btn--ghost" onClick={copyCli} data-testid="admin-qa-copy-cli">
              <ClipboardCopy size={16} />
              Copy setup CLI
            </button>
            <label className="admin-qa-btn admin-qa-btn--ghost" data-testid="admin-qa-upload-label">
              <Upload size={16} />
              Upload run JSON
              <input className="admin-qa-upload" type="file" accept="application/json,.json" onChange={onUpload} />
            </label>
          </div>

          {isViteDev && (
            <p className="admin-qa-meta">
              Local runner ({RUNNER_PREFIX}):{' '}
              {runnerUp === null
                ? 'checking…'
                : runnerUp
                  ? 'reachable — npm run qa:runner is responding.'
                  : (
                      <>
                        <strong>not reachable</strong> — start the runner:{' '}
                        <code className="admin-qa-code">npm run qa:runner</code> in another terminal, or use{' '}
                        <code className="admin-qa-code">npm run dev:qa</code> to start backend + frontend + runner in one go. Then
                        &quot;Retry health check&quot; or Run again.
                        {' '}
                        <button type="button" className="admin-qa-linkish admin-qa-linkish-inline" onClick={() => void recheckRunnerHealth()}>
                          Retry health check
                        </button>{' '}
                        (or switch to this tab / refocus the window).
                      </>
                    )}
            </p>
          )}

          {(runnerRunning || runnerStatusMessage || runnerLog.length > 0) && (
            <div className="admin-qa-runner-panel" data-testid="admin-qa-runner-panel">
              {runnerStatusMessage && (
                <p className="admin-qa-runner-warn" data-testid="admin-qa-runner-warn">
                  {runnerStatusMessage}
                </p>
              )}
              <div className="admin-qa-meta">
                Phase: <strong>{runnerPhase}</strong> — {PHASE_LABELS[runnerPhase] || ''}
                {!runnerRunning && runnerLog.length > 0 ? ' (last run log)' : null}
              </div>
              <pre className="admin-qa-runner-log">
                {runnerLog.length === 0 && runnerRunning ? (
                  <span className="admin-qa-runner-placeholder">Waiting for first output from the runner…</span>
                ) : (
                  runnerLog.map((l, i) => (
                    <span key={`${l.t}-${i}`}>
                      {l.line}
                      {'\n'}
                    </span>
                  ))
                )}
              </pre>
            </div>
          )}

          {loadError && (
            <p className="admin-qa-meta" style={{ color: 'var(--red-400)' }}>
              {loadError}
            </p>
          )}
          {latest.note && <p className="admin-qa-meta">{latest.note}</p>}
          {latest.coverage && <CoveragePanel coverage={latest.coverage} compact />}

          <h2 className="admin-qa-section-title">Latest run (summary)</h2>
          <p className="admin-qa-meta">
            {formatInstantIst(latest.finishedAt || latest.generatedAt) ||
              latest.finishedAt ||
              latest.generatedAt ||
              '—'}{' '}
            · {latest.source || '—'}
          </p>
          <div className="admin-qa-grid admin-qa-grid--compact">
            <div className="admin-qa-stat admin-qa-stat--pass">
              <div className="admin-qa-stat-label">Passed</div>
              <div className="admin-qa-stat-value">{latest.summary.passed}</div>
            </div>
            <div className="admin-qa-stat admin-qa-stat--fail">
              <div className="admin-qa-stat-label">Failed</div>
              <div className="admin-qa-stat-value">{latest.summary.failed}</div>
            </div>
            <div className="admin-qa-stat admin-qa-stat--skip">
              <div className="admin-qa-stat-label">Skipped</div>
              <div className="admin-qa-stat-value">{latest.summary.skipped}</div>
            </div>
            <div className="admin-qa-stat">
              <div className="admin-qa-stat-label">Flaky</div>
              <div className="admin-qa-stat-value">{latest.summary.flaky}</div>
            </div>
          </div>
          {latest.layers && Object.keys(latest.layers).length > 0 && <LayerSummaryGrid layers={latest.layers} />}
          {(latest.runId || latest.generatedAt) && (
            <button
              type="button"
              className="admin-qa-linkish"
              onClick={() => {
                const id = String(latest.runId || latest.generatedAt);
                const found = runs.find((r) => r.runId === id);
                if (found) openRun(found);
                else
                  openRun({
                    runId: id,
                    startedAt: latest.startedAt,
                    finishedAt: latest.finishedAt || latest.generatedAt,
                    textReport: latest.textReport,
                    summary: latest.summary,
                    payload: latest,
                  });
              }}
              data-testid="admin-qa-open-latest"
            >
              Open full report for latest run →
            </button>
          )}

          <h2 className="admin-qa-section-title">Automation runs</h2>
          <p className="admin-qa-meta">Click a run for per-case table, categorized issues, and text report.</p>
          <div className="admin-qa-run-cards">
            {runs.length === 0 && <div className="admin-qa-empty">No runs recorded yet.</div>}
            {runs.map((r) => {
              const head = formatRunHeading(r);
              const hasIstFromRunTimes = !!formatInstantIst(r.finishedAt || r.startedAt);
              return (
                <button
                  key={r.runId}
                  type="button"
                  className="admin-qa-run-card"
                  onClick={() => openRun(r)}
                  data-testid={`admin-qa-run-card-${r.runId}`}
                >
                  <div className="admin-qa-run-card-time">{head.title}</div>
                  {head.idLine ? (
                    <div className="admin-qa-run-card-id admin-qa-mono">{head.idLine}</div>
                  ) : !hasIstFromRunTimes ? (
                    <div className="admin-qa-run-card-id admin-qa-mono">{r.runId}</div>
                  ) : null}
                  <div className="admin-qa-run-card-stats">
                    <span className="admin-qa-run-pass">✓ {r.summary.passed}</span>
                    <span className="admin-qa-run-fail">✗ {r.summary.failed}</span>
                    <span className="admin-qa-run-skip">○ {r.summary.skipped}</span>
                    {r.summary.flaky ? <span className="admin-qa-run-flaky">~ {r.summary.flaky}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
