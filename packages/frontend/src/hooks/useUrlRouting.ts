/**
 * useUrlRouting — extracted from App.tsx
 *
 * Owns all URL ↔ state synchronisation:
 *   • setViewingProjects — wrapper that pushes /projects
 *   • setViewMode — wrapper that pushes /project/:slug/:mode
 *   • URL → state sync useEffect (browser back/forward & direct URL)
 *   • Home redirect useEffect
 *   • Sync URL on project rename useEffect
 */

import { useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useStore } from '../store';
import { slugify, findProjectBySlug } from '../utils/slugify';
import type { SampleTemplate } from '../utils/sample-templates';
import { lockManager } from '../sync/session-lock';

export interface UseUrlRoutingParams {
  /** Ref tracking whether the projects list is showing (from useCloudSyncAuth) */
  viewingProjectsRef: React.MutableRefObject<boolean>;
  /** Ref tracking the current project slug (from useCloudSyncAuth) */
  activeProjectSlugRef: React.MutableRefObject<string>;
  /** Ref tracking the last synced pathname to avoid duplicate work (from useCloudSyncAuth) */
  lastSyncedPathnameRef: React.MutableRefObject<string>;
  /** Current list of sample templates (from useSampleTemplates) */
  sampleTemplates: SampleTemplate[];
  /** Handler to switch sample template by index (from useSampleTemplates) */
  handleSwitchSampleTemplate: (idx: number) => void;
}

