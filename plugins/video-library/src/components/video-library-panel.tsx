'use client';

import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cog,
  Film,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';

import { SessionLogForm } from '@/components/session-log-form';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSummaryStrip,
} from '@/components/plugins/plugin-data-surface';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { PluginLoadingState } from '@/components/plugins/plugin-state';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';
import { VideoLibrarySummary } from './video-library-summary';
import { useVideoLibraryViewState } from './use-video-library-view-state';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { PluginToolbar } from '@/components/plugins/plugin-toolbar';
import {
  PluginActionPrimary,
  PluginActionRow,
} from '@/components/plugins/plugin-action-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { getAuthHeaders } from '@/lib/auth-session';
import { getSessions, updateSession } from '@/lib/storage';
import { DEFAULT_EXPECTED_VIDEO_CATEGORIES } from '@/lib/types';
import type {
  JudoSession,
  SessionCategory,
  VideoLibraryPreferences,
} from '@/lib/types';
import { saveVideoLibraryPreference } from '@/lib/user-preferences';
import type {
  VideoLibraryCheckedFilter,
  VideoLibraryStatusFilter,
  VideoLibraryTab,
} from '@/lib/video-library';
import {
  areVideoLinkCheckMapsEqual,
  getVideoDomainRemovalImpact,
  reconcileVideoLinkChecks,
} from '@/lib/video-library';

import {
  VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL,
  VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL,
  VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL,
  getVideoLibraryReviewAlertDescription,
  getEntryStatusLabel,
  getStatusVariant,
  buildVideoDomainRemovalConfirmationDescription,
  getPresentationLabel,
  getSortLabel,
  getTabLabel,
  SESSION_CATEGORY_OPTIONS,
  type VideoLibraryProps,
  type DomainRemovalDialogState,
  type VideoLibraryPresentationMode,
  type VideoLibrarySortOption,
} from './video-library-view-model';
import { useVideoLibraryController } from './use-video-library-controller';
import { VideoLibraryResults } from './video-library-results';
import {
  addVideoAllowedDomain,
  runVideoLinkCheck,
  saveExpectedVideoCategory,
} from './video-library-actions';
export { runVideoLinkCheck } from './video-library-actions';

