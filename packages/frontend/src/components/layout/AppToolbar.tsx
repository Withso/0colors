// AppToolbar — extracted from App.tsx
// Top bar with view-mode switcher, page selector, theme selector, token table toggle, publish button
import { useStore } from '../../store';
import { usePageThemeOperations } from '../../store/usePageThemeOperations';
import { Tip } from '../Tip';
import {
  Plus, Download, Globe, ChevronDown, Trash2,
  ArrowLeft, Code, Workflow, Crown, Table, SwatchBook,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export interface AppToolbarProps {
  /** Wrapped setViewMode that also pushes URL */
  setViewMode: (mode: 'canvas' | 'code' | 'export') => void;
  /** Map of projectId → published listing metadata */
  publishedProjectsMap: Record<string, unknown>;
  /** Whether current project is a read-only sample */
  isSampleMode: boolean;
}

export function AppToolbar({ setViewMode, publishedProjectsMap, isSampleMode }: AppToolbarProps) {
  // ── Entity state ──
  const projects = useStore(s => s.projects);
  const pages = useStore(s => s.pages);
  const themes = useStore(s => s.themes);
  const activeProjectId = useStore(s => s.activeProjectId);
  const activePageId = useStore(s => s.activePageId);
  const activeThemeId = useStore(s => s.activeThemeId);

  // ── UI state ──
  const viewMode = useStore(s => s.viewMode);
  const editingPageId = useStore(s => s.editingPageId);
  const setEditingPageId = useStore(s => s.setEditingPageId);
  const editingPageName = useStore(s => s.editingPageName);
  const setEditingPageName = useStore(s => s.setEditingPageName);
  const editingThemeId = useStore(s => s.editingThemeId);
  const setEditingThemeId = useStore(s => s.setEditingThemeId);
  const editingThemeName = useStore(s => s.editingThemeName);
  const setEditingThemeName = useStore(s => s.setEditingThemeName);
  const showTokenTable = useStore(s => s.showTokenTable);
  const setShowTokenTable = useStore(s => s.setShowTokenTable);
  const setShowPublishPopup = useStore(s => s.setShowPublishPopup);
  const authSession = useStore(s => s.authSession);

  // ── Page / Theme mutations ──
  const {
    handleCreatePage, handleSwitchPage, handleRenamePage, handleDeletePage,
    handleCreateTheme, handleSwitchTheme, handleRenameTheme, handleDeleteTheme,
  } = usePageThemeOperations();

  return (
    <div className="app-toolbar" data-testid="toolbar-container">
      <>
        {/* Left: View Mode Switcher + Search */}
        <div className="app-toolbar-left">
          {viewMode === 'export' ? (
            <button
              onClick={() => setViewMode('canvas')}
              className="app-toolbar-back-btn"
              data-testid="toolbar-back-from-export"
            >
              <ArrowLeft className="app-icon-3-5" />
              <span>Back</span>
            </button>
          ) : (
            <>
              {/* View Switcher */}
              <div className="app-toolbar-view-switcher">
                <Tip label="Canvas View" side="bottom">
                  <button
                    onClick={() => setViewMode('canvas')}
                    className={`app-toolbar-view-btn ${viewMode === 'canvas'
                        ? 'app-toolbar-view-btn-active'
                        : 'app-toolbar-view-btn-inactive'
                      }`}
                    data-testid="toolbar-view-canvas"
                  >
                    <Workflow className="app-icon-4" />
                  </button>
                </Tip>
                <Tip label="Code Preview" side="bottom">
                  <button
                    onClick={() => setViewMode('code')}
                    className={`app-toolbar-view-btn ${viewMode === 'code'
                        ? 'app-toolbar-view-btn-active'
                        : 'app-toolbar-view-btn-inactive'
                      }`}
                    data-testid="toolbar-view-code"
                  >
                    <Code className="app-icon-4" />
                  </button>
                </Tip>
              </div>

              {/* Export button */}
              <Tip label="Export Tokens" side="bottom">
                <button
                  onClick={() => setViewMode('export')}
                  className="app-toolbar-export-btn"
                  data-testid="toolbar-export-button"
                >
                  <Download className="app-icon-4" />
                </button>
              </Tip>

              {/* Publish to Community button — only for cloud projects */}
              {(() => {
                const activeProj = projects.find(p => p.id === activeProjectId);
                if (!activeProj?.isCloud || activeProj?.isSample || !authSession) return null;
                const isPublished = !!publishedProjectsMap[activeProjectId];
                return (
                  <Tip label={isPublished ? 'Edit Community Listing' : 'Publish to Community'} side="bottom">
                    <button
                      onClick={() => setShowPublishPopup(activeProjectId)}
                      className={`app-toolbar-publish-btn ${isPublished
                          ? 'app-toolbar-publish-btn-active'
                          : 'app-toolbar-publish-btn-inactive'
                        }`}
                      data-testid={`toolbar-publish-button-${activeProjectId}`}
                    >
                      <Globe className="app-icon-4" />
                    </button>
                  </Tip>
                );
              })()}
            </>
          )}
        </div>

        {/* Center: Page Selector */}
        {viewMode !== 'export' && (
          <div className="app-toolbar-center" data-testid="toolbar-page-selector">
            <div className="app-toolbar-selector">
              {/* Text Area - Handles Double Click for Rename */}
              <div
                className="app-toolbar-selector-text"
                onDoubleClick={(e) => {
                  if (isSampleMode) return;
                  e.stopPropagation();
                  const currentPage = pages.find(p => p.id === activePageId);
                  if (currentPage) {
                    setEditingPageId(activePageId);
                    setEditingPageName(currentPage.name);
                  }
                }}
              >
                {editingPageId === activePageId ? (
                  <input
                    value={editingPageName}
                    onChange={(e) => setEditingPageName(e.target.value)}
                    maxLength={32}
                    data-testid="toolbar-page-rename-input"
                    onBlur={() => {
                      if (editingPageName.trim() && editingPageName !== pages.find(p => p.id === activePageId)?.name) {
                        handleRenamePage(activePageId, editingPageName.trim());
                      }
                      setEditingPageId(null);
                      setEditingPageName('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingPageName.trim() && editingPageName !== pages.find(p => p.id === activePageId)?.name) {
                          handleRenamePage(activePageId, editingPageName.trim());
                        }
                        setEditingPageId(null);
                        setEditingPageName('');
                      } else if (e.key === 'Escape') {
                        setEditingPageId(null);
                        setEditingPageName('');
                      }
                    }}
                    className="app-toolbar-rename-input"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="app-toolbar-truncate" data-testid="toolbar-page-current-name">
                    {pages.find(p => p.id === activePageId)?.name || 'Page'}
                  </span>
                )}
              </div>

              {/* Dropdown Trigger - Only Icon */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="app-toolbar-dropdown-trigger" data-testid="toolbar-page-dropdown-trigger">
                    <ChevronDown className="app-icon-3-5 app-icon-opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={8} className="app-toolbar-dropdown-content app-toolbar-dropdown-content-page">
                  <div className="app-toolbar-dropdown-header">
                    Pages
                  </div>
                  {pages
                    .filter(p => p.projectId === activeProjectId)
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map(page => (
                      <DropdownMenuItem
                        key={page.id}
                        onClick={() => {
                          if (editingPageId !== page.id) {
                            handleSwitchPage(page.id);
                          }
                        }}
                        className={`app-toolbar-dropdown-item ${activePageId === page.id
                            ? 'app-toolbar-dropdown-item-active'
                            : 'app-toolbar-dropdown-item-inactive'
                          } group`}
                        data-testid={`toolbar-page-item-${page.id}`}
                      >
                        <div className="app-toolbar-dropdown-item-row">
                          {editingPageId === page.id ? (
                            <input
                              value={editingPageName}
                              onChange={(e) => setEditingPageName(e.target.value)}
                              maxLength={32}
                              onBlur={() => {
                                if (editingPageName.trim() && editingPageName !== page.name) {
                                  handleRenamePage(page.id, editingPageName.trim());
                                }
                                setEditingPageId(null);
                                setEditingPageName('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingPageName.trim() && editingPageName !== page.name) {
                                    handleRenamePage(page.id, editingPageName.trim());
                                  }
                                  setEditingPageId(null);
                                  setEditingPageName('');
                                } else if (e.key === 'Escape') {
                                  setEditingPageId(null);
                                  setEditingPageName('');
                                }
                              }}
                              className="app-toolbar-rename-input-full"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`toolbar-page-rename-input-${page.id}`}
                            />
                          ) : (
                            <span
                              className="app-toolbar-truncate-flex"
                              onDoubleClick={(e) => {
                                if (isSampleMode) return;
                                e.stopPropagation();
                                setEditingPageId(page.id);
                                setEditingPageName(page.name);
                              }}
                            >
                              {page.name}
                            </span>
                          )}
                        </div>

                        {editingPageId !== page.id && (
                          <div className="app-toolbar-dropdown-item-actions">
                            <div className="app-toolbar-dropdown-item-actions-hidden">
                              {!isSampleMode && pages.filter(p => p.projectId === activeProjectId).length > 1 && (
                                <Tip label="Delete Page" side="right">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete page "${page.name}"? All nodes and tokens on this page will be deleted.`)) {
                                        handleDeletePage(page.id);
                                      }
                                    }}
                                    className="app-toolbar-dropdown-delete-btn"
                                    data-testid={`toolbar-page-delete-${page.id}`}
                                  >
                                    <Trash2 className="app-icon-3" />
                                  </div>
                                </Tip>
                              )}
                            </div>
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  {!isSampleMode && (
                    <>
                      <div className="app-toolbar-dropdown-divider" />
                      <DropdownMenuItem
                        onClick={handleCreatePage}
                        className="app-toolbar-dropdown-add"
                        data-testid="toolbar-page-add"
                      >
                        <div className="app-toolbar-dropdown-add-icon">
                          <Plus className="app-icon-3" />
                        </div>
                        <span>Add new page</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {viewMode === 'export' && (
          <div className="app-toolbar-export-label" data-testid="export-toolbar-title">
            <span className="app-toolbar-export-label-text">Multi-Page Token Export</span>
          </div>
        )}

        {/* Right: Theme Selector */}
        {viewMode !== 'export' && (
          <div className="app-toolbar-right" data-testid="toolbar-theme-area">
            {/* Table icon — independent from theme dropdown */}
            <Tip label="Token Overview Table" side="bottom">
              <button
                onClick={() => setShowTokenTable(prev => !prev)}
                className={`app-toolbar-token-table-btn ${showTokenTable ? 'app-toolbar-token-table-btn-active' : 'app-toolbar-token-table-btn-inactive'}`}
                data-testid="toolbar-token-table-toggle"
              >
                <Table className="app-icon-4" />
                <span className="app-toolbar-token-table-label">Token Table</span>
              </button>
            </Tip>
            {/* Dev Mode toggle — moved to bottom toolbar */}
            <div className="app-toolbar-theme-selector" data-testid="toolbar-theme-selector">
              {/* Theme Name Area - Handles Double Click */}
              <div className="app-toolbar-theme-name-area">
                {themes.find(t => t.id === activeThemeId)?.isPrimary ? (
                  <Crown className="app-icon-3-5 app-icon-warning-fill app-icon-shrink" />
                ) : (
                  <SwatchBook className="app-icon-3-5 app-icon-faint app-icon-shrink" />
                )}

                <div
                  className="app-toolbar-theme-name-inner"
                  onDoubleClick={(e) => {
                    if (isSampleMode) return;
                    e.stopPropagation();
                    const currentTheme = themes.find(t => t.id === activeThemeId);
                    if (currentTheme) {
                      setEditingThemeId(activeThemeId);
                      setEditingThemeName(currentTheme.name);
                    }
                  }}
                >
                  {editingThemeId === activeThemeId ? (
                    <input
                      value={editingThemeName}
                      onChange={(e) => setEditingThemeName(e.target.value)}
                      maxLength={32}
                      onBlur={() => {
                        if (editingThemeName.trim() && editingThemeName !== themes.find(t => t.id === activeThemeId)?.name) {
                          handleRenameTheme(activeThemeId, editingThemeName.trim());
                        }
                        setEditingThemeId(null);
                        setEditingThemeName('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingThemeName.trim() && editingThemeName !== themes.find(t => t.id === activeThemeId)?.name) {
                            handleRenameTheme(activeThemeId, editingThemeName.trim());
                          }
                          setEditingThemeId(null);
                          setEditingThemeName('');
                        } else if (e.key === 'Escape') {
                          setEditingThemeId(null);
                          setEditingThemeName('');
                        }
                      }}
                      className="app-toolbar-rename-input"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      data-testid="toolbar-theme-rename-input"
                    />
                  ) : (
                    <span className="app-toolbar-truncate" data-testid="toolbar-theme-current-name">
                      {themes.find(t => t.id === activeThemeId)?.name || 'Theme'}
                    </span>
                  )}
                </div>
              </div>

              {/* Dropdown Trigger - Only Icon */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="app-toolbar-dropdown-trigger" data-testid="toolbar-theme-dropdown-trigger">
                    <ChevronDown className="app-icon-3-5 app-icon-opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="app-toolbar-dropdown-content">
                  <div className="app-toolbar-dropdown-header">
                    Themes
                  </div>
                  {themes
                    .filter(t => t.projectId === activeProjectId)
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map((theme, index) => (
                      <DropdownMenuItem
                        key={theme.id}
                        onClick={() => {
                          if (editingThemeId !== theme.id) {
                            handleSwitchTheme(theme.id);
                          }
                        }}
                        className={`app-toolbar-dropdown-item ${activeThemeId === theme.id
                            ? 'app-toolbar-dropdown-item-active'
                            : 'app-toolbar-dropdown-item-inactive'
                          } group`}
                        data-testid={`toolbar-theme-item-${theme.id}`}
                      >
                        <div className="app-toolbar-dropdown-item-row">
                          {/* Primary Indicator (default theme is always primary — not switchable) */}
                          <div
                            className="app-toolbar-theme-icon"
                            title={theme.isPrimary ? "Primary Theme" : ""}
                          >
                            {theme.isPrimary ? (
                              <Crown className="app-icon-3-5 app-icon-warning app-icon-shrink" />
                            ) : (
                              <SwatchBook className={`app-icon-3-5 app-icon-shrink ${activeThemeId === theme.id ? 'app-icon-grey-500' : 'app-icon-dim'
                                }`} />
                            )}
                          </div>

                          {editingThemeId === theme.id ? (
                            <input
                              value={editingThemeName}
                              onChange={(e) => setEditingThemeName(e.target.value)}
                              maxLength={32}
                              onBlur={() => {
                                if (editingThemeName.trim() && editingThemeName !== theme.name) {
                                  handleRenameTheme(theme.id, editingThemeName.trim());
                                }
                                setEditingThemeId(null);
                                setEditingThemeName('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingThemeName.trim() && editingThemeName !== theme.name) {
                                    handleRenameTheme(theme.id, editingThemeName.trim());
                                  }
                                  setEditingThemeId(null);
                                  setEditingThemeName('');
                                } else if (e.key === 'Escape') {
                                  setEditingThemeId(null);
                                  setEditingThemeName('');
                                }
                              }}
                              className="app-toolbar-rename-input-full"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`toolbar-theme-rename-input-${theme.id}`}
                            />
                          ) : (
                            <span
                              className="app-toolbar-truncate-flex"
                              onDoubleClick={(e) => {
                                if (isSampleMode) return;
                                e.stopPropagation();
                                setEditingThemeId(theme.id);
                                setEditingThemeName(theme.name);
                              }}
                            >
                              {theme.name}
                            </span>
                          )}
                        </div>

                        {editingThemeId !== theme.id && (
                          <div className="app-toolbar-dropdown-item-actions">
                            <div className="app-toolbar-dropdown-item-actions-hidden">
                              {!isSampleMode && themes.filter(t => t.projectId === activeProjectId).length > 1 && !theme.isPrimary && (
                                <Tip label="Delete Theme" side="left">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete theme "${theme.name}"? All theme-specific values will be removed.`)) {
                                        handleDeleteTheme(theme.id);
                                      }
                                    }}
                                    className="app-toolbar-dropdown-delete-btn"
                                    data-testid={`toolbar-theme-delete-${theme.id}`}
                                  >
                                    <Trash2 className="app-icon-3" />
                                  </div>
                                </Tip>
                              )}
                            </div>
                            {index < 9 && (
                              <kbd className="app-toolbar-kbd" style={{ fontFamily: 'inherit' }}>
                                {index + 1}
                              </kbd>
                            )}
                          </div>
                        )}
                        {editingThemeId !== theme.id && index < 9 && (
                          <div className="app-toolbar-dropdown-item-actions">
                            <kbd className="app-toolbar-kbd" style={{ fontFamily: 'inherit' }}>
                              {index + 1}
                            </kbd>
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  {!isSampleMode && (
                    <>
                      <div className="app-toolbar-dropdown-divider" />
                      <DropdownMenuItem
                        onClick={handleCreateTheme}
                        className="app-toolbar-dropdown-add"
                        data-testid="toolbar-theme-add"
                      >
                        <div className="app-toolbar-dropdown-add-icon">
                          <Plus className="app-icon-3" />
                        </div>
                        <span>Add new theme</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </>
    </div>
  );
}
