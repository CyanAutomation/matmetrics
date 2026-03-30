'use client';

import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { APP_VERSION } from '@/lib/app-version';
import type { ReleaseEntry } from '@/lib/releases';

type RecentReleasesResponse = {
  currentVersion: string;
  releases: ReleaseEntry[];
};

type ReleaseHistoryErrorResponse = {
  error?: string;
  details?: string;
};

const isReleaseHistoryErrorResponse = (
  payload: RecentReleasesResponse | ReleaseHistoryErrorResponse
): payload is ReleaseHistoryErrorResponse =>
  'error' in payload || 'details' in payload;

const isRecentReleasesResponse = (
  payload: RecentReleasesResponse | ReleaseHistoryErrorResponse
): payload is RecentReleasesResponse => 'releases' in payload;

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disableDialogWrapper?: boolean;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  open,
  onOpenChange,
  disableDialogWrapper = false,
}) => {
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || releases.length > 0) {
      return;
    }

    const controller = new AbortController();

    const loadReleases = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/releases/recent', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json()) as
          | RecentReleasesResponse
          | ReleaseHistoryErrorResponse;

        if (!response.ok) {
          if (isReleaseHistoryErrorResponse(payload)) {
            throw new Error(
              payload.details ?? payload.error ?? 'Unknown error'
            );
          }
          throw new Error('Unknown error');
        }

        if (!isRecentReleasesResponse(payload)) {
          throw new Error('Release history response is missing releases.');
        }
        setReleases(payload.releases);
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        ) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Unable to load release history.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadReleases();

    return () => {
      controller.abort();
    };
  }, [open, releases.length]);

  const body = (
    <div className="overflow-y-auto pr-4 space-y-6">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading recent releases...
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">
          Unable to load release history. {error}
        </p>
      ) : null}
      {!isLoading && !error
        ? releases.map((entry) => (
            <div key={entry.version}>
              <div className="mb-3">
                <h3 className="font-semibold text-sm">v{entry.version}</h3>
                <p className="text-xs text-muted-foreground">{entry.date}</p>
              </div>
              <div className="space-y-3">
                {entry.sections.map((section) => (
                  <div key={`${entry.version}-${section.label}`}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                      {section.label}
                    </h4>
                    <ul className="space-y-1 ml-3">
                      {section.items.map((item) => (
                        <li
                          key={`${entry.version}-${section.label}-${item}`}
                          className="text-xs leading-relaxed"
                        >
                          <span className="inline-block w-1 h-1 bg-muted-foreground rounded-full mr-2 align-middle"></span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))
        : null}
      {!isLoading && !error && releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recent releases are available.
        </p>
      ) : null}
    </div>
  );

  if (disableDialogWrapper) {
    return (
      <section>
        <h2>Version History</h2>
        <p>Recent changes across the three most recent versions</p>
        {body}
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-96">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Recent changes across the three most recent versions
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};

interface VersionHistoryButtonProps {
  onClick: () => void;
}

export const VersionHistoryButton: React.FC<VersionHistoryButtonProps> = ({
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title="View version history"
      aria-label="View version history"
    >
      <Info className="h-3 w-3" />
      <span className="text-xs font-medium">v{APP_VERSION}</span>
    </button>
  );
};
