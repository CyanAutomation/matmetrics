'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
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
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';
import { PluginToolbar } from '@/components/plugins/plugin-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  action: 'clearSearch' | 'switchToAll' | 'editSession';
};

type VideoLibraryPresentationMode = 'table' | 'lounge';
type VideoLibrarySortOption =
  | 'newest'
  | 'oldest'
  | 'recently_checked'
  | 'provider';

export const VIDEO_LIBRARY_LOADING_LABEL = 'Checking...';
export const VIDEO_LIBRARY_MODE_TABLE_LABEL = 'Table';
export const VIDEO_LIBRARY_MODE_LOUNGE_LABEL = 'Lounge';
export const VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL = 'View all sessions';
export const VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL =
  'Log sessions as usual; add videos when useful';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL = 'Remove domain';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL = 'Cancel';
export const VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE = 'No linked videos in this view';
export const VIDEO_LIBRARY_LOUNGE_EMPTY_DESCRIPTION =
  'This filtered set has sessions, but none currently have a playable URL.';

export function getVideoLibraryReviewAlertDescription(reviewCount: number) {
  return `${reviewCount} session(s) use disallowed domains, have invalid URLs, or have broken/failed link checks.`;
}

function getEntryStatusLabel(status: VideoLibraryStatusFilter) {
  switch (status) {
    case 'missing':
      return 'No linked video';
    case 'allowed_unchecked':
      return 'Allowed';
    case 'disallowed_domain':
      return 'Disallowed domain';
    case 'invalid_url':
      return 'Invalid URL';
    case 'reachable':
      return 'Reachable';
    case 'broken':
      return 'Broken';
    case 'check_failed':
      return 'Check failed';
    case 'all':
      return 'All statuses';
  }
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
}: {
  tab: VideoLibraryTab;
  search: string;
}): EmptyStateDescriptor {
  if (search.trim()) {
    return {
      title: 'No matching video sessions',
      description:
        'No rows match your current search and filters. Clear the search to widen the audit view.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
      action: 'clearSearch',
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
  const uncheckedRows = checkableRows.filter((row) => !row.isChecked);

  return {
    canCheckFiltered: !isCheckingLinks && checkableRows.length > 0,
    canCheckUnchecked: !isCheckingLinks && uncheckedRows.length > 0,
    checkFilteredLabel: isCheckingLinks
      ? VIDEO_LIBRARY_LOADING_LABEL
      : 'Check filtered',
    checkUncheckedLabel: isCheckingLinks
      ? VIDEO_LIBRARY_LOADING_LABEL
      : 'Check unchecked',
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
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [presentationMode, setPresentationMode] =
    useState<VideoLibraryPresentationMode>('table');
  const [sortOrder, setSortOrder] = useState<VideoLibrarySortOption>('newest');
  const [playNextEnabled, setPlayNextEnabled] = useState(false);
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
  ]);

  const rows = useMemo(
    () =>
      deriveVideoLibraryRows({
        sessions,
        customAllowedDomains,
        linkChecksBySessionId: reconciledLinkChecks,
      }),
    [sessions, customAllowedDomains, reconciledLinkChecks]
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
  const emptyState = deriveVideoLibraryEmptyState({
    tab: filters.tab,
    search: filters.search,
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

  const handleCheckLinks = async (sessionIds: string[]) => {
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
      });

      toast({
        title: 'Video links checked',
        description: `Checked ${results.length} video link(s).`,
      });
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
  };

  const handleCheckFiltered = async () => {
    await handleCheckLinks(
      filteredRows.filter((row) => row.isCheckable).map((row) => row.session.id)
    );
  };

  const handleCheckUnchecked = async () => {
    await handleCheckLinks(
      filteredRows
        .filter((row) => row.isCheckable && !row.isChecked)
        .map((row) => row.session.id)
    );
  };

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

    const firstMissing = rows.find((row) => row.entry.status === 'missing');
    if (firstMissing) {
      setEditingSession(firstMissing.session);
    }
  };

  return (
    <PluginPageShell
      title="Video Library"
      description="Browse, check, and enjoy your linked session videos."
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

      <PluginSectionCard
        title="Inventory & filters"
        description="Filter by status, category, hostname, and link-check state."
        contentClassName="space-y-4"
      >
        <div className="space-y-2">
          <Label>Browse tabs</Label>
          <div className="flex flex-wrap gap-2">
            {(
              ['watchable', 'attention', 'all', 'no_video'] as VideoLibraryTab[]
            ).map((tab) => (
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
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-2">
            <Label htmlFor="video-library-search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            <Label>Checked state</Label>
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
        </div>

        <PluginToolbar className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
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
                    variant={presentationMode === mode ? 'default' : 'ghost'}
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
            <Label>Sort</Label>
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

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCheckFiltered()}
              disabled={!bulkActionState.canCheckFiltered}
            >
              {isCheckingLinks ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {bulkActionState.checkFilteredLabel}
            </Button>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCheckUnchecked()}
              disabled={!bulkActionState.canCheckUnchecked}
            >
              {isCheckingLinks ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {bulkActionState.checkUncheckedLabel}
            </Button>
          </div>
        </PluginToolbar>
      </PluginSectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
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
            <p className="text-sm text-muted-foreground">
              Sign in to save custom video domains.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {customAllowedDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom domains saved yet.
              </p>
            ) : (
              customAllowedDomains.map((domain) => (
                <Badge key={domain} variant="outline" className="gap-2">
                  {domain}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
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

      {summaryCounts.review > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Video link attention items</AlertTitle>
          <AlertDescription>
            {getVideoLibraryReviewAlertDescription(summaryCounts.review)}
          </AlertDescription>
        </Alert>
      ) : null}

      <PluginTableSection
        title="Video Lounge"
        description="Filter by tab, status, category, or host to focus the current audit task."
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
                    <div className="text-xs text-muted-foreground">
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
                      <span className="text-sm text-muted-foreground">
                        {new Date(row.latestCheck.checkedAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
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
                      {row.isCheckable ? (
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
              const nextRow = playNextEnabled
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
                      <p className="text-sm text-muted-foreground">
                        {row.session.category}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(row.displayStatus)}>
                      {getEntryStatusLabel(row.displayStatus)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
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