export function useUrlRouting({
  viewingProjectsRef,
  activeProjectSlugRef,
  lastSyncedPathnameRef,
  sampleTemplates,
  handleSwitchSampleTemplate,
}: UseUrlRoutingParams) {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Store selectors ──
  const _setViewingProjects = useStore(s => s.setViewingProjects);
  const _setViewMode = useStore(s => s.setViewMode);
  const activeProjectId = useStore(s => s.activeProjectId);
  const setActiveProjectId = useStore(s => s.setActiveProjectId);
  const setActivePageId = useStore(s => s.setActivePageId);
  const setActiveThemeId = useStore(s => s.setActiveThemeId);
  const projects = useStore(s => s.projects);
  const dashboardSection = useStore(s => s.dashboardSection);
  const setDashboardSection = useStore(s => s.setDashboardSection);
  const isCommunityMode = useStore(s => s.isCommunityMode);
  const setIsCommunityMode = useStore(s => s.setIsCommunityMode);
  const communitySlug = useStore(s => s.communitySlug);
  const setCommunitySlug = useStore(s => s.setCommunitySlug);
  const isInitialLoad = useStore(s => s.isInitialLoad);
  const authChecking = useStore(s => s.authChecking);
  const cloudTemplatesLoaded = useStore(s => s.cloudTemplatesLoaded);
  const authSession = useStore(s => s.authSession);
  const activeSampleTemplateId = useStore(s => s.activeSampleTemplateId);

  // ── Wrapped setter: setViewingProjects ──
  const setViewingProjects = useCallback((val: boolean) => {
    _setViewingProjects(val);
    viewingProjectsRef.current = val;
    if (val) {
      navigate('/projects');
    }
    // when val=false, the caller (handleSelectProject) navigates to the project URL
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wrapped setter: setViewMode ──
  const setViewMode = useCallback((mode: 'canvas' | 'code' | 'export') => {
    _setViewMode(mode);
    if (viewingProjectsRef.current) return; // no URL update when on projects page
    const slug = activeProjectSlugRef.current;
    if (mode === 'canvas') navigate(`/project/${slug}`, { replace: true });
    else navigate(`/project/${slug}/${mode}`, { replace: true });
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL → state sync (handles browser back/forward & direct URL access) ──
  useEffect(() => {
    const path = location.pathname;

    // After data loads (isInitialLoad becomes false), re-process the current URL
    // even if it matches lastSyncedPathnameRef. This ensures the active project
    // matches the URL (not the default 'sample-project').
    if (!isInitialLoad && path === lastSyncedPathnameRef.current) {
      const projectMatch = path.match(/^\/project\/([^/]+)/);
      if (projectMatch) {
        const slug = projectMatch[1];
        const project = findProjectBySlug(useStore.getState().projects, slug);
        if (project && project.id !== activeProjectId) {
          lastSyncedPathnameRef.current = ''; // Force re-process
        } else {
          return;
        }
      } else {
        return;
      }
    }

    if (path === lastSyncedPathnameRef.current) return;
    lastSyncedPathnameRef.current = path;

    if (path === '/projects' || path === '/projects/') {
      if (!viewingProjectsRef.current) {
        _setViewingProjects(true);
        viewingProjectsRef.current = true;
        _setViewMode('canvas');
      }
      setDashboardSection('projects');
      return;
    }

    // ── /community — community listing page (now a dashboard section) ──
    if (path === '/community' || path === '/community/') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('community');
      setIsCommunityMode(false);
      setCommunitySlug(null);
      return;
    }

    // ── /settings — AI settings dashboard section ──
    if (path === '/settings') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('ai-settings');
      return;
    }

    // ── /profile — profile dashboard section ──
    if (path === '/profile') {
      _setViewingProjects(true);
      viewingProjectsRef.current = true;
      setDashboardSection('profile');
      return;
    }

    // ── /community/:slug — view a community project (read-only) ──
    const communityMatch = path.match(/^\/community\/([^/]+)$/);
    if (communityMatch) {
      const slug = communityMatch[1];
      _setViewingProjects(false);
      viewingProjectsRef.current = false;
      setIsCommunityMode(true);
      setCommunitySlug(slug);
      _setViewMode('canvas');
      return;
    }

    // If navigating away from community, clear community state
    if (isCommunityMode) { setIsCommunityMode(false); setCommunitySlug(null); }

    // ── /sample-project/:templateSlug — sample mode with specific template ──
    const sampleMatch = path.match(/^\/sample-project(?:\/([^/]+))?$/);
    if (sampleMatch) {
      const templateSlug = sampleMatch[1];
      // Ensure we're in project view (not projects list)
      if (viewingProjectsRef.current) {
        _setViewingProjects(false);
        viewingProjectsRef.current = false;
      }
      // NOTE: Don't call setActiveProjectId separately here!
      // handleSwitchSampleTemplate does it atomically in one setState,
      // preventing the bug where activePageId points to a cloud project's page.
      // Find and activate the matching template by slug (if templates are loaded)
      if (sampleTemplates.length > 0) {
        if (templateSlug) {
          const matchingIdx = sampleTemplates.findIndex(t => slugify(t.name) === templateSlug);
          if (matchingIdx >= 0 && sampleTemplates[matchingIdx].id !== activeSampleTemplateId) {
            handleSwitchSampleTemplate(matchingIdx);
          } else if (matchingIdx < 0) {
            // No matching template found — redirect to first template
            handleSwitchSampleTemplate(0);
          }
        } else {
          // Bare /sample-project — redirect to first template
          const firstTemplate = sampleTemplates[0];
          const firstSlug = slugify(firstTemplate?.name || 'untitled');
          navigate(`/sample-project/${firstSlug}`, { replace: true });
          lastSyncedPathnameRef.current = `/sample-project/${firstSlug}`;
          handleSwitchSampleTemplate(0);
        }
      }
      _setViewMode('canvas');
      // Zoom-to-fit is handled by handleSwitchSampleTemplate setting canvasState directly
      return;
    }

    const match = path.match(/^\/project\/([^/]+)(?:\/([^/]+))?$/);
    if (match) {
      const slug = match[1];
      const view = match[2] as 'code' | 'export' | undefined;

      // /project/ is ONLY for user's own cloud/local projects.
      // Sample projects must use /sample-project/ path.
      // Reject 'sample-project' slug and redirect to projects page.
      if (slug === 'sample-project') {
        console.log('🚫 /project/sample-project is not a valid route — redirecting to /projects');
        navigate('/projects', { replace: true });
        return;
      }

      const project = findProjectBySlug(useStore.getState().projects, slug);
      if (project) {
        // Block sample/template projects from being accessed via /project/ path
        if ((project as any).isSample) {
          console.log(`🚫 /project/${slug} is a sample — redirecting to /projects`);
          navigate('/projects', { replace: true });
          return;
        }
        // Templates are treated as normal projects — no redirect
        if (viewingProjectsRef.current) {
          _setViewingProjects(false);
          viewingProjectsRef.current = false;
        }
        if (project.id !== activeProjectId) {
          setActiveProjectId(project.id);
          const projectPages = useStore.getState().pages.filter(p => p.projectId === project.id).sort((a, b) => a.createdAt - b.createdAt);
          if (projectPages.length > 0) setActivePageId(projectPages[0].id);
          const projectThemes = useStore.getState().themes.filter(t => t.projectId === project.id).sort((a, b) => a.createdAt - b.createdAt);
          const primaryTheme = projectThemes.find(t => t.isPrimary) || projectThemes[0];
          if (primaryTheme) setActiveThemeId(primaryTheme.id);
        }
        // ── Session lock: acquire immediately for cloud projects ──
        if (!(project as any).isSample) {
          lockManager.setActiveProject(project.id, true);
        }
        const newMode = view === 'code' ? 'code' : view === 'export' ? 'export' : 'canvas';
        _setViewMode(newMode);
      } else if (!isInitialLoad) {
        // Project not found AFTER data has loaded — it genuinely doesn't exist.
        console.log(`🚫 /project/${slug} — project not found, redirecting to /projects`);
        navigate('/projects', { replace: true });
      } else {
        // Project not found but data is still loading — allow the effect to
        // re-run after hydration by NOT marking this path as synced.
        lastSyncedPathnameRef.current = '';
      }
      return;
    }
  }, [location.pathname, isInitialLoad, sampleTemplates, activeSampleTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Home redirect logic (runs after localStorage restore + auth check) ──
  useEffect(() => {
    if (isInitialLoad) return;
    // Wait for auth check to complete before deciding where to redirect.
    // Without this gate, the redirect can fire while authSession is still null
    // (auth in progress), causing a flash redirect to /sample-project that
    // then has to be corrected to /projects once auth resolves.
    if (authChecking) return;
    const path = location.pathname;
    if (path !== '/' && path !== '') return;

    if (authSession) {
      navigate('/projects', { replace: true });
    } else {
      // All projects are cloud-backed now. Check if user has any non-sample projects.
      const userProjects = projects.filter(p => !p.isTemplate && !p.isSample);
      if (userProjects.length > 0) {
        navigate('/projects', { replace: true });
      } else {
        // Wait for cloud templates to load before redirecting to sample project
        // to prevent a flash of hardcoded data → then template data shift
        if (!cloudTemplatesLoaded) return; // Will re-run when cloudTemplatesLoaded changes

        // Use the admin-starred template if available, otherwise first template
        const starredId = useStore.getState().starredTemplateId;
        let targetIdx = 0;
        if (starredId) {
          const starredIdx = sampleTemplates.findIndex(t => t.id === starredId);
          if (starredIdx >= 0) targetIdx = starredIdx;
        }
        const targetTemplate = sampleTemplates[targetIdx] || sampleTemplates[0];
        const templateSlug = slugify(targetTemplate?.name || 'starter');
        navigate(`/sample-project/${templateSlug}`, { replace: true });
        lastSyncedPathnameRef.current = `/sample-project/${templateSlug}`;
        const sampleProject = projects.find(p => p.isSample);
        if (sampleProject) {
          setActiveProjectId(sampleProject.id);
        }
        _setViewingProjects(false);
        viewingProjectsRef.current = false;

        // Switch to the target template
        if (targetTemplate) {
          handleSwitchSampleTemplate(targetIdx);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('canvasFitAll'))));
      }
    }
  }, [isInitialLoad, authChecking, authSession, location.pathname, cloudTemplatesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync URL when active project is renamed ──
  useEffect(() => {
    // Don't rewrite URL during initial load — activeProjectId is still the default
    // ('sample-project') and doesn't match the URL slug, which would incorrectly
    // rewrite e.g. /project/project-2 → /project/sample-project.
    if (isInitialLoad) return;
    if (viewingProjectsRef.current) return;
    const project = projects.find(p => p.id === activeProjectId);
    if (!project) return;
    // Don't rewrite URL for sample projects — they use /sample-project/ path
    if ((project as any).isSample) return;
    const newSlug = slugify(project.name);
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'project' && parts[1] && parts[1] !== newSlug) {
      const viewSuffix = parts[2] ? `/${parts[2]}` : '';
      navigate(`/project/${newSlug}${viewSuffix}`, { replace: true });
    }
  }, [projects, activeProjectId, isInitialLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  return { setViewingProjects, setViewMode };
}
