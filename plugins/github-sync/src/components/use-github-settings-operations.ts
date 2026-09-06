'use client';

import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import type { GitHubConfig } from '@/lib/types';
import {
  clearGitHubConfigPreference,
  saveGitHubSettingsPreference,
} from '@/lib/user-preferences';
import {
  buildGitHubNetworkErrorMessage,
  deriveDisableOutcome,
  getGitHubSettingsValidationError,
  resolveClearDialogOutcome,
} from './github-settings-view-model';
import { parseGitHubApiResponse } from './github-settings-api';

interface UseGitHubSettingsOperationsProps {
  owner: string;
  repo: string;
  branch: string;
  isEnabled: boolean;
  migrationDone: boolean;
  isClearDialogOpen: boolean;
  testResult: { success: boolean; message: string } | null;
  onSetIsEnabled: (enabled: boolean) => void;
  onSetIsTesting: (testing: boolean) => void;
  onSetTestResult: (result: { success: boolean; message: string } | null) => void;
  onSetIsSyncing: (syncing: boolean) => void;
  onSetIsDisabling: (disabling: boolean) => void;
  onSetIsClearing: (clearing: boolean) => void;
  onSetMigrationDone: (done: boolean) => void;
  onSetIsClearDialogOpen: (open: boolean) => void;
  onSetOwner: (owner: string) => void;
  onSetRepo: (repo: string) => void;
  onSetBranch: (branch: string) => void;
}

/**
 * Custom hook that consolidates GitHub settings API operations.
 * Extracts save, test, sync, disable, and clear handlers.
 */
export function useGitHubSettingsOperations({
  owner,
  repo,
  branch,
  isEnabled,
  migrationDone,
  isClearDialogOpen,
  testResult,
  onSetIsEnabled,
  onSetIsTesting,
  onSetTestResult,
  onSetIsSyncing,
  onSetIsDisabling,
  onSetIsClearing,
  onSetMigrationDone,
  onSetIsClearDialogOpen,
  onSetOwner,
  onSetRepo,
  onSetBranch,
}: UseGitHubSettingsOperationsProps) {
  const { toast } = useToast();
  const { user, preferences } = useAuth();

  const handleSaveConfig = useCallback(async () => {
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
    onSetIsEnabled(true);

    toast({
      title: 'Configuration Saved',
      description: `GitHub sync configured for ${owner}/${repo}`,
    });
  }, [owner, repo, branch, user, preferences.gitHub, toast, onSetIsEnabled]);

  const handleTestConnection = useCallback(async () => {
    const validationError = getGitHubSettingsValidationError(owner, repo);
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    onSetIsTesting(true);
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
      onSetTestResult(result);

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
      onSetTestResult({
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
      onSetIsTesting(false);
    }
  }, [
    owner,
    repo,
    branch,
    onSetIsTesting,
    onSetTestResult,
    toast,
  ]);

  const handleBulkSync = useCallback(async () => {
    if (!user) return;

    if (!isEnabled || !owner || !repo) {
      toast({
        title: 'Error',
        description: 'Please configure and enable GitHub sync first.',
        variant: 'destructive',
      });
      return;
    }

    onSetIsSyncing(true);
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
        onSetMigrationDone(true);
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
      onSetIsSyncing(false);
    }
  }, [
    user,
    isEnabled,
    owner,
    repo,
    branch,
    preferences.gitHub,
    onSetIsSyncing,
    onSetMigrationDone,
    toast,
  ]);

  const handleDisable = useCallback(async () => {
    if (!user) return;
    onSetIsDisabling(true);
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
      onSetIsEnabled(nextState.isEnabled);
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
      onSetIsDisabling(false);
    }
  }, [
    user,
    owner,
    repo,
    branch,
    isEnabled,
    migrationDone,
    isClearDialogOpen,
    testResult,
    preferences.gitHub,
    toast,
    onSetIsDisabling,
    onSetIsEnabled,
  ]);

  const handleClear = useCallback(async () => {
    if (!user) return;
    onSetIsClearing(true);
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
      onSetOwner(nextState.owner);
      onSetRepo(nextState.repo);
      onSetBranch(nextState.branch);
      onSetIsEnabled(nextState.isEnabled);
      onSetMigrationDone(nextState.migrationDone);
      onSetIsClearDialogOpen(false);
      toast({
        title: 'Configuration Cleared',
        description: 'GitHub sync configuration has been reset.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Server Error',
        description: `Unable to clear GitHub configuration: ${message}`,
        variant: 'destructive',
      });
    } finally {
      onSetIsClearing(false);
    }
  }, [
    user,
    owner,
    repo,
    branch,
    isEnabled,
    migrationDone,
    isClearDialogOpen,
    testResult,
    onSetIsClearing,
    onSetOwner,
    onSetRepo,
    onSetBranch,
    onSetIsEnabled,
    onSetMigrationDone,
    onSetIsClearDialogOpen,
    toast,
  ]);

  return {
    handleSaveConfig,
    handleTestConnection,
    handleBulkSync,
    handleDisable,
    handleClear,
  };
}
