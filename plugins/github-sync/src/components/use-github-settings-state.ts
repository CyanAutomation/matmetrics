import { useEffect, useState } from 'react';

import type { UserPreferences } from '@/lib/types';
import type { GitHubSyncHistoryData, GitHubSyncSurfaceState } from './github-sync-results';

export function useGitHubSettingsState(preferences: UserPreferences) {
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

  useEffect(() => {
    const config = preferences.gitHub.config;
    setOwner(config?.owner ?? '');
    setRepo(config?.repo ?? '');
    setBranch(config?.branch ?? '');
    setIsEnabled(preferences.gitHub.enabled);
    setMigrationDone(preferences.gitHub.migrationDone);
  }, [preferences.gitHub]);

  return {
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
  };
}
