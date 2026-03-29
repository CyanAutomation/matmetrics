'use client';

import React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import type { LogDoctorUiState } from './log-doctor-state';

export type LogDoctorStatusAlertsProps = {
  uiState: LogDoctorUiState;
  errorMessage: string | null;
  onRetry: () => void;
};

export const LogDoctorStatusAlerts = ({
  uiState,
  errorMessage,
  onRetry,
}: LogDoctorStatusAlertsProps): React.ReactElement => {
  const hasDetailedError = Boolean(errorMessage);
  const statusTitle =
    uiState.phase === 'loading'
      ? 'Log Doctor is running'
      : uiState.phase === 'error' && !hasDetailedError
        ? 'Recovery available'
        : 'Status';
  const statusMessage =
    uiState.phase === 'error' && hasDetailedError
      ? 'An actionable error is shown below. Use Retry to run the scan again.'
      : uiState.message;

  return (
    <>
      <Alert>
        <AlertTitle>{statusTitle}</AlertTitle>
        <AlertDescription>{statusMessage}</AlertDescription>
      </Alert>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Log Doctor error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              aria-label="Retry log doctor scan"
            >
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}
    </>
  );
};
