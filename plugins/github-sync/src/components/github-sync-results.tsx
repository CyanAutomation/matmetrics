'use client';

import React from 'react';
import { AlertCircle, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { runLoadGitHubSyncHistory } from './github-sync-results-api';
export type {
  GitHubSyncHistoryData,
  GitHubSyncHistoryFile,
  GitHubSyncSurfaceState,
  LoadGitHubSyncHistoryOptions,
} from './github-sync-results-types';
import type {
  GitHubSyncHistoryData,
  GitHubSyncSurfaceState,
} from './github-sync-results-types';

export const GITHUB_SYNC_RESULTS_LOADING_TEXT = 'Loading sync results…';
export const GITHUB_SYNC_RESULTS_ERROR_RETRY_LABEL = 'Retry';
export const GITHUB_SYNC_RESULTS_EMPTY_CTA_LABEL = 'Run sync';

export { runLoadGitHubSyncHistory } from './github-sync-results-api';

export function SyncResultsMainPanel({
  state,
  onRetry,
  onRunSync,
}: {
  state: GitHubSyncSurfaceState<GitHubSyncHistoryData>;
  onRetry: () => void;
  onRunSync: () => void;
}) {
  if (state.status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground flex items-center gap-2"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {GITHUB_SYNC_RESULTS_LOADING_TEXT}
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t load sync results</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{state.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {GITHUB_SYNC_RESULTS_ERROR_RETRY_LABEL}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.status === 'empty' || state.status === 'idle') {
    return (
      <Alert>
        <RefreshCw className="h-4 w-4" />
        <AlertTitle>No sync results yet</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {state.status === 'empty'
              ? state.message
              : 'Run sync to generate your first sync result summary.'}
          </p>
          <Button size="sm" onClick={onRunSync}>
            {GITHUB_SYNC_RESULTS_EMPTY_CTA_LABEL}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{state.data.message}</p>
        <p className="text-sm text-muted-foreground">
          {state.data.totalFiles} file(s) checked
          {state.data.branch ? ` on ${state.data.branch}` : ''}.
        </p>
        {state.warnings.length > 0 && (
          <Alert>
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              {state.warnings.length} warning(s) detected. Review file details
              below.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function SyncResultsHistoryList({
  state,
  selectedPath,
  onSelect,
  onRetry,
  onRunSync: _onRunSync,
}: {
  state: GitHubSyncSurfaceState<GitHubSyncHistoryData>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRetry: () => void;
  /** Retained for callers while the single primary CTA lives in the summary. */
  onRunSync?: () => void;
}) {
  if (state.status === 'loading') {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">Loading history…</p>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700">
          History failed to load: {state.message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry history
        </Button>
      </div>
    );
  }

  if (state.status === 'empty' || state.status === 'idle') {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          No history entries yet. Run sync from the summary above to create one.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {state.data.files.map((file) => (
        <li key={file.path}>
          <Button
            variant={selectedPath === file.path ? 'default' : 'outline'}
            size="sm"
            className="w-full justify-start"
            onClick={() => onSelect(file.path)}
          >
            {file.path}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function SyncResultsDetailPane({
  state,
  selectedPath,
  onRetry,
}: {
  state: GitHubSyncSurfaceState<GitHubSyncHistoryData>;
  selectedPath: string | null;
  onRetry: () => void;
}) {
  if (state.status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="space-y-2">
        <p className="text-sm text-muted-foreground">Loading details…</p>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700">
          Details unavailable: {state.message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry details
        </Button>
      </div>
    );
  }

  if (state.status === 'empty' || state.status === 'idle') {
    return (
      <p className="text-sm text-muted-foreground">
        No detail to show yet. Run sync first.
      </p>
    );
  }

  const selected =
    state.data.files.find((file) => file.path === selectedPath) ??
    state.data.files[0] ??
    null;

  if (!selected) {
    return (
      <p className="text-sm text-muted-foreground">
        Choose a history item to inspect details.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{selected.path}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Status: {selected.status}</p>
        {selected.id ? <p>Session ID: {selected.id}</p> : null}
        {selected.date ? <p>Date: {selected.date}</p> : null}
        {selected.errors.length > 0 && (
          <Alert>
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>File warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside">
                {selected.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
