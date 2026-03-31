'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Cog,
  ExternalLink,
  Film,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

import { SessionLogForm } from '@/components/session-log-form';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { PluginTableSection } from '@/components/plugins/plugin-kit';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSummaryStrip,
} from '@/components/plugins/plugin-data-surface';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { PluginLoadingState } from '@/components/plugins/plugin-state';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  VideoDomainRemovalImpact,
  VideoLibraryCheckedFilter,
  VideoLibraryFilters,
  VideoLibraryRow,
  VideoLibraryStatusFilter,
  VideoLibraryTab,
} from '@/lib/video-library';
import {
  areVideoLinkCheckMapsEqual,
  deriveVideoLibraryRows,
  filterVideoLibraryRows,
  getAllowedVideoDomains,
  getVideoDomainRemovalImpact,
  getVideoLibraryTabCounts,
  mergeVideoLinkCheckResults,
  normalizeVideoDomainInput,
  reconcileVideoLinkChecks,
} from '@/lib/video-library';

interface VideoLibraryProps {
  onRefresh: () => void;
}

type DomainRemovalDialogState = {
  domain: string;
  impact: VideoDomainRemovalImpact;
};

type EmptyStateDescriptor = {
  title: string;
  description: string;
  ctaLabel: string;
  action:
    | 'clearSearch'
    | 'switchToAll'
    | 'resetAdvancedFilters'
    | 'editSession';
};

type VideoLibraryPresentationMode = 'table' | 'lounge';
type VideoLibrarySortOption =
  | 'newest'
  | 'oldest'
  | 'recently_checked'
  | 'provider';

const SESSION_CATEGORY_OPTIONS: SessionCategory[] = [
  'Technical',
  'Randori',
  'Shiai',
];

export const VIDEO_LIBRARY_LOADING_LABEL = 'Checking...';
export const VIDEO_LIBRARY_MODE_TABLE_LABEL = 'Table';
export const VIDEO_LIBRARY_MODE_LOUNGE_LABEL = 'Lounge';
export const VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL = 'View all sessions';
export const VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL = 'Reset Advanced filters';
export const VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL =
  'Log sessions as usual; add videos when useful';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL = 'Remove domain';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL = 'Cancel';
export const VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL = 'Library settings';
export const VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE = 'No linked videos in this view';
export const VIDEO_LIBRARY_LOUNGE_EMPTY_DESCRIPTION =
  'This filtered set has sessions, but none currently have a playable URL.';

export function getVideoLibraryReviewAlertDescription(reviewCount: number) {
  return `${reviewCount} session(s) need attention because the provider is not yet trusted, the URL is invalid, or the link could not be verified.`;
}

const VIDEO_LIBRARY_STATUS_LABELS: Record<VideoLibraryStatusFilter, string> = {
  all: 'All statuses',
  missing: 'No linked video',
  allowed_unchecked: 'Allowed',
  disallowed_domain: 'Provider not yet trusted',
  invalid_url: 'Invalid URL',
  reachable: 'Reachable',
  broken: 'Broken',
  check_failed: "Couldn't verify link",
};

function getEntryStatusLabel(status: VideoLibraryStatusFilter) {
  return VIDEO_LIBRARY_STATUS_LABELS[status];
}

function getStatusVariant(status: VideoLibraryStatusFilter) {
  switch (status) {
    case 'broken':
    case 'invalid_url':
    case 'disallowed_domain':
      return 'destructive';
    case 'reachable':
      return 'secondary';
    case 'allowed_unchecked':
    case 'check_failed':
    case 'all':
      return 'outline';
    default:
      return 'outline';
  }
}

function getPresentationLabel(mode: VideoLibraryPresentationMode) {
  return mode === 'table'
    ? VIDEO_LIBRARY_MODE_TABLE_LABEL
    : VIDEO_LIBRARY_MODE_LOUNGE_LABEL;
}

function getSortLabel(sort: VideoLibrarySortOption) {
  switch (sort) {
    case 'newest':
      return 'Newest';
    case 'oldest':
      return 'Oldest';
    case 'recently_checked':
      return 'Recently checked';
    case 'provider':
      return 'Provider';
  }
}

function toTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortVideoLibraryRows(
  rows: VideoLibraryRow[],
  sort: VideoLibrarySortOption
): VideoLibraryRow[] {
  return [...rows].sort((left, right) => {
    const leftDate = toTimestamp(left.session.date);
    const rightDate = toTimestamp(right.session.date);
    const leftCheckedAt = toTimestamp(left.latestCheck?.checkedAt);
    const rightCheckedAt = toTimestamp(right.latestCheck?.checkedAt);
    const leftHost = (
      left.entry.hostname ??
      left.latestCheck?.hostname ??
      ''
    ).trim();
    const rightHost = (
      right.entry.hostname ??
      right.latestCheck?.hostname ??
      ''
    ).trim();

    switch (sort) {
      case 'newest':
        return (
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'oldest':
        return (
          leftDate - rightDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'recently_checked':
        return (
          rightCheckedAt - leftCheckedAt ||
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'provider':
        return (
          leftHost.localeCompare(rightHost) ||
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
    }
  });
}

export function deriveVideoLibraryBrowseState({
  mode,
  filteredRowCount,
  loungeRowCount,
  emptyState,
}: {
  mode: VideoLibraryPresentationMode;
  filteredRowCount: number;
  loungeRowCount: number;
  emptyState: EmptyStateDescriptor;
}): Pick<
  EmptyStateDescriptor,
  'title' | 'description' | 'ctaLabel' | 'action'
> & {
  hasRows: boolean;
} {
  if (mode === 'lounge') {
    if (loungeRowCount > 0) {
      return { ...emptyState, hasRows: true };
    }

    if (filteredRowCount > 0) {
      return {
        title: VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE,
        description: VIDEO_LIBRARY_LOUNGE_EMPTY_DESCRIPTION,
        ctaLabel: emptyState.ctaLabel,
        action: emptyState.action,
        hasRows: false,
      };
    }
  }

  return {
    ...emptyState,
    hasRows: filteredRowCount > 0,
  };
}

export function deriveVideoLibraryEmptyState({
  tab,
  search,
  hasAdvancedFiltersApplied,
}: {
  tab: VideoLibraryTab;
  search: string;
  hasAdvancedFiltersApplied: boolean;
}): EmptyStateDescriptor {
  if (search.trim()) {
    return {
      title: 'No matching video sessions',
      description:
        'No rows match your current search and filters. Clear the search to widen the view.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
      action: 'clearSearch',
    };
  }

  if (hasAdvancedFiltersApplied) {
    return {
      title: 'No sessions match these advanced filters',
      description:
        'No rows match the current Advanced filters. Open Advanced filters to adjust or reset them.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL,
      action: 'resetAdvancedFilters',
    };
  }

  if (tab !== 'all') {
    return {
      title: 'Nothing to review here',
      description:
        'This tab is currently empty. Switch to the full inventory to inspect all sessions.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL,
      action: 'switchToAll',
    };
  }

  return {
    title: 'No sessions yet',
    description:
      'Your session list will appear here. Add video links whenever they are useful.',
    ctaLabel: VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL,
    action: 'editSession',
  };
}

export function deriveVideoLibraryBulkActionState({
  filteredRows,
  isCheckingLinks,
}: {
  filteredRows: VideoLibraryRow[];
  isCheckingLinks: boolean;
}) {
  const checkableRows = filteredRows.filter((row) => row.isCheckable);

  return {
    canRefreshLinkHealth: !isCheckingLinks && checkableRows.length > 0,
    disabledMessage:
      isCheckingLinks || checkableRows.length > 0
        ? null
        : 'No checkable links match the current filters.',
    refreshLinkHealthLabel: isCheckingLinks
      ? VIDEO_LIBRARY_LOADING_LABEL
      : 'Refresh link health',
  };
}

export function buildVideoDomainRemovalConfirmationDescription(
  impact: VideoDomainRemovalImpact
): string {
  if (impact.affectedSessionCount === 0) {
    return `Remove ${impact.domain} from your custom allowlist?`;
  }

  return `Removing ${impact.domain} will move ${impact.affectedSessionCount} session(s) into the disallowed-domain review state.`;
}

function getTabLabel(tab: VideoLibraryTab) {
  switch (tab) {
    case 'watchable':
      return 'Watchable';
    case 'attention':
      return 'Needs attention';
    case 'no_video':
      return 'No video';
    case 'all':
      return 'All';
  }
}

function getFilteredHostnameOptions(rows: VideoLibraryRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.entry.hostname ?? row.latestCheck?.hostname ?? '')
        .filter((hostname) => hostname.length > 0)
    )
  ).sort();
}

export function deriveVideoLibraryControlVisibility(showAdvanced: boolean) {
  return {
    showCoreControls: true,
    showAdvancedPanel: showAdvanced,
    showSettingsEntryPoint: true,
    showInlineSettingsPanels: false,
  };
}

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
  const [newDomain, setNewDomain] = useState('');
  const [isSavingDomains, setIsSavingDomains] = useState(false);
  const [isSavingCategoryExpectations, setIsSavingCategoryExpectations] =
    useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [presentationMode, setPresentationMode] =
    useState<VideoLibraryPresentationMode>('lounge');
  const [sortOrder, setSortOrder] = useState<VideoLibrarySortOption>('newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playNextEnabled, setPlayNextEnabled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoCheckedRowIds, setAutoCheckedRowIds] = useState<string[]>([]);
  const autoCheckSignatureRef = useRef<string>('');
  const [filters, setFilters] = useState<VideoLibraryFilters>({
    tab: 'watchable',
    search: '',
    status: 'all',
    category: 'all',
    hostname: '',
    checked: 'all',
  });

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

  const rows = useMemo(
    () =>
      deriveVideoLibraryRows({
        sessions,
        customAllowedDomains,
        linkChecksBySessionId: reconciledLinkChecks,
        expectedVideoCategories,
      }),
    [
      sessions,
      customAllowedDomains,
      reconciledLinkChecks,
      expectedVideoCategories,
    ]
  );

  const filteredRows = useMemo(
    () => filterVideoLibraryRows(rows, filters),
    [rows, filters]
  );
  const sortedFilteredRows = useMemo(
    () => sortVideoLibraryRows(filteredRows, sortOrder),
    [filteredRows, sortOrder]
  );
  const loungeRows = useMemo(
    () => sortedFilteredRows.filter((row) => !!row.entry.url),
    [sortedFilteredRows]
  );

  const tabCounts = useMemo(() => getVideoLibraryTabCounts(rows), [rows]);
  const allowedDomains = useMemo(
    () => getAllowedVideoDomains(customAllowedDomains),
    [customAllowedDomains]
  );
  const starterDomains = allowedDomains.filter(
    (domain) => !customAllowedDomains.includes(domain)
  );
  const hostnameOptions = useMemo(
    () => getFilteredHostnameOptions(rows),
    [rows]
  );

  const summaryCounts = useMemo(
    () => ({
      attached: rows.filter((row) => !!row.entry.url).length,
      missing: tabCounts.no_video,
      review: tabCounts.attention,
      checked: rows.filter((row) => row.isChecked).length,
    }),
    [rows, tabCounts.no_video, tabCounts.attention]
  );

  const bulkActionState = deriveVideoLibraryBulkActionState({
    filteredRows,
    isCheckingLinks,
  });
  const controlVisibility = deriveVideoLibraryControlVisibility(showAdvanced);
  const hasAdvancedFiltersApplied =
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.hostname.length > 0 ||
    filters.checked !== 'all' ||
    presentationMode !== 'lounge' ||
    sortOrder === 'recently_checked' ||
    sortOrder === 'provider';
  const emptyState = deriveVideoLibraryEmptyState({
    tab: filters.tab,
    search: filters.search,
    hasAdvancedFiltersApplied,
  });
  const browseState = deriveVideoLibraryBrowseState({
    mode: presentationMode,
    filteredRowCount: sortedFilteredRows.length,
    loungeRowCount: loungeRows.length,
    emptyState,
  });

  const handleEditSuccess = () => {
    setEditingSession(null);
    refreshInventory();
  };

  const handleExpectedCategoryToggle = async (category: SessionCategory) => {
    if (!user || !canSavePreferences) {
      toast({
        title: 'Sign-in required',
        description:
          'Category expectations are saved when authentication is configured and you are signed in.',
      });
      return;
    }

    const nextExpectedCategories = expectedVideoCategories.includes(category)
      ? expectedVideoCategories.filter((value) => value !== category)
      : [...expectedVideoCategories, category];

    setIsSavingCategoryExpectations(true);
    try {
      await saveVideoLibraryPreference(user.uid, {
        ...videoLibraryPreferences,
        customAllowedDomains,
        linkChecksBySessionId: reconciledLinkChecks,
        expectedVideoCategories: nextExpectedCategories,
      });
      toast({
        title: 'Category expectations updated',
        description:
          nextExpectedCategories.length > 0
            ? 'No-video reminders now follow your selected categories.'
            : 'No-video reminders are disabled for all categories.',
      });
    } catch (error) {
      console.error('Failed to save category expectations', error);
      toast({
        variant: 'destructive',
        title: 'Could not save expectations',
        description:
          'Your category expectation changes were not saved. Please try again.',
      });
    } finally {
      setIsSavingCategoryExpectations(false);
    }
  };

  const handleAddDomain = async () => {
    if (!user || !canSavePreferences) {
      toast({
        title: 'Sign-in required',
        description:
          'Custom allowed domains are available when authentication is configured and you are signed in.',
      });
      return;
    }

    const normalizedDomain = normalizeVideoDomainInput(newDomain);
    if (!normalizedDomain) {
      toast({
        variant: 'destructive',
        title: 'Invalid domain',
        description:
          'Enter a hostname like youtube.com with no scheme, path, or port.',
      });
      return;
    }

    if (allowedDomains.includes(normalizedDomain)) {
      toast({
        variant: 'destructive',
        title: 'Domain already allowed',
        description: `${normalizedDomain} is already covered by the current allowlist.`,
      });
      return;
    }

    const nextPreferences: VideoLibraryPreferences = {
      ...videoLibraryPreferences,
      customAllowedDomains: Array.from(
        new Set([...customAllowedDomains, normalizedDomain])
      ).sort(),
      linkChecksBySessionId: reconciledLinkChecks,
      expectedVideoCategories,
    };

    setIsSavingDomains(true);
    try {
      await saveVideoLibraryPreference(user.uid, nextPreferences);
      setNewDomain('');
      toast({
        title: 'Allowed domains updated',
        description: `${normalizedDomain} can now be used in the Video Library allowlist.`,
      });
    } catch (error) {
      console.error('Failed to save video library preference', error);
      toast({
        variant: 'destructive',
        title: 'Could not save domain',
        description: 'Your allowlist changes were not saved. Please try again.',
      });
    } finally {
      setIsSavingDomains(false);
    }
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
      if (!authAvailable || !user) {
        toast({
          title: 'Sign-in required',
          description: 'Live link checks are available after sign-in.',
        });
        return;
      }

      if (sessionIds.length === 0) {
        return;
      }

      setIsCheckingLinks(true);
      try {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const response = await fetch('/api/video-library/check-links', {
          method: 'POST',
          headers,
          body: JSON.stringify({ sessionIds }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to check video links');
        }

        const results = Array.isArray(payload.results) ? payload.results : [];
        const nextLinkChecks = reconcileVideoLinkChecks({
          sessions,
          customAllowedDomains,
          linkChecksBySessionId: mergeVideoLinkCheckResults({
            existing: reconciledLinkChecks,
            results,
          }),
        });

        await saveVideoLibraryPreference(user.uid, {
          ...videoLibraryPreferences,
          customAllowedDomains,
          linkChecksBySessionId: nextLinkChecks,
          expectedVideoCategories,
        });

        if (!options?.silent) {
          toast({
            title: 'Link health refreshed',
            description: `Updated link status for ${results.length} videos.`,
          });
        }
      } catch (error) {
        console.error('Failed to check video links', error);
        toast({
          variant: 'destructive',
          title: 'Link check failed',
          description:
            'The Video Library could not complete the link check. Try again in a moment.',
        });
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
      getAuthHeaders,
      saveVideoLibraryPreference,
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

  return (
    <PluginPageShell
      title="Video Library"
      description="Browse, check, and enjoy your linked session videos. Videos are optional for every session."
      tone="info"
      icon={<Film className="h-6 w-6" />}
    >
      <PluginStatsGrid>
        <PluginStatCard
          label="Videos attached"
          value={summaryCounts.attached}
        />
        <PluginStatCard
          label="Sessions without video (optional)"
          value={summaryCounts.missing}
        />
        <PluginStatCard label="Needs review" value={summaryCounts.review} />
        <PluginStatCard label="Checked links" value={summaryCounts.checked} />
      </PluginStatsGrid>

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
                  onClick={() => setFilters((current) => ({ ...current, tab }))}
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
                  setFilters((current) => ({
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
            onClick={() => setShowAdvanced((current) => !current)}
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
                    setFilters((current) => ({
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
                    setFilters((current) => ({
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
                    setFilters((current) => ({
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
                    setFilters((current) => ({
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
                    {hostnameOptions.map((hostname) => (
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
                  {(['table', 'lounge'] as VideoLibraryPresentationMode[]).map(
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
                    filteredRows.filter((row) => row.isCheckable).length
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

      <PluginTableSection
        title="Video Lounge"
        description="Filter by tab, status, category, or host to focus your current review task. No-video reminders follow your category expectations."
        hasRows={browseState.hasRows}
        emptyTitle={browseState.title}
        emptyDescription={browseState.description}
        emptyCtaLabel={browseState.ctaLabel}
        onEmptyCta={handleEmptyStateAction}
        emptyIcon={<AlertCircle className="h-4 w-4" />}
      >
        {presentationMode === 'table' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Check age</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFilteredRows.map((row) => (
                <TableRow key={row.session.id}>
                  <TableCell className="font-medium">
                    <div>{row.session.date}</div>
                    <div
                      className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
                    >
                      {row.session.category}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(row.displayStatus)}>
                      {getEntryStatusLabel(row.displayStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {row.entry.hostname ?? row.latestCheck?.hostname ?? '—'}
                  </TableCell>
                  <TableCell>
                    {row.latestCheck ? (
                      <span
                        className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                      >
                        {new Date(row.latestCheck.checkedAt).toLocaleString()}
                      </span>
                    ) : (
                      <span
                        className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                      >
                        Not checked
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {row.entry.url ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a
                            href={row.entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                      {showAdvanced && row.isCheckable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            void handleCheckLinks([row.session.id])
                          }
                          disabled={isCheckingLinks}
                        >
                          <RefreshCcw className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingSession(row.session)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {row.entry.url ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          interaction="destructive"
                          onClick={() => setSessionPendingClear(row.session)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {loungeRows.map((row, index) => {
              const nextRow =
                presentationMode === 'lounge' && playNextEnabled
                  ? loungeRows[index + 1]
                  : undefined;
              return (
                <article
                  key={row.session.id}
                  className="space-y-3 rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.session.date}</p>
                      <p
                        className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                      >
                        {row.session.category}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(row.displayStatus)}>
                      {getEntryStatusLabel(row.displayStatus)}
                    </Badge>
                  </div>
                  <p
                    className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    {row.session.techniques.join(', ') ||
                      'No techniques listed'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {row.entry.hostname ??
                        row.latestCheck?.hostname ??
                        'unknown host'}
                    </Badge>
                    <Badge variant="secondary">
                      {row.latestCheck
                        ? `Checked ${new Date(
                            row.latestCheck.checkedAt
                          ).toLocaleDateString()}`
                        : 'Not checked yet'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" asChild>
                      <a
                        href={row.entry.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Watch
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                    {nextRow?.entry.url ? (
                      <Button type="button" variant="outline" asChild>
                        <a
                          href={nextRow.entry.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Play next
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PluginTableSection>

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
              {starterDomains.map((domain) => (
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
                  customAllowedDomains.map((domain) => (
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
