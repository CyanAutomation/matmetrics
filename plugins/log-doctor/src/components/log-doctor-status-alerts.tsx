'use client';

import React from 'react';

import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
} from '@/components/plugins/plugin-state';

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
      {uiState.phase === 'loading' ? (
        <PluginLoadingState title={statusTitle} description={statusMessage} />
      ) : (
        <PluginEmptyState title={statusTitle} description={statusMessage} />
      )}

      {errorMessage ? (
        <PluginErrorState
          title="Log Doctor error"
          message={errorMessage}
          onRetry={onRetry}
          retryLabel="Retry"
          retryAriaLabel="Retry log doctor scan"
        />
      ) : null}
    </>
  );
};