export {
  VIDEO_LIBRARY_LOADING_LABEL,
  VIDEO_LIBRARY_MODE_TABLE_LABEL,
  VIDEO_LIBRARY_MODE_LOUNGE_LABEL,
  VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL,
  VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL,
  VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL,
  VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL,
  VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE,
  getVideoLibraryReviewAlertDescription,
  getEntryStatusLabel,
  getStatusVariant,
  sortVideoLibraryRows,
  deriveVideoLibraryBrowseState,
  deriveVideoLibraryEmptyState,
  deriveVideoLibraryBulkActionState,
  buildVideoDomainRemovalConfirmationDescription,
  getFilteredHostnameOptions,
  deriveVideoLibraryControlVisibility,
} from './video-library-view-model';
export function VideoLibrary({ onRefresh }: VideoLibraryProps) {
  const { toast } = useToast();
  const { user, preferences, canSavePreferences, authAvailable } = useAuth();
  const [sessions, setSessions] = useState<JudoSession[]>([]);
  const [editingSession, setEditingSession] = useState<JudoSession | null>(
    null
  );
  const [sessionPendingClear, setSessionPendingClear] =
    useState<JudoSession | null>(null);
  const [domainPendingRemoval, setDomainPendingRemoval] =
    useState<DomainRemovalDialogState | null>(null);
  const [isClearingVideo, setIsClearingVideo] = useState(false);
  const [isRemovingDomain, setIsRemovingDomain] = useState(false);
  const {
    newDomain,
    setNewDomain,
    presentationMode,
    setPresentationMode,
    sortOrder,
    setSortOrder,
    showAdvanced,
    setShowAdvanced,
    playNextEnabled,
    setPlayNextEnabled,
    isSettingsOpen,
    setIsSettingsOpen,
    filters,
    setFilters,
  } = useVideoLibraryViewState();
  const [isSavingDomains, setIsSavingDomains] = useState(false);
  const [isSavingCategoryExpectations, setIsSavingCategoryExpectations] =
    useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [autoCheckedRowIds, setAutoCheckedRowIds] = useState<string[]>([]);
  const autoCheckSignatureRef = useRef<string>('');

  const videoLibraryPreferences = useMemo(
    () =>
      preferences.videoLibrary ??
      ({
        customAllowedDomains: [],
        linkChecksBySessionId: {},
        expectedVideoCategories: [...DEFAULT_EXPECTED_VIDEO_CATEGORIES],
      } satisfies VideoLibraryPreferences),
    [preferences.videoLibrary]
  );
  const customAllowedDomains = useMemo(
    () => videoLibraryPreferences.customAllowedDomains ?? [],
    [videoLibraryPreferences.customAllowedDomains]
  );
  const persistedLinkChecks = useMemo(
    () => videoLibraryPreferences.linkChecksBySessionId ?? {},
    [videoLibraryPreferences.linkChecksBySessionId]
  );

  const expectedVideoCategories = useMemo(
    () =>
      videoLibraryPreferences.expectedVideoCategories?.length
        ? videoLibraryPreferences.expectedVideoCategories
        : [...DEFAULT_EXPECTED_VIDEO_CATEGORIES],
    [videoLibraryPreferences.expectedVideoCategories]
  );

  const refreshInventory = (nextSessions?: JudoSession[]) => {
    setSessions(nextSessions ?? getSessions());
    onRefresh();
  };

  useEffect(() => {
    setSessions(getSessions());

    const handleStorageSync = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessions?: JudoSession[] }>;
      if (Array.isArray(customEvent.detail?.sessions)) {
        setSessions(customEvent.detail.sessions);
      } else {
        setSessions(getSessions());
      }
    };

    window.addEventListener('storageSync', handleStorageSync);
    return () => {
      window.removeEventListener('storageSync', handleStorageSync);
    };
  }, []);

  const reconciledLinkChecks = useMemo(
    () =>
      reconcileVideoLinkChecks({
        sessions,
        customAllowedDomains,
        linkChecksBySessionId: persistedLinkChecks,
      }),
    [sessions, customAllowedDomains, persistedLinkChecks]
  );

  useEffect(() => {
    if (!user || !canSavePreferences) {
      return;
    }

    if (areVideoLinkCheckMapsEqual(persistedLinkChecks, reconciledLinkChecks)) {
      return;
    }

    void saveVideoLibraryPreference(user.uid, {
      ...videoLibraryPreferences,
      customAllowedDomains,
      linkChecksBySessionId: reconciledLinkChecks,
      expectedVideoCategories,
    }).catch((error) => {
      console.error('Failed to reconcile persisted video link checks', error);
    });
  }, [
    user,
    canSavePreferences,
    videoLibraryPreferences,
    customAllowedDomains,
    persistedLinkChecks,
    reconciledLinkChecks,
    expectedVideoCategories,
  ]);

  const {
    rows,
    filteredRows,
    sortedFilteredRows,
    loungeRows,
    tabCounts,
    allowedDomains,
    starterDomains,
    hostnameOptions,
    summaryCounts,
    bulkActionState,
    controlVisibility,
    hasAdvancedFiltersApplied,
    browseState,
  } = useVideoLibraryController({
    sessions,
    customAllowedDomains,
    reconciledLinkChecks,
    expectedVideoCategories,
    filters,
    sortOrder,
    presentationMode,
    showAdvanced,
    isCheckingLinks,
  });

  const handleEditSuccess = () => {
    setEditingSession(null);
    refreshInventory();
  };

  const handleExpectedCategoryToggle = async (category: SessionCategory) => {
    await saveExpectedVideoCategory({
      category,
      user,
      canSavePreferences,
      expectedVideoCategories,
      videoLibraryPreferences,
      customAllowedDomains,
      reconciledLinkChecks,
      toast,
      setSaving: setIsSavingCategoryExpectations,
      savePreference: saveVideoLibraryPreference,
    });
  };

  const handleAddDomain = async () => {
    await addVideoAllowedDomain({
      newDomain,
      user,
      canSavePreferences,
      allowedDomains,
      customAllowedDomains,
      videoLibraryPreferences,
      reconciledLinkChecks,
      expectedVideoCategories,
      toast,
      setNewDomain,
      setSaving: setIsSavingDomains,
      savePreference: saveVideoLibraryPreference,
    });
  };

  const handlePromptRemoveDomain = (domain: string) => {
    const impact = getVideoDomainRemovalImpact({
      domain,
      sessions,
      customAllowedDomains,
    });
    setDomainPendingRemoval({ domain, impact });
  };

  const handleConfirmRemoveDomain = async () => {
    if (!user || !canSavePreferences || !domainPendingRemoval) {
      return;
    }

    setIsRemovingDomain(true);
    try {
      await saveVideoLibraryPreference(user.uid, {
        ...videoLibraryPreferences,
        customAllowedDomains: customAllowedDomains.filter(
          (existing) => existing !== domainPendingRemoval.domain
        ),
        linkChecksBySessionId: reconciledLinkChecks,
        expectedVideoCategories,
      });
      toast({
        title: 'Allowed domains updated',
        description: `${domainPendingRemoval.domain} was removed from your custom domain allowlist.`,
      });
      setDomainPendingRemoval(null);
    } catch (error) {
      console.error('Failed to remove video library domain', error);
      toast({
        variant: 'destructive',
        title: 'Could not remove domain',
        description: 'The allowlist could not be updated. Please try again.',
      });
    } finally {
      setIsRemovingDomain(false);
    }
  };

  const handleCheckLinks = useCallback(
    async (sessionIds: string[], options?: { silent?: boolean }) => {
      setIsCheckingLinks(true);
      try {
        await runVideoLinkCheck({
          authAvailable,
          user,
          sessionIds,
          sessions,
          customAllowedDomains,
          reconciledLinkChecks,
          videoLibraryPreferences,
          expectedVideoCategories,
          toast,
          getAuthHeaders,
          savePreference: saveVideoLibraryPreference,
          fetchImpl: fetch,
          silent: options?.silent,
        });
      } catch (error) {
        // The helper owns user-facing errors; this guard keeps the hook's
        // pending-state lifecycle intact if an injected dependency throws.
        console.error('Video link check lifecycle failed', error);
      } finally {
        setIsCheckingLinks(false);
      }
    },
    [
      authAvailable,
      user,
      sessions,
      customAllowedDomains,
      reconciledLinkChecks,
      videoLibraryPreferences,
      expectedVideoCategories,
      toast,
    ]
  );

  const handleCheckFiltered = async () => {
    await handleCheckLinks(
      filteredRows.filter((row) => row.isCheckable).map((row) => row.session.id)
    );
  };

  useEffect(() => {
    if (!authAvailable || !user || isCheckingLinks) {
      return;
    }

    const maxAutoChecks = 6;
    const candidateIds = sortedFilteredRows
      .filter((row) => row.isCheckable && !row.isChecked)
      .slice(0, maxAutoChecks)
      .map((row) => row.session.id)
      .filter((sessionId) => !autoCheckedRowIds.includes(sessionId));

    if (candidateIds.length === 0) {
      return;
    }

    const signature = candidateIds.join('|');
    if (autoCheckSignatureRef.current === signature) {
      return;
    }
    autoCheckSignatureRef.current = signature;
    setAutoCheckedRowIds((current) =>
      Array.from(new Set([...current, ...candidateIds]))
    );

    void handleCheckLinks(candidateIds, { silent: true });
  }, [
    authAvailable,
    user,
    isCheckingLinks,
    sortedFilteredRows,
    autoCheckedRowIds,
    handleCheckLinks,
  ]);

  const handleClearVideo = async () => {
    if (!sessionPendingClear) {
      return;
    }

    setIsClearingVideo(true);
    try {
      await updateSession({
        ...sessionPendingClear,
        videoUrl: undefined,
      });

      if (user && canSavePreferences) {
        const nextLinkChecks = { ...reconciledLinkChecks };
        delete nextLinkChecks[sessionPendingClear.id];
        await saveVideoLibraryPreference(user.uid, {
          ...videoLibraryPreferences,
          customAllowedDomains,
          linkChecksBySessionId: nextLinkChecks,
        });
      }

      toast({
        title: 'Video removed',
        description: `Removed the video link from ${sessionPendingClear.date}.`,
      });
      setSessionPendingClear(null);
      refreshInventory();
    } catch (error) {
      console.error('Failed to clear session video URL', error);
      toast({
        variant: 'destructive',
        title: 'Could not remove video',
        description: 'The session video URL was not removed. Please try again.',
      });
    } finally {
      setIsClearingVideo(false);
    }
  };

  const handleEmptyStateAction = () => {
    if (browseState.action === 'clearSearch') {
      setFilters((current) => ({ ...current, search: '' }));
      return;
    }

    if (browseState.action === 'switchToAll') {
      setFilters((current) => ({ ...current, tab: 'all' }));
      return;
    }

    if (browseState.action === 'resetAdvancedFilters') {
      setFilters((current) => ({
        ...current,
        status: 'all',
        category: 'all',
        hostname: '',
        checked: 'all',
      }));
      setPresentationMode('lounge');
      setSortOrder('newest');
      setShowAdvanced(true);
      return;
    }

    const firstMissing = rows.find((row) => row.entry.status === 'missing');
    if (firstMissing) {
      setEditingSession(firstMissing.session);
    }
  };

  return React.createElement(VideoLibraryView, {
    props: {
      summaryCounts: summaryCounts,
      filters: filters,
      setFilters: setFilters,
      getTabLabel: getTabLabel,
      tabCounts: tabCounts,
      getEntryStatusLabel: getEntryStatusLabel,
      getStatusVariant: getStatusVariant,
      controlVisibility: controlVisibility,
      showAdvanced: showAdvanced,
      presentationMode: presentationMode,
      setPresentationMode: setPresentationMode,
      sortOrder: sortOrder,
      setSortOrder: setSortOrder,
      playNextEnabled: playNextEnabled,
      setPlayNextEnabled: setPlayNextEnabled,
      bulkActionState: bulkActionState,
      handleCheckFiltered: handleCheckFiltered,
      isCheckingLinks: isCheckingLinks,
      sortedFilteredRows: sortedFilteredRows,
      rows: rows,
      loungeRows: loungeRows,
      browseState: browseState,
      handleEmptyStateAction: handleEmptyStateAction,
      editingSession: editingSession,
      setEditingSession: setEditingSession,
      handleEditSuccess: handleEditSuccess,
      isSettingsOpen: isSettingsOpen,
      setIsSettingsOpen: setIsSettingsOpen,
      expectedVideoCategories: expectedVideoCategories,
      canSavePreferences: canSavePreferences,
      isSavingCategoryExpectations: isSavingCategoryExpectations,
      handleExpectedCategoryToggle: handleExpectedCategoryToggle,
      starterDomains: starterDomains,
      customAllowedDomains: customAllowedDomains,
      newDomain: newDomain,
      setNewDomain: setNewDomain,
      isSavingDomains: isSavingDomains,
      handleAddDomain: handleAddDomain,
      handlePromptRemoveDomain: handlePromptRemoveDomain,
      isRemovingDomain: isRemovingDomain,
      domainPendingRemoval: domainPendingRemoval,
      buildVideoDomainRemovalConfirmationDescription:
        buildVideoDomainRemovalConfirmationDescription,
      handleConfirmRemoveDomain: handleConfirmRemoveDomain,
      sessionPendingClear: sessionPendingClear,
      isClearingVideo: isClearingVideo,
      handleClearVideo: handleClearVideo,
      setShowAdvanced: setShowAdvanced,
      hasAdvancedFiltersApplied: hasAdvancedFiltersApplied,
      hostnameOptions: hostnameOptions,
      filteredRows: filteredRows,
      handleCheckLinks: handleCheckLinks,
      setSessionPendingClear: setSessionPendingClear,
      setDomainPendingRemoval: setDomainPendingRemoval,
    },
  });
}

