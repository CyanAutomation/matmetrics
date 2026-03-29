'use client';

import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type AuditFlagCode, type AuditSeverity } from '@/lib/types';

import type { AuditSessionResult } from './log-doctor-state';

const SEVERITY_BADGE_VARIANT: Record<
  AuditSeverity,
  'default' | 'destructive' | 'outline' | 'secondary'
> = {
  error: 'destructive',
  warning: 'default',
  info: 'secondary',
};

const FLAG_CODE_LABEL: Record<AuditFlagCode, string> = {
  no_techniques_high_effort: 'No techniques (high effort)',
  empty_description: 'Missing description',
  empty_notes: 'Missing notes',
  duration_outlier: 'Unusual duration',
};

type ReviewDialogProps = {
  session: AuditSessionResult | null;
  open: boolean;
  onClose: () => void;
  onMarkReviewed: (sessionId: string) => void;
  onIgnoreRule: (sessionId: string, code: AuditFlagCode) => void;
  onUnignoreRule: (sessionId: string, code: AuditFlagCode) => void;
  onClearReview: (sessionId: string) => void;
};

export const AuditReviewDialog = ({
  session,
  open,
  onClose,
  onMarkReviewed,
  onIgnoreRule,
  onUnignoreRule,
  onClearReview,
}: ReviewDialogProps): React.ReactElement => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  if (!session) {
    return <></>;
  }

  const isReviewed = Boolean(session.reviewedAt);
  const activeFlags = session.flags.filter(
    (f) => !session.ignoredRules.includes(f.code)
  );

  const handleMarkReviewed = (): void => {
    setPendingAction('reviewing');
    onMarkReviewed(session.sessionId);
    setPendingAction(null);
  };

  const handleClearReview = (): void => {
    setPendingAction('clearing');
    onClearReview(session.sessionId);
    setPendingAction(null);
  };

  const handleIgnore = (code: AuditFlagCode): void => {
    onIgnoreRule(session.sessionId, code);
  };

  const handleUnignore = (code: AuditFlagCode): void => {
    onUnignoreRule(session.sessionId, code);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Review session{' '}
            <span className="font-mono text-sm">{session.sessionDate}</span>
          </DialogTitle>
          <DialogDescription>
            {isReviewed
              ? `Reviewed on ${new Date(session.reviewedAt!).toLocaleDateString()}. You can clear the review or manage ignored rules.`
              : `${session.flags.length} audit flag${session.flags.length !== 1 ? 's' : ''} detected. Mark as reviewed once addressed, or ignore specific checks for this session.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {session.flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flags to display.</p>
          ) : (
            session.flags.map((flag) => {
              const isIgnored = session.ignoredRules.includes(flag.code);
              return (
                <div
                  key={flag.code}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Badge
                    variant={SEVERITY_BADGE_VARIANT[flag.severity]}
                    className="shrink-0 mt-0.5 capitalize"
                  >
                    {flag.severity}
                  </Badge>
                  <div className="flex-1 space-y-1 text-sm">
                    <p className="font-medium">{FLAG_CODE_LABEL[flag.code]}</p>
                    <p className="text-muted-foreground text-xs">
                      {flag.message}
                    </p>
                    {isIgnored ? (
                      <p className="text-xs text-muted-foreground italic">
                        This rule is ignored for this session.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant={isIgnored ? 'secondary' : 'outline'}
                    className="shrink-0"
                    onClick={() =>
                      isIgnored ? handleUnignore(flag.code) : handleIgnore(flag.code)
                    }
                    aria-label={
                      isIgnored
                        ? `Stop ignoring ${FLAG_CODE_LABEL[flag.code]} for this session`
                        : `Ignore ${FLAG_CODE_LABEL[flag.code]} for this session`
                    }
                  >
                    {isIgnored ? 'Unignore' : 'Ignore'}
                  </Button>
                </div>
              );
            })
          )}

          {activeFlags.length === 0 && !isReviewed ? (
            <p className="text-sm text-muted-foreground">
              All flags are ignored. You can mark this session as reviewed.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            {isReviewed ? (
              <Button
                variant="secondary"
                onClick={handleClearReview}
                disabled={pendingAction !== null}
                aria-label="Clear reviewed status for this session"
              >
                {pendingAction === 'clearing' ? 'Clearing…' : 'Clear review'}
              </Button>
            ) : (
              <Button
                onClick={handleMarkReviewed}
                disabled={pendingAction !== null}
                aria-label="Mark this session as reviewed"
              >
                {pendingAction === 'reviewing' ? 'Saving…' : 'Mark reviewed'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
