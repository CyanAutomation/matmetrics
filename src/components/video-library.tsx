'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Film,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
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
import type { JudoSession, VideoLibraryPreferences } from '@/lib/types';
import { saveVideoLibraryPreference } from '@/lib/user-preferences';
import type { VideoLinkCheckResult, VideoLibraryEntry } from '@/lib/video-library';
import {
  canCheckVideoEntry,
  deriveVideoLibraryEntries,
  getAllowedVideoDomains,
  normalizeVideoDomainInput,
} from '@/lib/video-library';

interface VideoLibraryProps {
  onRefresh: () => void;
}

const EMPTY_VIDEO_LIBRARY_CTA = 'Add a video to your next session log.';

function getEntryStatusLabel(status: VideoLibraryEntry['status']) {
  switch (status) {
    case 'missing':
      return 'Missing video';
    case 'allowed_unchecked':
      return 'Allowed';
    case 'disallowed_domain':
      return 'Disallowed domain';
    case 'invalid_url':
      return 'Invalid URL';
  }
}

function getCheckStatusLabel(status: VideoLinkCheckResult['status']) {
  switch (status) {
    case 'reachable':
      return 'Reachable';
    case 'broken':
      return 'Broken';
    case 'disallowed_domain':
      return 'Disallowed';
    case 'check_failed':
      return 'Check failed';
  }
}

function getCheckStatusVariant(status: VideoLinkCheckResult['status']) {
  switch (status) {
    case 'reachable':
      return 'default';
    case 'broken':
    case 'disallowed_domain':
    case 'check_failed':
      return 'destructive';
  }
}

