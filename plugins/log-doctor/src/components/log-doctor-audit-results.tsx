'use client';

import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type AuditResultsProps = {
  results: AuditSessionResult[];
  onReview: (sessionId: string) => void;
};

export const AuditResults = ({
  results,
  onReview,
}: AuditResultsProps): React.ReactElement => {
  const totalFlags = results.reduce((sum, r) => sum + r.flags.length, 0);
  const reviewedCount = results.filter((r) => r.reviewedAt).length;
  const unfilteredCount = results.filter(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  ).length;

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Audit</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No data quality issues found. Run an audit to check your sessions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Session Audit</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Sessions flagged: {results.length}</Badge>
            <Badge variant="outline">Total issues: {totalFlags}</Badge>
            {reviewedCount > 0 ? (
              <Badge variant="secondary">Resolved: {reviewedCount}</Badge>
            ) : null}
            {unfilteredCount > 0 ? (
              <Badge variant="destructive">
                Needs attention: {unfilteredCount}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.map((result) => {
          const activeFlags = result.flags.filter(
            (f) => !result.ignoredRules.includes(f.code)
          );
          const isReviewed = Boolean(result.reviewedAt);
          const allIgnored =
            activeFlags.length === 0 && result.flags.length > 0;

          return (
            <div
              key={result.sessionId}
              className="rounded-md border p-3 text-sm space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">
                    {result.sessionDate}
                  </span>
                  {isReviewed ? (
                    <Badge variant="outline" className="text-xs">
                      Resolved
                    </Badge>
                  ) : allIgnored ? (
                    <Badge variant="secondary" className="text-xs">
                      Dismissed for now
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      {activeFlags.length} issue
                      {activeFlags.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReview(result.sessionId)}
                  aria-label={`Open audit actions for session ${result.sessionDate}`}
                >
                  Open
                </Button>
              </div>

              {activeFlags.length > 0 && !isReviewed ? (
                <ul className="space-y-1 pl-1">
                  {activeFlags.map((flag) => (
                    <li
                      key={flag.code}
                      className="flex items-start gap-2 text-xs"
                    >
                      <Badge
                        variant={SEVERITY_BADGE_VARIANT[flag.severity]}
                        className="shrink-0 capitalize"
                      >
                        {flag.severity}
                      </Badge>
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {FLAG_CODE_LABEL[flag.code]}:{' '}
                        </span>
                        {flag.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {result.ignoredRules.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Dismissed checks:{' '}
                  {result.ignoredRules
                    .map((code) => FLAG_CODE_LABEL[code])
                    .join(', ')}
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
