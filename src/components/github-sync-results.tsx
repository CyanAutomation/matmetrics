'use client';

import React from 'react';
import { AlertCircle, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export type GitHubSyncSurfaceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; warnings: string[] }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

export type GitHubSyncHistoryFile = {
  path: string;
  status: string;
  errors: string[];
  id?: string;
  date?: string;
};

export type GitHubSyncHistoryData = {
  message: string;
  branch?: string;
  totalFiles: number;
  invalidFiles: number;
  files: GitHubSyncHistoryFile[];
};

export type LoadGitHubSyncHistoryOptions = {
  owner: string;
  repo: string;
  branch?: string;
  getHeaders: (headers?: HeadersInit) => Promise<HeadersInit>;
  fetchImpl?: typeof fetch;
  onStateChange: (state: GitHubSyncSurfaceState<GitHubSyncHistoryData>) => void;
};

const parseErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown;
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string' &&
      payload.message.trim()
    ) {
      return payload.message;
    }
  } catch {
    // Ignore parse errors and use fallback.
  }
  return fallback;
};

export async function runLoadGitHubSyncHistory(
  options: LoadGitHubSyncHistoryOptions
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  options.onStateChange({ status: 'loading' });

  try {
    const headers = await options.getHeaders({
      'Content-Type': 'application/json',
    });
    const response = await fetchImpl('/api/github/log-doctor', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner: options.owner,
        repo: options.repo,
        branch: options.branch,
      }),
    });

    if (!response.ok) {
      const message = await parseErrorMessage(
        response,
        `Failed to load sync history (HTTP ${response.status}).`
      );
      options.onStateChange({ status: 'error', message });
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      options.onStateChange({
        status: 'error',
        message:
          'Sync history response could not be parsed. Please retry the request.',
      });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      options.onStateChange({
        status: 'error',
        message: 'Sync history response was malformed. Please retry.',
      });
      return;
    }

    const summary =
      'summary' in payload &&
      payload.summary &&
      typeof payload.summary === 'object'
        ? payload.summary
        : null;
    const files =
      'files' in payload && Array.isArray(payload.files) ? payload.files : [];
    const totalFiles =
      summary &&
      'totalFiles' in summary &&
      typeof summary.totalFiles === 'number'
        ? summary.totalFiles
        : files.length;
    const invalidFiles =
      summary &&
      'invalidFiles' in summary &&
      typeof summary.invalidFiles === 'number'
        ? summary.invalidFiles
        : 0;

    if (files.length === 0) {
      options.onStateChange({
        status: 'empty',
        message:
          'No sync history is available yet. Run sync to generate repository diagnostics.',
      });
      return;
    }

    const normalizedFiles: GitHubSyncHistoryFile[] = files.map((file) => {
      const normalized = file as Record<string, unknown>;
      return {
        path: typeof normalized.path === 'string' ? normalized.path : 'unknown',
        status:
          typeof normalized.status === 'string' ? normalized.status : 'unknown',
        errors: Array.isArray(normalized.errors)
          ? normalized.errors.filter(
              (entry): entry is string => typeof entry === 'string'
            )
          : [],
        id: typeof normalized.id === 'string' ? normalized.id : undefined,
        date: typeof normalized.date === 'string' ? normalized.date : undefined,
      };
    });

    const warnings = [
      ...(invalidFiles > 0
        ? [
            `${invalidFiles} file${invalidFiles === 1 ? '' : 's'} have validation issues and need attention.`,
          ]
        : []),
      ...normalizedFiles.flatMap((file) =>
        file.errors.map((error) => `${file.path}: ${error}`)
      ),
    ];

    options.onStateChange({
      status: 'success',
      warnings,
      data: {
        message:
          'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : 'Sync history loaded.',
        branch:
          'branch' in payload && typeof payload.branch === 'string'
            ? payload.branch
            : undefined,
        totalFiles,
        invalidFiles,
        files: normalizedFiles,
      },
    });
  } catch (error) {
    options.onStateChange({
      status: 'error',
      message:
        error instanceof Error
          ? `Unable to load sync history: ${error.message}`
          : 'Unable to load sync history due to a network error.',
    });
  }
}

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
            Loading sync results…
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
            Retry
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
            Run sync
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
  onRunSync,
}: {
  state: GitHubSyncSurfaceState<GitHubSyncHistoryData>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRetry: () => void;
  onRunSync: () => void;
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
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No history entries yet. Start with a sync run.
        </p>
        <Button size="sm" onClick={onRunSync}>
          Run sync
        </Button>
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
