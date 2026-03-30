'use client';

import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  AUDIT_FLAG_PRESENTATION,
  groupAuditFlagsByHeading,
} from './log-doctor-audit-flag-content';
import type { AuditSessionResult } from './log-doctor-state';

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
          const groupedFlags = groupAuditFlagsByHeading(activeFlags);

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
                  aria-label={`Open session ${result.sessionDate} to edit`}
                >
                  Open session to edit
                </Button>
              </div>

              {activeFlags.length > 0 && !isReviewed ? (
                <div className="space-y-3 pl-1">
                  {Object.entries(groupedFlags).map(([heading, flags]) => (
                    <section key={heading} className="space-y-1">
                      <p className="text-xs font-semibold tracking-wide text-foreground">
                        {heading}
                      </p>
                      <ul className="space-y-1">
                        {flags.map((flag) => (
                          <li
                            key={flag.code}
                            className="rounded-sm border border-border/60 p-2"
                          >
                            <p className="text-xs font-medium">
                              {AUDIT_FLAG_PRESENTATION[flag.code].label}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {flag.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium text-foreground">
                                How to fix this:
                              </span>{' '}
                              {AUDIT_FLAG_PRESENTATION[flag.code].helperText}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wide">
                              Severity: {flag.severity}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}

              {result.ignoredRules.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Dismissed checks:{' '}
                  {result.ignoredRules
                    .map((code) => AUDIT_FLAG_PRESENTATION[code].label)
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
