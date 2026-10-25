'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { waitForGitHubJobResponse } from '@/lib/github-background-jobs.client';

import { runLoadGitHubSyncHistory } from './github-sync-results';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
// user-preferences handled in operations hook
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { getPluginThemeTokens } from '@/components/plugins/plugin-theme';

import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import {
  deriveGitHubSettingsControlState,
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  resolveClearDialogOutcome,
} from './github-settings-view-model';
// parseGitHubApiResponse is used in the operations hook
import { PluginEmptyState } from '@/components/plugins/plugin-state';
import {
  PluginFormSection,
  PluginStatusPanel,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import { useGitHubSettingsState } from './use-github-settings-state';
import { useGitHubSettingsOperations } from './use-github-settings-operations';
import GitHubSettingsConnectionForm from './github-settings-connection-form';
import GitHubSettingsHistoryPanel from './github-settings-history-panel';
import GitHubSettingsDangerZone from './github-settings-danger-zone';

export function GitHubSettings() {
  const { user, preferences, canUseGitHubSync, authAvailable } = useAuth();
  const userId = user?.uid;
  const { toast } = useToast();
  const [keikoMode, setKeikoMode] = useState<'loading' | 'legacy' | 'keiko' | 'unavailable'>(user ? 'loading' : 'legacy');
  const [keikoInstallation, setKeikoInstallation] = useState<{ owner: string; repository: string } | null>(null);
  const [keikoOperation, setKeikoOperation] = useState<'connect' | 'disconnect' | 'health' | 'sync' | null>(null);
  const [keikoMessage, setKeikoMessage] = useState<string | null>(null);
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

  const refreshKeikoInstallation = useCallback(async () => {
    if (!userId) {
      setKeikoMode('legacy');
      return;
    }
    setKeikoMode('loading');
    setKeikoInstallation(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/github/installation', { headers, cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== 'object' || !('cutover' in payload)) {
        throw new Error('GitHub App connection status is unavailable');
      }
      if (payload.cutover !== true) {
        setKeikoInstallation(null);
        setKeikoMode('legacy');
        return;
      }
      const installation = 'installation' in payload && payload.installation && typeof payload.installation === 'object'
        ? payload.installation as Record<string, unknown>
        : null;
      setKeikoInstallation(installation && typeof installation.owner === 'string' && typeof installation.repository === 'string'
        ? { owner: installation.owner, repository: installation.repository }
        : null);
      setKeikoMode('keiko');
    } catch {
      setKeikoMode('unavailable');
    }
  }, [userId]);

  useEffect(() => {
    void refreshKeikoInstallation();
  }, [refreshKeikoInstallation]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('githubBackup');
    if (result !== 'connected' && result !== 'failed') return;

    setKeikoMessage(result === 'connected'
      ? 'GitHub backup repository connected.'
      : 'GitHub connection did not complete. Check the selected repository and try again.');
    url.searchParams.delete('githubBackup');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  const handleKeikoInstall = async () => {
    setKeikoOperation('connect');
    setKeikoMessage(null);
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/github/installation', { method: 'POST', headers, body: '{}' });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== 'object' || !('url' in payload) || typeof payload.url !== 'string') {
        throw new Error('Unable to start the GitHub App connection');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setKeikoMessage(error instanceof Error ? error.message : 'Unable to start the GitHub App connection');
    } finally {
      setKeikoOperation(null);
    }
  };

  const handleKeikoDisconnect = async () => {
    setKeikoOperation('disconnect');
    setKeikoMessage(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/github/installation', { method: 'DELETE', headers });
      if (!response.ok) throw new Error('Unable to disconnect the GitHub App');
      setKeikoInstallation(null);
      toast({ title: 'GitHub App disconnected', description: 'Your Keiko backup connection was removed.' });
    } catch (error) {
      setKeikoMessage(error instanceof Error ? error.message : 'Unable to disconnect the GitHub App');
    } finally {
      setKeikoOperation(null);
    }
  };

  const runKeikoOperation = async (operation: 'health' | 'sync') => {
    setKeikoOperation(operation);
    setKeikoMessage(null);
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(operation === 'health' ? '/api/github/validate' : '/api/github/sync-all', {
        method: 'POST', headers, body: '{}',
      });
      const result = await waitForGitHubJobResponse(response, { getAuthHeaders });
      const success = result && typeof result === 'object' && 'success' in result && result.success === true;
      const message = result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
        ? result.message
        : operation === 'health' ? 'GitHub connection is healthy.' : 'GitHub backup completed.';
      if (!success) throw new Error(message);
      setKeikoMessage(message);
      toast({ title: operation === 'health' ? 'Connection Successful' : 'Backup Complete', description: message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub operation failed';
      setKeikoMessage(message);
      toast({ title: 'GitHub operation failed', description: message, variant: 'destructive' });
    } finally {
      setKeikoOperation(null);
    }
  };
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

  const historyHasRows = Boolean(
    syncHistoryState &&
    syncHistoryState.status === 'success' &&
    syncHistoryState.data.files.length > 0
  );

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
      title="Backup"
      description="Keep a safe copy of your training diary in GitHub."
      tone="info"
      icon={<GitBranch className="h-6 w-6" />}
      className="animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {!canUseGitHubSync && (
        <PluginAuthGateNotice
          className={theme.warningTone}
          isAuthenticated={Boolean(user)}
          authAvailable={authAvailable}
          signedInDescription="GitHub sync is only available for signed-in accounts because repository settings are stored per user."
          signedOutDescription="Sign in to configure GitHub backup for your account."
          authUnavailableDescription="GitHub backup is unavailable because authentication is not configured for this deployment."
        />
      )}

      {keikoMode === 'keiko' && (
        <PluginFormSection
          title="GitHub App connection"
          description="Choose one repository for your Keiko backups. Your current target stays active until GitHub confirms a replacement."
          footerActions={
            <div className="flex flex-wrap gap-2">
              {keikoInstallation ? (
                <>
                  <Button type="button" variant="outline" disabled={keikoOperation !== null} onClick={() => void runKeikoOperation('health')}>
                    {keikoOperation === 'health' ? 'Checking…' : 'Test connection'}
                  </Button>
                  <Button type="button" disabled={keikoOperation !== null} onClick={() => void runKeikoOperation('sync')}>
                    {keikoOperation === 'sync' ? 'Backing up…' : 'Back up all sessions'}
                  </Button>
                  <Button type="button" variant="outline" disabled={keikoOperation !== null} onClick={() => void handleKeikoInstall()}>
                    {keikoOperation === 'connect' ? 'Connecting…' : 'Change repository'}
                  </Button>
                  <Button type="button" variant="outline" disabled={keikoOperation !== null} onClick={() => void handleKeikoDisconnect()}>
                    {keikoOperation === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </>
              ) : (
                <Button type="button" disabled={!canUseGitHubSync || keikoOperation !== null} onClick={() => void handleKeikoInstall()}>
                  {keikoOperation === 'connect' ? 'Connecting…' : 'Connect GitHub App'}
                </Button>
              )}
            </div>
          }
        >
          {keikoInstallation ? (
            <PluginStatusPanel variant="success" title="Repository connected" description={`${keikoInstallation.owner}/${keikoInstallation.repository}`} />
          ) : (
            <PluginEmptyState title="No GitHub App connected" description="Connect one repository to enable Keiko backups and Log Doctor." />
          )}
          {keikoMessage && <p role="status" className="text-sm">{keikoMessage}</p>}
        </PluginFormSection>
      )}

      {keikoMode === 'loading' && user && <PluginStatusPanel variant="warning" title="Checking backup connection" description="Loading the account’s GitHub connection." />}
      {keikoMode === 'unavailable' && <PluginStatusPanel variant="error" title="Backup connection unavailable" description="Could not load the GitHub App connection. Retry by reloading this page." />}

      {keikoMode === 'legacy' && isEnabled && (
        <PluginStatusPanel
          variant="success"
          title="Backup healthy"
          description={`Automatic backup is on for ${owner}/${repo}${branch ? ` · ${branch}` : ''}. Last synced: ${lastSyncLabel}.`}
        />
      )}

      {keikoMode === 'legacy' && <PluginFormSection
        title="Connection"
        description="Repository and branch settings"
      >
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
      </PluginFormSection>}

      {keikoMode === 'legacy' && !isEnabled && (
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

      {keikoMode === 'legacy' && isEnabled && !migrationDone && (
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

      {keikoMode === 'legacy' && isEnabled && (
        <PluginTableSection
          title="Troubleshooting and activity"
          description="Troubleshooting and activity"
          hasRows={historyHasRows}
          emptyTitle="No sync history"
          emptyDescription="Load sync history to inspect recent run details."
        >
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
        </PluginTableSection>
      )}

      {keikoMode === 'legacy' && isEnabled && (
        <GitHubSettingsDangerZone
          controlState={controlState}
          handleDisable={handleDisable}
          setIsClearDialogOpen={setIsClearDialogOpen}
          isDisabling={isDisabling}
          isClearing={isClearing}
        />
      )}

      {keikoMode === 'legacy' && <PluginDestructiveAction
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
      />}
    </PluginPageShell>
  );
}
