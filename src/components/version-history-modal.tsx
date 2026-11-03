'use client';

import React, { useEffect, useState } from 'react';
import { VanillaDialog } from '@/components/vanilla-dialog';
import { VersionHistoryContent } from '@/components/version-history-content';
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
        if (controller.signal.aborted) return;
        const payload = (await response.json()) as
          RecentReleasesResponse | ReleaseHistoryErrorResponse;

        if (controller.signal.aborted) return;

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
        if (controller.signal.aborted) return;
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
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadReleases();

    return () => {
      controller.abort();
    };
  }, [open, releases.length]);

  const body = (
    <VersionHistoryContent releases={releases} isLoading={isLoading} error={error} />
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
    <VanillaDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Version History"
      description="Recent changes across the three most recent versions"
    >
      {body}
    </VanillaDialog>
  );
};