function VideoLibraryView({
  props,
}: {
  props: Record<string, any>;
}): React.ReactElement {
  const {
    summaryCounts,
    filters,
    setFilters,
    getTabLabel,
    tabCounts,
    getEntryStatusLabel,
    getStatusVariant,
    controlVisibility,
    showAdvanced,
    presentationMode,
    setPresentationMode,
    sortOrder,
    setSortOrder,
    playNextEnabled,
    setPlayNextEnabled,
    bulkActionState,
    handleCheckFiltered,
    isCheckingLinks,
    sortedFilteredRows,
    rows,
    loungeRows,
    browseState,
    handleEmptyStateAction,
    editingSession,
    setEditingSession,
    handleEditSuccess,
    isSettingsOpen,
    setIsSettingsOpen,
    expectedVideoCategories,
    canSavePreferences,
    isSavingCategoryExpectations,
    handleExpectedCategoryToggle,
    starterDomains,
    customAllowedDomains,
    newDomain,
    setNewDomain,
    isSavingDomains,
    handleAddDomain,
    handlePromptRemoveDomain,
    isRemovingDomain,
    domainPendingRemoval,
    buildVideoDomainRemovalConfirmationDescription,
    handleConfirmRemoveDomain,
    sessionPendingClear,
    isClearingVideo,
    handleClearVideo,
    setShowAdvanced,
    hasAdvancedFiltersApplied,
    hostnameOptions,
    filteredRows,
    handleCheckLinks,
    setSessionPendingClear,
    setDomainPendingRemoval,
  } = props;

  return (
    <PluginPageShell
      title="Video Library"
      description="Browse, check, and enjoy your linked session videos. Videos are optional for every session."
      tone="info"
      icon={<Film className="h-6 w-6" />}
    >
      <VideoLibrarySummary {...summaryCounts} />

      {controlVisibility.showSettingsEntryPoint ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Cog className="mr-2 h-4 w-4" />
            {VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL}
          </Button>
        </div>
      ) : null}

      {isCheckingLinks ? (
        <PluginLoadingState
          title="Checking video links"
          description="Running live checks for the current selection and updating verification results."
          className="mb-4"
        />
      ) : null}

      <PluginSectionCard
        title="Inventory & filters"
        description="Use core browsing controls first, then open Advanced filters for detailed review."
        contentClassName="space-y-4"
      >
        <div className="space-y-2">
          <Label>Browse tabs</Label>
          <div className="flex flex-wrap gap-2">
            {(['watchable', 'attention', 'all'] as VideoLibraryTab[]).map(
              (tab) => (
                <Button
                  key={tab}
                  type="button"
                  variant={filters.tab === tab ? 'default' : 'outline'}
                  onClick={() =>
                    setFilters((current: any) => ({ ...current, tab }))
                  }
                >
                  {getTabLabel(tab)}
                  <Badge
                    variant="outline"
                    className="ml-1 border-current/30 bg-transparent"
                  >
                    {tabCounts[tab]}
                  </Badge>
                </Button>
              )
            )}
          </div>
        </div>

        <PluginDataSurfaceFilterRow>
          <div className="lg:col-span-3 space-y-2">
            <Label htmlFor="video-library-search">Search</Label>
            <div className="relative">
              <Search
                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${getPluginUiTokenClassNames('icon.subtle')}`}
              />
              <Input
                id="video-library-search"
                value={filters.search}
                onChange={(event) =>
                  setFilters((current: any) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                className="pl-9"
                placeholder="Search date, host, or techniques"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sort</Label>
            <Select
              value={sortOrder === 'oldest' ? 'oldest' : 'newest'}
              onValueChange={(value) =>
                setSortOrder(
                  value as Extract<VideoLibrarySortOption, 'newest' | 'oldest'>
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sort rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PluginDataSurfaceFilterRow>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdvanced((current: any) => !current)}
            aria-expanded={showAdvanced}
            aria-controls="video-library-advanced-filters"
          >
            Advanced filters
          </Button>
          {hasAdvancedFiltersApplied ? (
            <Badge variant="secondary">Advanced filters active</Badge>
          ) : null}
        </div>

        {controlVisibility.showAdvancedPanel ? (
          <div
            id="video-library-advanced-filters"
            className="space-y-3 rounded-md border p-3"
          >
            <p
              className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
            >
              Power-user glossary: <strong>Verification</strong> means whether a
              link has been checked. <strong>Provider not yet trusted</strong>{' '}
              means the video host is outside your trusted domain list.
            </p>
            <PluginDataSurfaceFilterRow>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters((current: any) => ({
                      ...current,
                      status: value as VideoLibraryStatusFilter,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        'all',
                        'missing',
                        'allowed_unchecked',
                        'disallowed_domain',
                        'invalid_url',
                        'reachable',
                        'broken',
                        'check_failed',
                      ] as VideoLibraryStatusFilter[]
                    ).map((status) => (
                      <SelectItem key={status} value={status}>
                        {getEntryStatusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={filters.category}
                  onValueChange={(value) =>
                    setFilters((current: any) => ({
                      ...current,
                      category: value as SessionCategory | 'all',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Randori">Randori</SelectItem>
                    <SelectItem value="Shiai">Shiai</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Verification</Label>
                <Select
                  value={filters.checked}
                  onValueChange={(value) =>
                    setFilters((current: any) => ({
                      ...current,
                      checked: value as VideoLibraryCheckedFilter,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All rows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rows</SelectItem>
                    <SelectItem value="checked">Checked only</SelectItem>
                    <SelectItem value="unchecked">Unchecked only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Hostname filter</Label>
                <Select
                  value={filters.hostname || 'all'}
                  onValueChange={(value) =>
                    setFilters((current: any) => ({
                      ...current,
                      hostname: value === 'all' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All hosts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All hosts</SelectItem>
                    {hostnameOptions.map((hostname: any) => (
                      <SelectItem key={hostname} value={hostname}>
                        {hostname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PluginDataSurfaceFilterRow>

            <PluginToolbar className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
              <div className="space-y-2">
                <Label>Mode</Label>
                <div
                  className="inline-flex rounded-md border p-1"
                  role="group"
                  aria-label="Presentation mode"
                >
                  {(['lounge', 'table'] as VideoLibraryPresentationMode[]).map(
                    (mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={
                          presentationMode === mode ? 'default' : 'ghost'
                        }
                        aria-pressed={presentationMode === mode}
                        onClick={() => setPresentationMode(mode)}
                      >
                        {getPresentationLabel(mode)}
                      </Button>
                    )
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Advanced sort</Label>
                <Select
                  value={sortOrder}
                  onValueChange={(value) =>
                    setSortOrder(value as VideoLibrarySortOption)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sort rows" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        'newest',
                        'oldest',
                        'recently_checked',
                        'provider',
                      ] as VideoLibrarySortOption[]
                    ).map((sort) => (
                      <SelectItem key={sort} value={sort}>
                        {getSortLabel(sort)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {presentationMode === 'lounge' ? (
                <div className="space-y-2">
                  <Label htmlFor="video-library-play-next">Play next</Label>
                  <div className="flex min-h-10 items-center">
                    <Switch
                      id="video-library-play-next"
                      checked={playNextEnabled}
                      onCheckedChange={setPlayNextEnabled}
                      aria-label="Enable play next suggestions"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-end lg:col-span-2">
                <PluginBulkActions
                  selectedCount={
                    filteredRows.filter((row: any) => row.isCheckable).length
                  }
                  itemLabel="checkable link"
                  isDisabled={!bulkActionState.canRefreshLinkHealth}
                  disabledMessage={bulkActionState.disabledMessage ?? undefined}
                >
                  <PluginActionRow>
                    <PluginActionPrimary>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleCheckFiltered()}
                        disabled={!bulkActionState.canRefreshLinkHealth}
                      >
                        {isCheckingLinks ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="mr-2 h-4 w-4" />
                        )}
                        {bulkActionState.refreshLinkHealthLabel}
                      </Button>
                    </PluginActionPrimary>
                  </PluginActionRow>
                </PluginBulkActions>
              </div>
            </PluginToolbar>
          </div>
        ) : null}
      </PluginSectionCard>

      <PluginDataSurfaceSummaryStrip
        filteredCount={sortedFilteredRows.length}
        totalCount={rows.length}
        itemLabel="sessions"
        activeFilters={[
          ...(filters.search.trim()
            ? [{ label: 'Search', value: filters.search.trim() }]
            : []),
          ...(filters.status !== 'all'
            ? [{ label: 'Status', value: getEntryStatusLabel(filters.status) }]
            : []),
          ...(filters.category !== 'all'
            ? [{ label: 'Category', value: filters.category }]
            : []),
          ...(filters.hostname
            ? [{ label: 'Host', value: filters.hostname }]
            : []),
          ...(filters.checked !== 'all'
            ? [{ label: 'Checked', value: filters.checked }]
            : []),
          { label: 'Mode', value: getPresentationLabel(presentationMode) },
          { label: 'Sort', value: getSortLabel(sortOrder) },
        ]}
      />

      {summaryCounts.review > 0 ? (
        <PluginInlineMessage
          tone="error"
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Video link attention items"
          description={getVideoLibraryReviewAlertDescription(
            summaryCounts.review
          )}
        />
      ) : null}

      <VideoLibraryResults
        presentationMode={presentationMode}
        playNextEnabled={playNextEnabled}
        showAdvanced={showAdvanced}
        isCheckingLinks={isCheckingLinks}
        sortedFilteredRows={sortedFilteredRows}
        loungeRows={loungeRows}
        browseState={browseState}
        getStatusVariant={getStatusVariant}
        getEntryStatusLabel={getEntryStatusLabel}
        onEmptyCta={handleEmptyStateAction}
        onCheckLinks={(ids) => void handleCheckLinks(ids)}
        onEdit={(row) => setEditingSession(row.session)}
        onRemove={(row) => setSessionPendingClear(row.session)}
      />

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Library settings</DialogTitle>
            <DialogDescription>
              Manage expected video categories and trusted domains.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PluginSectionCard
              title="Video expectations"
              description="Videos are optional. Choose which categories should appear in the No video tab."
              contentClassName="space-y-3"
            >
              <p
                className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                Turn categories on when you expect videos there. Turn them off
                to keep missing-video counts focused on your priorities.
              </p>
              <div className="space-y-2">
                {SESSION_CATEGORY_OPTIONS.map((category) => (
                  <label
                    key={category}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm font-medium">{category}</span>
                    <Switch
                      checked={expectedVideoCategories.includes(category)}
                      onCheckedChange={() =>
                        void handleExpectedCategoryToggle(category)
                      }
                      disabled={
                        !canSavePreferences || isSavingCategoryExpectations
                      }
                      aria-label={`Expect videos for ${category}`}
                    />
                  </label>
                ))}
              </div>
              {!canSavePreferences ? (
                <p
                  className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                >
                  Sign in to save category expectations.
                </p>
              ) : null}
            </PluginSectionCard>

            <PluginSectionCard
              title="Built-in domains"
              description="Providers included in the default allowlist."
              contentClassName="flex flex-wrap gap-2"
            >
              {starterDomains.map((domain: any) => (
                <Badge key={domain} variant="outline">
                  {domain}
                </Badge>
              ))}
            </PluginSectionCard>

            <PluginSectionCard
              title="Custom domains"
              description="Add trusted hosts for club videos or coaching portals."
              contentClassName="space-y-4"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="video-library-domain">
                    Custom allowed domain
                  </Label>
                  <Input
                    id="video-library-domain"
                    value={newDomain}
                    onChange={(event) => setNewDomain(event.target.value)}
                    placeholder="coachportal.example.com"
                    disabled={!canSavePreferences || isSavingDomains}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={() => void handleAddDomain()}
                    disabled={!canSavePreferences || isSavingDomains}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add domain
                  </Button>
                </div>
              </div>
              {!canSavePreferences ? (
                <p
                  className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                >
                  Sign in to save custom video domains.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {customAllowedDomains.length === 0 ? (
                  <p
                    className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    No custom domains saved yet.
                  </p>
                ) : (
                  customAllowedDomains.map((domain: any) => (
                    <Badge key={domain} variant="outline" className="gap-2">
                      {domain}
                      <button
                        type="button"
                        className={getPluginUiTokenClassNames('action.subtle')}
                        onClick={() => handlePromptRemoveDomain(domain)}
                        disabled={isSavingDomains || isRemovingDomain}
                        aria-label={`Remove ${domain}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </PluginSectionCard>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingSession}
        onOpenChange={(open) => !open && setEditingSession(null)}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Session Video</DialogTitle>
            <DialogDescription>
              Update the session and add or fix its video link.
            </DialogDescription>
          </DialogHeader>
          {editingSession ? (
            <SessionLogForm
              sessionToEdit={editingSession}
              onSuccess={handleEditSuccess}
              onCancel={() => setEditingSession(null)}
              showAvatar={false}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <PluginDestructiveAction
        open={!!sessionPendingClear}
        onOpenChange={(open) => {
          if (!open && !isClearingVideo) {
            setSessionPendingClear(null);
          }
        }}
        title="Remove session video?"
        description="This clears the stored `videoUrl` for the selected session."
        confirmLabel="Remove video"
        pendingLabel="Removing..."
        cancelLabel="Cancel"
        onCancel={() => setSessionPendingClear(null)}
        onConfirm={() => void handleClearVideo()}
        isPending={isClearingVideo}
      />

      <PluginDestructiveAction
        open={!!domainPendingRemoval}
        onOpenChange={(open) => {
          if (!open && !isRemovingDomain) {
            setDomainPendingRemoval(null);
          }
        }}
        title="Remove custom domain?"
        description={
          domainPendingRemoval
            ? buildVideoDomainRemovalConfirmationDescription(
                domainPendingRemoval.impact
              )
            : ''
        }
        confirmLabel={VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL}
        pendingLabel="Removing..."
        cancelLabel={VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL}
        onCancel={() => setDomainPendingRemoval(null)}
        onConfirm={() => void handleConfirmRemoveDomain()}
        isPending={isRemovingDomain}
      />
    </PluginPageShell>
  );
}
