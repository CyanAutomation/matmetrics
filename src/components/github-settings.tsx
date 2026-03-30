'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Github,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GitHubConfig } from '@/lib/types';
import {
  runLoadGitHubSyncHistory,
  SyncResultsDetailPane,
  SyncResultsHistoryList,
  SyncResultsMainPanel,
  type GitHubSyncHistoryData,
  type GitHubSyncSurfaceState,
} from '@/components/github-sync-results';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  clearGitHubConfigPreference,
  saveGitHubSettingsPreference,
} from '@/lib/user-preferences';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginNotice } from '@/components/plugins/plugin-notice';
import { getPluginThemeTokens } from '@/components/plugins/plugin-theme';
import {
  buildGitHubNetworkErrorMessage,
  deriveDisableOutcome,
  deriveGitHubSettingsControlState,
  GITHUB_SETTINGS_DESTRUCTIVE_CANCEL_LABEL,
  getGitHubSettingsValidationError,
  resolveClearDialogOutcome,
} from '@/components/github-settings-view-model';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';

export function GitHubSettings() {
  const { toast } = useToast();
  const { user, preferences, canUseGitHubSync, authAvailable } = useAuth();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [syncHistoryState, setSyncHistoryState] = useState<
    GitHubSyncSurfaceState<GitHubSyncHistoryData>
  >({ status: 'idle' });
  const [selectedHistoryPath, setSelectedHistoryPath] = useState<string | null>(
    null
  );
  const theme = getPluginThemeTokens('info');

  useEffect(() => {
    const config = preferences.gitHub.config;
    const enabled = preferences.gitHub.enabled;
    const migrationDoneValue = preferences.gitHub.migrationDone;

    if (config) {
      setOwner(config.owner);
      setRepo(config.repo);
      setBranch(config.branch ?? '');
    } else {
      setOwner('');
      setRepo('');
      setBranch('');
    }
    setIsEnabled(enabled);
    setMigrationDone(migrationDoneValue);
  }, [preferences.gitHub]);

  const parseApiResponse = async (
    response: Response,
    fallbackMessage: string
  ): Promise<{ success: boolean; message: string }> => {
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      if (!response.ok) {
        return {
          success: false,
          message: `Server error (${response.status}). ${fallbackMessage}`,
        };
      }
      return {
        success: true,
        message: fallbackMessage,
      };
    }

    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string' &&
      payload.message.trim()
        ? payload.message
        : fallbackMessage;

    const success =
      payload &&
      typeof payload === 'object' &&
      'success' in payload &&
      typeof payload.success === 'boolean'
        ? payload.success
        : response.ok;

    return { success, message };
  };

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

      const result = await parseApiResponse(
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

      const result = await parseApiResponse(
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
      title="GitHub Repository Configuration"
      description="Configure where your training sessions will be synced."
      tone="info"
      icon={<Github className="h-6 w-6" />}
      notice={
        <PluginNotice
          tone="info"
          icon={<Github className="h-4 w-4" />}
          title="GitHub Sync"
          description="Sync your Judo training sessions to a personal GitHub repository. Sessions are stored as markdown files and synced automatically when you create or update entries."
        />
      }
      className="animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      {!canUseGitHubSync && (
        <Alert className={theme.warningTone}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-bold">Sign-in required</AlertTitle>
          <AlertDescription className="text-current/90">
            {authAvailable
              ? 'GitHub sync is only available for signed-in accounts because repository settings are stored per user.'
              : 'GitHub sync is unavailable because Firebase authentication is not configured for this deployment.'}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-card/95 shadow-sm">
        <CardContent className="space-y-6 p-6 pt-8">
          {/* Configuration Information */}
          <div className="bg-amber-50/85 border border-amber-200/40 rounded-lg p-4">
            <p className="text-sm text-amber-900 font-semibold mb-2">
              Setup Requirements:
            </p>
            <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
              <li>
                Add{' '}
                <code className="bg-amber-100 px-2 py-1 rounded">
                  GITHUB_TOKEN
                </code>{' '}
                to your Vercel environment variables
              </li>
              <li>
                Token must have{' '}
                <code className="bg-amber-100 px-2 py-1 rounded">repo</code>{' '}
                permissions
              </li>
              <li>Repository will be created or used if it already exists</li>
            </ul>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner" className="text-sm font-semibold">
                  GitHub Owner/Username
                </Label>
                <Input
                  id="owner"
                  placeholder="e.g., CyanAutomation"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  disabled={!canUseGitHubSync || (isEnabled && migrationDone)}
                  className="border-primary/25 focus:border-primary/45"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo" className="text-sm font-semibold">
                  Repository Name
                </Label>
                <Input
                  id="repo"
                  placeholder="e.g., my-judo-diary"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  disabled={!canUseGitHubSync || (isEnabled && migrationDone)}
                  className="border-primary/25 focus:border-primary/45"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch" className="text-sm font-semibold">
                  Branch (optional)
                </Label>
                <Input
                  id="branch"
                  placeholder="e.g., main, master, sync"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={!canUseGitHubSync || (isEnabled && migrationDone)}
                  className="border-primary/25 focus:border-primary/45"
                />
              </div>
            </div>

            {/* Status */}
            {isEnabled && (
              <PluginSuccessState
                title="Repository connected"
                description={
                  <>
                    Connected to <strong>{owner}</strong>/
                    <strong>{repo}</strong>
                    {branch.trim() ? (
                      <>
                        {' '}
                        on branch <strong>{branch.trim()}</strong>
                      </>
                    ) : (
                      <> on repository default branch</>
                    )}
                  </>
                }
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              />
            )}

            {testResult && !testResult.success && (
              <PluginErrorState
                title="Connection test failed"
                message={testResult.message}
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
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

            <Button
              onClick={() => void handleSaveConfig()}
              disabled={!canUseGitHubSync || !owner || !repo || isEnabled}
            >
              Save Configuration
            </Button>

            {isEnabled && (
              <Button
                onClick={() => void handleDisable()}
                disabled={!controlState.canDisableSync}
                variant="outline"
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                {isDisabling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {controlState.disableLabel}
                  </>
                ) : (
                  'Disable Sync'
                )}
              </Button>
            )}

            {isEnabled && (
              <Button
                onClick={() => setIsClearDialogOpen(true)}
                disabled={!controlState.canOpenClearDialog}
                variant="ghost"
                size="sm"
                className="gap-2 text-gray-600 ml-auto"
              >
                {isClearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {controlState.clearLabel}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!isEnabled && (
        <PluginEmptyState
          title="Sync not configured"
          description="No repository is currently configured. Add an owner and repository above, then save your configuration to enable GitHub sync."
          icon={<AlertCircle className="h-4 w-4 text-slate-600" />}
        />
      )}

      {isEnabled && !migrationDone && (
        <PluginEmptyState
          title="Initial sync pending"
          description="GitHub sync is enabled, but existing sessions have not been pushed yet. Run initial sync below to backfill your current training history."
          icon={<AlertCircle className="h-4 w-4 text-purple-700" />}
          className="border-purple-200 bg-purple-50"
        />
      )}

      {/* Bulk Sync Section */}
      {isEnabled && !migrationDone && (
        <Card className="bg-card/95 shadow-sm">
          <CardHeader className="bg-secondary/45">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 text-white rounded-lg shadow-md">
                <RefreshCw className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Initial Sync</CardTitle>
                <CardDescription>
                  Push all existing sessions to your GitHub repository
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-8">
            <p className="text-sm text-gray-700 mb-4">
              Click below to sync all your existing training sessions to GitHub.
              This is a one-time operation and will create the folder structure
              in your repository.
            </p>
            <Button
              onClick={() => void handleBulkSync()}
              disabled={!controlState.canRunSyncAll}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {controlState.syncAllLabel}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync All Sessions to GitHub
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {isEnabled && (
        <Card className="bg-card/95 shadow-sm">
          <CardHeader className="bg-secondary/45">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Sync History & Results</CardTitle>
                <CardDescription>
                  Inspect sync results and per-file diagnostics.
                </CardDescription>
              </div>
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
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  onRunSync={() => void handleBulkSync()}
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
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {isEnabled && migrationDone && (
        <Card className="bg-green-50/90 border border-green-200/40">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">
                  GitHub Sync Active
                </p>
                <p className="text-sm text-green-800">
                  All existing sessions have been synced. New sessions will sync
                  automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PluginConfirmationDialog
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
