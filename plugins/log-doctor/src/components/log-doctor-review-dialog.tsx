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
  onMarkResolved: (sessionId: string) => void;
  onDismissForNow: (sessionId: string) => void;
  onIgnoreRule: (sessionId: string, code: AuditFlagCode) => void;
  onUnignoreRule: (sessionId: string, code: AuditFlagCode) => void;
};

export const AuditReviewDialog = ({
  session,
  open,
  onClose,
  onMarkResolved,
  onDismissForNow,
  onIgnoreRule,
  onUnignoreRule,
}: ReviewDialogProps): React.ReactElement => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  if (!session) {
    return <></>;
  }

  const isReviewed = Boolean(session.reviewedAt);
  const activeFlags = session.flags.filter(
    (f) => !session.ignoredRules.includes(f.code)
  );

  const handleMarkResolved = (): void => {
    setPendingAction('resolving');
    onMarkResolved(session.sessionId);
    setPendingAction(null);
  };

  const handleDismissForNow = (): void => {
    setPendingAction('dismissing');
    onDismissForNow(session.sessionId);
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
            Resolve session{' '}
            <span className="font-mono text-sm">{session.sessionDate}</span>
          </DialogTitle>
          <DialogDescription>
            {isReviewed
              ? `Resolved on ${new Date(session.reviewedAt!).toLocaleDateString()}.`
              : `${session.flags.length} audit flag${session.flags.length !== 1 ? 's' : ''} detected. Mark fixed when addressed, or dismiss for now to revisit later.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {session.flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No flags to display.
            </p>
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
                        This check is dismissed for this session.
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {activeFlags.length === 0 && !isReviewed ? (
            <p className="text-sm text-muted-foreground">
              All checks are dismissed. You can mark this session as fixed.
            </p>
          ) : null}

          {session.flags.length > 0 ? (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced options
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Dismiss individual checks for this session.
                </p>
                {session.flags.map((flag) => {
                  const isIgnored = session.ignoredRules.includes(flag.code);
                  return (
                    <div
                      key={`advanced-${flag.code}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-xs">{FLAG_CODE_LABEL[flag.code]}</span>
                      <Button
                        size="sm"
                        variant={isIgnored ? 'secondary' : 'outline'}
                        className="shrink-0"
                        onClick={() =>
                          isIgnored
                            ? handleUnignore(flag.code)
                            : handleIgnore(flag.code)
                        }
                        aria-label={
                          isIgnored
                            ? `Undismiss ${FLAG_CODE_LABEL[flag.code]} for this session`
                            : `Dismiss ${FLAG_CODE_LABEL[flag.code]} for this session`
                        }
                      >
                        {isIgnored ? 'Undismiss' : 'Dismiss'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleDismissForNow}
              disabled={pendingAction !== null || activeFlags.length === 0}
              aria-label="Dismiss all checks for now for this session"
            >
              {pendingAction === 'dismissing' ? 'Saving…' : 'Dismiss for now'}
            </Button>
            <Button
              onClick={handleMarkResolved}
              disabled={pendingAction !== null}
              aria-label="Mark this session as fixed"
            >
              {pendingAction === 'resolving' ? 'Saving…' : 'Mark fixed'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
