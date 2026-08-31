'use client';

import { Button } from '@/components/ui/button';
import {
  Github,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GitHubConfig } from '@/lib/types';
import {
  runLoadGitHubSyncHistory,
  SyncResultsDetailPane,
  SyncResultsHistoryList,
  SyncResultsMainPanel,
} from './github-sync-results';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  clearGitHubConfigPreference,
  saveGitHubSettingsPreference,
} from '@/lib/user-preferences';
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
  buildGitHubNetworkErrorMessage,
  deriveDisableOutcome,
  deriveGitHubSettingsControlState,
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  getGitHubSettingsValidationError,
  resolveClearDialogOutcome,
} from './github-settings-view-model';
import { parseGitHubApiResponse } from './github-settings-api';
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

export function GitHubSettings() {
  const { toast } = useToast();
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
  const theme = getPluginThemeTokens('info');

  const handleSaveConfig = async () => {
    if (!user) return;

    const validationError = getGitHubSettingsValidationError(owner, repo);
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    const normalizedBranch = branch.trim();
    const config: GitHubConfig = {
      owner,
      repo,
      ...(normalizedBranch && { branch: normalizedBranch }),
    };
    await saveGitHubSettingsPreference(user.uid, {
      ...preferences.gitHub,
      config,
      enabled: true,
    });
    setIsEnabled(true);

    toast({
      title: 'Configuration Saved',
      description: `GitHub sync configured for ${owner}/${repo}`,
    });
  };

  const handleTestConnection = async () => {
    const validationError = getGitHubSettingsValidationError(owner, repo);
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner,
          repo,
          branch: branch.trim() || undefined,
        }),
      });

      const result = await parseGitHubApiResponse(
        response,
        'Unable to validate this repository right now. Please try again.'
      );
      setTestResult(result);

      if (result.success) {
        toast({
          title: 'Connection Successful',
          description: `Connected to ${owner}/${repo}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: buildGitHubNetworkErrorMessage(
          'Network error while testing connection',
          error
        ),
      });
      toast({
        title: 'Network Error',
        description:
          'We could not reach the server to test your GitHub connection.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleBulkSync = async () => {
    if (!user) return;

    if (!isEnabled || !owner || !repo) {
      toast({
        title: 'Error',
        description: 'Please configure and enable GitHub sync first.',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/sync-all', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner,
          repo,
          branch: branch.trim() || undefined,
        }),
      });

      const result = await parseGitHubApiResponse(
        response,
        'Sync failed due to an unexpected server response. Please try again.'
      );

      if (result.success) {
        await saveGitHubSettingsPreference(user.uid, {
          ...preferences.gitHub,
          config: {
            owner,
            repo,
            ...(branch.trim() ? { branch: branch.trim() } : {}),
          },
          enabled: true,
          migrationDone: true,
          syncStatus: 'success',
          lastSyncTime: new Date().toISOString(),
        });
        setMigrationDone(true);
        toast({
          title: 'Bulk Sync Complete',
          description: result.message,
        });
      } else {
        toast({
          title: response.ok ? 'Sync Failed' : 'Server Error',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Network Error',
        description: buildGitHubNetworkErrorMessage(
          'Bulk sync request failed',
          error
        ),
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisable = async () => {
    if (!user) return;
    setIsDisabling(true);
    try {
      await saveGitHubSettingsPreference(user.uid, {
        ...preferences.gitHub,
        enabled: false,
      });
      const nextState = deriveDisableOutcome({
        owner,
        repo,
        branch,
        isEnabled,
        migrationDone,
        isClearDialogOpen,
        testResult,
      });
      setIsEnabled(nextState.isEnabled);
      toast({
        title: 'Sync Disabled',
        description: 'GitHub sync has been turned off.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Server Error',
        description: `Unable to disable GitHub sync: ${message}`,
        variant: 'destructive',
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleClear = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
      await clearGitHubConfigPreference(user.uid);
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
        'confirm'
      );
      setOwner(nextState.owner);
      setRepo(nextState.repo);
      setBranch(nextState.branch);
      setIsEnabled(nextState.isEnabled);
      setTestResult(nextState.testResult);
      setMigrationDone(nextState.migrationDone);
      setIsClearDialogOpen(nextState.isClearDialogOpen);
      toast({
        title: 'Configuration Cleared',
        description: 'GitHub repository settings were removed.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Server Error',
        description: `Unable to clear GitHub settings: ${message}`,
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

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
          title="Backup is on"
          description={`New and updated sessions are backed up automatically to ${owner}/${repo}${branch ? ` · ${branch}` : ''}.`}
        />
      )}

      <PluginFormSection
        title={isEnabled ? 'Backup connection' : 'Connect a repository'}
        description={
          isEnabled
            ? `Backing up to ${owner}/${repo}. Manage the destination only when it changes.`
            : 'Choose where new and updated training sessions should be backed up.'
        }
        footerActions={
          <PluginActionRow>
            <PluginActionSecondary>
              <Button
                onClick={() => void handleTestConnection()}
                disabled={!controlState.canTestConnection}
                variant="outline"
                className="gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {controlState.testConnectionLabel}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </PluginActionSecondary>

            <PluginActionPrimary>
              <Button
                onClick={() => void handleSaveConfig()}
                disabled={!canUseGitHubSync || !owner || !repo}
              >
                {isEnabled ? 'Save changes' : 'Connect repository'}
              </Button>
            </PluginActionPrimary>
          </PluginActionRow>
        }
      >
        {isEnabled ? (
          <details className="rounded-lg border bg-muted/20 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Manage backup connection
            </summary>
            <div className="mt-4">
              <GitHubRepositoryFields
                owner={owner}
                repo={repo}
                branch={branch}
                isEnabled={isEnabled}
                migrationDone={migrationDone}
                canUseGitHubSync={canUseGitHubSync}
                inputTone={theme.inputTone}
                testResult={testResult}
                onOwnerChange={setOwner}
                onRepoChange={setRepo}
                onBranchChange={setBranch}
              />
            </div>
          </details>
        ) : (
          <GitHubRepositoryFields
            owner={owner}
            repo={repo}
            branch={branch}
            isEnabled={isEnabled}
            migrationDone={migrationDone}
            canUseGitHubSync={canUseGitHubSync}
            inputTone={theme.inputTone}
            testResult={testResult}
            onOwnerChange={setOwner}
            onRepoChange={setRepo}
            onBranchChange={setBranch}
          />
        )}
      </PluginFormSection>

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
          title="Your backup is ready for its first sync"
          description="New entries will sync automatically. Run one initial sync now to copy your existing training history."
          icon={
            <AlertCircle
              className={`h-4 w-4 ${getPluginUiTokenClassNames('icon.info')}`}
            />
          }
          className={getPluginUiTokenClassNames('tone.inline.info')}
        />
      )}

      {/* Bulk Sync Section */}
      {isEnabled && !migrationDone && (
        <PluginFormSection
          title="First backup"
          description="Copy your existing sessions once; future changes will sync automatically."
        >
          <p
            className={`mb-4 text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
          >
            This creates the training-log folder structure in your repository.
          </p>
          <Button
            onClick={() => void handleBulkSync()}
            disabled={!controlState.canRunSyncAll}
            className="gap-2"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {controlState.syncAllLabel}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Start first backup
              </>
            )}
          </Button>
        </PluginFormSection>
      )}

      {isEnabled && (
        <PluginTableSection
          title="Recent backup activity"
          description="Open an entry only when you need to troubleshoot a backup."
          hasRows={true}
          emptyTitle="No sync history"
          emptyDescription="Load sync history to inspect recent run details."
          headerActions={
            <Button
              variant="outline"
              onClick={() => void handleLoadSyncHistory()}
              disabled={!controlState.canRefreshHistory}
              className="gap-2"
            >
              {syncHistoryState.status === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {controlState.refreshHistoryLabel}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {controlState.refreshHistoryLabel}
                </>
              )}
            </Button>
          }
        >
          {syncHistoryState.status === 'loading' ? (
            <PluginLoadingState description="Loading sync history and per-file diagnostics." />
          ) : (
            <>
              <SyncResultsMainPanel
                state={syncHistoryState}
                onRetry={() => void handleLoadSyncHistory()}
                onRunSync={() => void handleBulkSync()}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">History list</h4>
                  <SyncResultsHistoryList
                    state={syncHistoryState}
                    selectedPath={selectedHistoryPath}
                    onSelect={setSelectedHistoryPath}
                    onRetry={() => void handleLoadSyncHistory()}
                  />
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Detail pane</h4>
                  <SyncResultsDetailPane
                    state={syncHistoryState}
                    selectedPath={selectedHistoryPath}
                    onRetry={() => void handleLoadSyncHistory()}
                  />
                </div>
              </div>
            </>
          )}
        </PluginTableSection>
      )}

      {/* Success State */}
      {isEnabled && migrationDone && (
        <PluginStatusPanel
          variant="success"
          title="GitHub Sync Active"
          description={
            syncHistoryState.status === 'success'
              ? 'Your latest sync completed successfully. New sessions will sync automatically.'
              : 'Automatic sync is enabled. Run sync once to confirm the current repository status.'
          }
          className={getPluginUiTokenClassNames('tone.inline.info')}
        />
      )}

      {isEnabled && (
        <PluginFormSection
          title="Danger zone"
          description="These actions stop syncing or remove the saved repository connection. Your existing training records are not deleted."
          className="border-destructive/30"
          footerActions={
            <PluginActionRow>
              <PluginActionDestructive>
                <Button
                  onClick={() => void handleDisable()}
                  disabled={!controlState.canDisableSync}
                  variant="outline"
                  className={`gap-2 ${getPluginUiTokenClassNames('action.destructive')}`}
                >
                  {isDisabling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {isDisabling ? controlState.disableLabel : 'Disable sync'}
                </Button>
              </PluginActionDestructive>
              <PluginActionTrailing>
                <Button
                  onClick={() => setIsClearDialogOpen(true)}
                  disabled={!controlState.canOpenClearDialog}
                  variant="ghost"
                  size="sm"
                  className={`gap-2 ${getPluginUiTokenClassNames('action.subtle')}`}
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Clear saved connection
                </Button>
              </PluginActionTrailing>
            </PluginActionRow>
          }
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
