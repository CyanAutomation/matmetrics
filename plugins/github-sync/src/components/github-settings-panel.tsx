'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Github,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';

import {
  runLoadGitHubSyncHistory,
  SyncResultsDetailPane,
  SyncResultsHistoryList,
  SyncResultsMainPanel,
} from './github-sync-results';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
// user-preferences handled in operations hook
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { getPluginThemeTokens } from '@/components/plugins/plugin-theme';
import {
  PluginActionDestructive,
  PluginActionPrimary,
  PluginActionRow,
  PluginActionSecondary,
  PluginActionTrailing,
} from '@/components/plugins/plugin-action-row';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import {
  deriveGitHubSettingsControlState,
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  resolveClearDialogOutcome,
} from './github-settings-view-model';
// parseGitHubApiResponse is used in the operations hook
import {
  PluginLoadingState,
  PluginEmptyState,
} from '@/components/plugins/plugin-state';
import {
  PluginFormSection,
  PluginStatusPanel,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import { useGitHubSettingsState } from './use-github-settings-state';
import { GitHubRepositoryFields } from './github-repository-fields';
import { useGitHubSettingsOperations } from './use-github-settings-operations';
import GitHubSettingsConnectionForm from './github-settings-connection-form';
import GitHubSettingsHistoryPanel from './github-settings-history-panel';
import GitHubSettingsDangerZone from './github-settings-danger-zone';

export function GitHubSettings() {
  const { user, preferences, canUseGitHubSync, authAvailable } = useAuth();
  const {
    owner,
    setOwner,
    repo,
    setRepo,
    branch,
    setBranch,
    isEnabled,
    setIsEnabled,
    isTesting,
    setIsTesting,
    testResult,
    setTestResult,
    isSyncing,
    setIsSyncing,
    isDisabling,
    setIsDisabling,
    isClearing,
    setIsClearing,
    migrationDone,
    setMigrationDone,
    isClearDialogOpen,
    setIsClearDialogOpen,
    syncHistoryState,
    setSyncHistoryState,
    selectedHistoryPath,
    setSelectedHistoryPath,
  } = useGitHubSettingsState(preferences);
  const [isManagingConnection, setIsManagingConnection] = useState(false);
  const theme = getPluginThemeTokens('info');
  const hasConnectionChanges = useMemo(() => {
    const saved = preferences.gitHub.config;
    return (
      owner.trim() !== (saved?.owner ?? '') ||
      repo.trim() !== (saved?.repo ?? '') ||
      branch.trim() !== (saved?.branch ?? '')
    );
  }, [branch, owner, preferences.gitHub.config, repo]);
  const lastSyncLabel = preferences.gitHub.lastSyncTime
    ? new Date(preferences.gitHub.lastSyncTime).toLocaleString()
    : 'No completed sync yet';
  const {
    handleSaveConfig,
    handleTestConnection,
    handleBulkSync,
    handleDisable,
    handleClear,
  } = useGitHubSettingsOperations({
    owner,
    repo,
    branch,
    isEnabled,
    migrationDone,
    isClearDialogOpen,
    testResult,
    onSetIsEnabled: setIsEnabled,
    onSetIsTesting: setIsTesting,
    onSetTestResult: setTestResult,
    onSetIsSyncing: setIsSyncing,
    onSetIsDisabling: setIsDisabling,
    onSetIsClearing: setIsClearing,
    onSetMigrationDone: setMigrationDone,
    onSetIsClearDialogOpen: setIsClearDialogOpen,
    onSetOwner: setOwner,
    onSetRepo: setRepo,
    onSetBranch: setBranch,
  });

  const handleLoadSyncHistory = async () => {
    if (!owner || !repo) {
      setSyncHistoryState({
        status: 'error',
        message: 'Add a repository owner and name before loading sync history.',
      });
      return;
    }

    await runLoadGitHubSyncHistory({
      owner,
      repo,
      branch: branch.trim() || undefined,
      getHeaders: getAuthHeaders,
      onStateChange: (nextState) => {
        setSyncHistoryState(nextState);
        if (nextState.status === 'success') {
          setSelectedHistoryPath(nextState.data.files[0]?.path ?? null);
        }
      },
    });
  };

  const controlState = deriveGitHubSettingsControlState({
    canUseGitHubSync,
    owner,
    repo,
    isEnabled,
    isTesting,
    isSyncing,
    isSyncHistoryLoading: syncHistoryState.status === 'loading',
    isDisabling,
    isClearing,
    isClearDialogOpen,
  });

  const handleCancelClearDialog = () => {
    const nextState = resolveClearDialogOutcome(
      {
        owner,
        repo,
        branch,
        isEnabled,
        migrationDone,
        isClearDialogOpen,
        testResult,
      },
      'cancel'
    );
    setOwner(nextState.owner);
    setRepo(nextState.repo);
    setBranch(nextState.branch);
    setIsEnabled(nextState.isEnabled);
    setMigrationDone(nextState.migrationDone);
    setTestResult(nextState.testResult);
    setIsClearDialogOpen(nextState.isClearDialogOpen);
  };

  return (
    <PluginPageShell
      title="GitHub Sync"
      description="Keep a safe copy of your training diary in GitHub."
      tone="info"
      icon={<Github className="h-6 w-6" />}
      className="animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {!canUseGitHubSync && (
        <PluginAuthGateNotice
          className={theme.warningTone}
          isAuthenticated={Boolean(user)}
          authAvailable={authAvailable}
          signedInDescription="GitHub sync is only available for signed-in accounts because repository settings are stored per user."
          signedOutDescription="GitHub sync is unavailable because Firebase authentication is not configured for this deployment."
        />
      )}

      {isEnabled && (
        <PluginStatusPanel
          variant="success"
          title="Backup healthy"
          description={`Automatic backup is on for ${owner}/${repo}${branch ? ` · ${branch}` : ''}. Last synced: ${lastSyncLabel}.`}
        />
      )}

      <GitHubSettingsConnectionForm
        owner={owner}
        repo={repo}
        branch={branch}
        isEnabled={isEnabled}
        migrationDone={migrationDone}
        canUseGitHubSync={canUseGitHubSync}
        inputTone={theme.inputTone}
        testResult={testResult}
        isTesting={isTesting}
        hasConnectionChanges={hasConnectionChanges}
        isManagingConnection={isManagingConnection}
        setIsManagingConnection={setIsManagingConnection}
        onOwnerChange={setOwner}
        onRepoChange={setRepo}
        onBranchChange={setBranch}
        onTestConnection={handleTestConnection}
        onSaveConfig={handleSaveConfig}
        controlState={controlState}
      />

      {!isEnabled && (
        <PluginEmptyState
          title="Sync not configured"
          description="No repository is currently configured. Add an owner and repository above, then save your configuration to enable GitHub sync."
          icon={
            <AlertCircle
              className={`h-4 w-4 ${getPluginUiTokenClassNames('icon.subtle')}`}
            />
          }
        />
      )}

      {isEnabled && !migrationDone && (
        <PluginEmptyState
          title="First backup still needed"
          description="New entries will back up automatically. Run one initial sync when you are ready to copy your existing history."
          icon={
            <AlertCircle
              className={`h-4 w-4 ${getPluginUiTokenClassNames('icon.info')}`}
            />
          }
          className={getPluginUiTokenClassNames('tone.inline.info')}
        />
      )}

      {isEnabled && (
        <GitHubSettingsHistoryPanel
          migrationDone={migrationDone}
          handleBulkSync={handleBulkSync}
          handleLoadSyncHistory={handleLoadSyncHistory}
          syncHistoryState={syncHistoryState}
          selectedHistoryPath={selectedHistoryPath}
          setSelectedHistoryPath={setSelectedHistoryPath}
          controlState={controlState}
          isSyncing={isSyncing}
        />
      )}

      {isEnabled && (
        <GitHubSettingsDangerZone
          controlState={controlState}
          handleDisable={handleDisable}
          setIsClearDialogOpen={setIsClearDialogOpen}
          isDisabling={isDisabling}
          isClearing={isClearing}
        />
      )}

      <PluginDestructiveAction
        open={controlState.isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        title="Clear GitHub configuration?"
        description="This removes your saved repository owner, name, and branch settings. GitHub sync will be disabled until you configure it again."
        confirmLabel="Clear Configuration"
        pendingLabel={controlState.clearConfirmationLabel}
        cancelLabel={GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL}
        onConfirm={() => void handleClear()}
        onCancel={handleCancelClearDialog}
        isPending={isClearing}
        confirmDisabled={!controlState.canConfirmClear}
        cancelDisabled={!controlState.canConfirmClear}
      />
    </PluginPageShell>
  );
}
