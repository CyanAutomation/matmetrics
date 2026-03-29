export type GitHubSettingsControlState = {
  canUseGitHubSync: boolean;
  owner: string;
  repo: string;
  isEnabled: boolean;
  isTesting: boolean;
  isSyncing: boolean;
  isSyncHistoryLoading: boolean;
  isDisabling: boolean;
  isClearing: boolean;
  isClearDialogOpen: boolean;
};

export const GITHUB_SYNC_HISTORY_REFRESH_LABEL = 'Refresh history';
export const GITHUB_SYNC_HISTORY_REFRESH_LOADING_LABEL = 'Loading history…';
export const GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL = 'Cancel';
export const GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL =
  'Clear Configuration';

export const getGitHubSettingsValidationError = (
  owner: string,
  repo: string
): string | null => {
  if (!owner.trim() || !repo.trim()) {
    return 'Please enter both GitHub owner and repository name.';
  }

  return null;
};

export const deriveGitHubSettingsControlState = (
  state: GitHubSettingsControlState
) => {
  const hasRepoIdentity = Boolean(state.owner.trim() && state.repo.trim());

  return {
    canTestConnection:
      state.canUseGitHubSync && !state.isTesting && hasRepoIdentity,
    canRunSyncAll: state.canUseGitHubSync && !state.isSyncing,
    canRefreshHistory:
      state.canUseGitHubSync && !state.isSyncHistoryLoading,
    canDisableSync:
      state.canUseGitHubSync && !state.isDisabling && !state.isClearing,
    canOpenClearDialog:
      state.canUseGitHubSync && !state.isDisabling && !state.isClearing,
    canConfirmClear: !state.isClearing,
    testConnectionLabel: state.isTesting ? 'Testing...' : 'Test Connection',
    syncAllLabel: state.isSyncing
      ? 'Syncing...'
      : 'Sync All Sessions to GitHub',
    disableLabel: state.isDisabling ? 'Disabling...' : 'Disable Sync',
    clearLabel: state.isClearing ? 'Clearing...' : 'Clear',
    refreshHistoryLabel: state.isSyncHistoryLoading
      ? GITHUB_SYNC_HISTORY_REFRESH_LOADING_LABEL
      : GITHUB_SYNC_HISTORY_REFRESH_LABEL,
    clearConfirmationLabel: state.isClearing
      ? 'Clearing...'
      : GITHUB_SETTINGS_DESTRUCTIVE_CONFIRM_LABEL,
    isClearDialogOpen: state.isClearDialogOpen,
    hasRepoIdentity,
    showConnectedState: state.isEnabled,
  };
};

export const buildGitHubNetworkErrorMessage = (
  actionLabel: string,
  error: unknown
): string => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return `${actionLabel}: ${message}`;
};

export type GitHubSettingsDestructiveState = {
  owner: string;
  repo: string;
  branch: string;
  isEnabled: boolean;
  migrationDone: boolean;
  isClearDialogOpen: boolean;
  testResult: { success: boolean; message: string } | null;
};

export const deriveDisableOutcome = (
  state: GitHubSettingsDestructiveState
): GitHubSettingsDestructiveState => ({
  ...state,
  isEnabled: false,
});

export const deriveClearOutcome = (
  state: GitHubSettingsDestructiveState
): GitHubSettingsDestructiveState => ({
  ...state,
  owner: '',
  repo: '',
  branch: '',
  isEnabled: false,
  testResult: null,
  migrationDone: false,
  isClearDialogOpen: false,
});

export const resolveClearDialogOutcome = (
  state: GitHubSettingsDestructiveState,
  action: 'confirm' | 'cancel'
): GitHubSettingsDestructiveState =>
  action === 'confirm'
    ? deriveClearOutcome(state)
    : {
        ...state,
        isClearDialogOpen: false,
      };