export function VideoLibrary({ onRefresh }: VideoLibraryProps) {
  const { toast } = useToast();
  const { user, preferences, canSavePreferences, authAvailable } = useAuth();
  const [sessions, setSessions] = useState<JudoSession[]>([]);
  const [editingSession, setEditingSession] = useState<JudoSession | null>(null);
  const [sessionPendingClear, setSessionPendingClear] =
    useState<JudoSession | null>(null);
  const [isClearingVideo, setIsClearingVideo] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [isSavingDomains, setIsSavingDomains] = useState(false);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [checkResults, setCheckResults] = useState<VideoLinkCheckResult[]>([]);

  const customAllowedDomains =
    preferences.videoLibrary?.customAllowedDomains ?? [];

  const refreshInventory = () => {
    setSessions(getSessions());
    onRefresh();
  };

  useEffect(() => {
    setSessions(getSessions());
  }, []);

  const entries = useMemo(
    () => deriveVideoLibraryEntries(sessions, customAllowedDomains),
    [sessions, customAllowedDomains]
  );

  const entriesBySessionId = useMemo(
    () => new Map(entries.map((entry) => [entry.session.id, entry])),
    [entries]
  );

  const allowedDomains = useMemo(
    () => getAllowedVideoDomains(customAllowedDomains),
    [customAllowedDomains]
  );

  const missingEntries = entries.filter((entry) => entry.status === 'missing');
  const disallowedEntries = entries.filter(
    (entry) =>
      entry.status === 'disallowed_domain' || entry.status === 'invalid_url'
  );

  const candidateEntries = entries.filter((entry) => canCheckVideoEntry(entry));

  const resultBySessionId = useMemo(
    () => new Map(checkResults.map((result) => [result.sessionId, result])),
    [checkResults]
  );

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

    const nextPreferences: VideoLibraryPreferences = {
      customAllowedDomains: Array.from(
        new Set([...customAllowedDomains, normalizedDomain])
      ).sort(),
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

  const handleRemoveDomain = async (domain: string) => {
    if (!user || !canSavePreferences) {
      return;
    }

    setIsSavingDomains(true);
    try {
      await saveVideoLibraryPreference(user.uid, {
        customAllowedDomains: customAllowedDomains.filter(
          (existing) => existing !== domain
        ),
      });
      toast({
        title: 'Allowed domains updated',
        description: `${domain} was removed from your custom domain allowlist.`,
      });
    } catch (error) {
      console.error('Failed to remove video library domain', error);
      toast({
        variant: 'destructive',
        title: 'Could not remove domain',
        description: 'The allowlist could not be updated. Please try again.',
      });
    } finally {
      setIsSavingDomains(false);
    }
  };

  const handleCheckLinks = async () => {
    if (!authAvailable || !user) {
      toast({
        title: 'Sign-in required',
        description: 'Live link checks are available after sign-in.',
      });
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
        body: JSON.stringify({
          sessionIds: candidateEntries.map((entry) => entry.session.id),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to check video links');
      }

      setCheckResults(Array.isArray(payload.results) ? payload.results : []);
      toast({
        title: 'Video links checked',
        description: `Checked ${candidateEntries.length} allowed video link(s).`,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Videos attached</CardDescription>
            <CardTitle className="text-3xl">
              {entries.filter((entry) => !!entry.url).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing videos</CardDescription>
            <CardTitle className="text-3xl">{missingEntries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs review</CardDescription>
            <CardTitle className="text-3xl">{disallowedEntries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Checked links</CardDescription>
            <CardTitle className="text-3xl">{checkResults.length}</CardTitle>
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
            Audit session video coverage, enforce a domain allowlist, and run
            live reachability checks for approved providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {allowedDomains.map((domain) => {
                const isStarterDomain = !customAllowedDomains.includes(domain);

                return (
                  <Badge key={domain} variant="outline" className="gap-2">
                    {domain}
                    {isStarterDomain ? (
                      <span className="text-xs text-muted-foreground">
                        built-in
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => void handleRemoveDomain(domain)}
                        disabled={isSavingDomains}
                        aria-label={`Remove ${domain}`}
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCheckLinks()}
                disabled={isCheckingLinks || candidateEntries.length === 0}
              >
                {isCheckingLinks ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Check links
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="video-library-domain">Custom allowed domain</Label>
              <Input
                id="video-library-domain"
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
                placeholder="coachportal.example.com"
                disabled={!canSavePreferences || isSavingDomains}
              />
              {!canSavePreferences && (
                <p className="text-sm text-muted-foreground">
                  Sign in to save custom video domains.
                </p>
              )}
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
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Alert>
          <Film className="h-4 w-4" />
          <AlertTitle>No sessions yet</AlertTitle>
          <AlertDescription>{EMPTY_VIDEO_LIBRARY_CTA}</AlertDescription>
        </Alert>
      ) : null}

      {disallowedEntries.length > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Sessions need video review</AlertTitle>
          <AlertDescription>
            {disallowedEntries.length} session(s) have invalid URLs or domains
            outside the current allowlist.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Session Video Audit</CardTitle>
          <CardDescription>
            Review missing videos, disallowed providers, and live check results
            in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Link check</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const checkResult = resultBySessionId.get(entry.session.id);

                return (
                  <TableRow key={entry.session.id}>
                    <TableCell className="font-medium">
                      <div>{entry.session.date}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.session.category}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === 'allowed_unchecked'
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {getEntryStatusLabel(entry.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {entry.hostname || '—'}
                    </TableCell>
                    <TableCell>
                      {checkResult ? (
                        <Badge variant={getCheckStatusVariant(checkResult.status)}>
                          {getCheckStatusLabel(checkResult.status)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not checked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {entry.url ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(entry.url, '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingSession(entry.session)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {entry.url ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            interaction="destructive"
                            onClick={() => setSessionPendingClear(entry.session)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2Off className="h-5 w-5" />
              Missing videos
            </CardTitle>
            <CardDescription>
              Sessions that do not currently have a `videoUrl`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {missingEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every current session has a video link.
              </p>
            ) : (
              missingEntries.map((entry) => (
                <div
                  key={entry.session.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{entry.session.date}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.session.techniques.join(', ') || 'No techniques'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingSession(entry.session)}
                  >
                    Add video
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Checked link results
            </CardTitle>
            <CardDescription>
              Results from the latest on-demand live check.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No live checks have been run yet.
              </p>
            ) : (
              checkResults.map((result) => {
                const entry = entriesBySessionId.get(result.sessionId);
                return (
                  <div
                    key={result.sessionId}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {entry?.session.date || result.sessionId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {result.hostname}
                        </p>
                      </div>
                      <Badge variant={getCheckStatusVariant(result.status)}>
                        {result.status === 'reachable' ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : null}
                        {getCheckStatusLabel(result.status)}
                      </Badge>
                    </div>
                    {result.error ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {result.error}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

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
        onOpenChange={(open) => !open && !isClearingVideo && setSessionPendingClear(null)}
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
    </div>
  );
}
