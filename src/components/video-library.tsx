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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export const VIDEO_LIBRARY_LOADING_LABEL = 'Checking...';
export const VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL = 'View all sessions';
export const VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL = 'Add a video';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL = 'Remove domain';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL = 'Cancel';

function getEntryStatusLabel(status: VideoLibraryStatusFilter) {
  switch (status) {
    case 'missing':
      return 'Missing video';
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
    case 'reachable':
      return 'default';
    case 'allowed_unchecked':
    case 'all':
      return 'outline';
    default:
      return 'destructive';
  }
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
      'Add a video to your next session log to populate the library.',
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
    case 'missing':
      return 'Missing';
    case 'review':
      return 'Needs Review';
    case 'checked':
      return 'Checked';
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
  const [filters, setFilters] = useState<VideoLibraryFilters>({
    tab: 'all',
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
      missing: tabCounts.missing,
      review: tabCounts.review,
      checked: tabCounts.checked,
    }),
    [rows, tabCounts]
  );

  const bulkActionState = deriveVideoLibraryBulkActionState({
    filteredRows,
    isCheckingLinks,
  });
  const emptyState = deriveVideoLibraryEmptyState({
    tab: filters.tab,
    search: filters.search,
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
    if (emptyState.action === 'clearSearch') {
      setFilters((current) => ({ ...current, search: '' }));
      return;
    }

    if (emptyState.action === 'switchToAll') {
      setFilters((current) => ({ ...current, tab: 'all' }));
      return;
    }

    const firstMissing = rows.find((row) => row.entry.status === 'missing');
    if (firstMissing) {
      setEditingSession(firstMissing.session);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Videos attached</CardDescription>
            <CardTitle className="text-3xl">{summaryCounts.attached}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing videos</CardDescription>
            <CardTitle className="text-3xl">{summaryCounts.missing}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs review</CardDescription>
            <CardTitle className="text-3xl">{summaryCounts.review}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Checked links</CardDescription>
            <CardTitle className="text-3xl">{summaryCounts.checked}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Video Library
          </CardTitle>
          <CardDescription>
            Audit session video coverage, persist the latest check results, and
            manage approved providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Review tabs</Label>
            <div className="flex flex-wrap gap-2">
              {(
                ['missing', 'review', 'checked', 'all'] as VideoLibraryTab[]
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

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
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
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Built-in domains</CardTitle>
            <CardDescription>
              Providers included in the default allowlist.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {starterDomains.map((domain) => (
              <Badge key={domain} variant="outline">
                {domain}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom domains</CardTitle>
            <CardDescription>
              Add trusted hosts for club videos or coaching portals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>

      {summaryCounts.review > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Sessions need video review</AlertTitle>
          <AlertDescription>
            {summaryCounts.review} session(s) are missing videos, use disallowed
            domains, or have broken/failed link checks.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Session Video Audit</CardTitle>
          <CardDescription>
            Filter by tab, status, category, or host to focus the current audit
            task.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{emptyState.title}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{emptyState.description}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEmptyStateAction}
                >
                  {emptyState.ctaLabel}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
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
                {filteredRows.map((row) => (
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
          )}
        </CardContent>
      </Card>

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

      <Dialog
        open={!!sessionPendingClear}
        onOpenChange={(open) =>
          !open && !isClearingVideo && setSessionPendingClear(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove session video?</DialogTitle>
            <DialogDescription>
              This clears the stored `videoUrl` for the selected session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSessionPendingClear(null)}
              disabled={isClearingVideo}
            >
              Cancel
            </Button>
            <Button
              type="button"
              interaction="destructive"
              onClick={() => void handleClearVideo()}
              disabled={isClearingVideo}
            >
              {isClearingVideo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!domainPendingRemoval}
        onOpenChange={(open) =>
          !open && !isRemovingDomain && setDomainPendingRemoval(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove custom domain?</DialogTitle>
            <DialogDescription>
              {domainPendingRemoval
                ? buildVideoDomainRemovalConfirmationDescription(
                    domainPendingRemoval.impact
                  )
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDomainPendingRemoval(null)}
              disabled={isRemovingDomain}
            >
              {VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL}
            </Button>
            <Button
              type="button"
              interaction="destructive"
              onClick={() => void handleConfirmRemoveDomain()}
              disabled={isRemovingDomain}
            >
              {isRemovingDomain ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
