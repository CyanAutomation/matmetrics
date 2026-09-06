import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  PluginFormSection,
  PluginLoadingState,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import {
  SyncResultsMainPanel,
  SyncResultsHistoryList,
  SyncResultsDetailPane,
} from './github-sync-results';

type Props = {
  migrationDone: boolean;
  handleBulkSync: () => Promise<void> | void;
  handleLoadSyncHistory: () => Promise<void> | void;
  syncHistoryState: any;
  selectedHistoryPath: string | null;
  setSelectedHistoryPath: (p: string | null) => void;
  controlState: any;
  isSyncing: boolean;
};

export function GitHubSettingsHistoryPanel({
  migrationDone,
  handleBulkSync,
  handleLoadSyncHistory,
  syncHistoryState,
  selectedHistoryPath,
  setSelectedHistoryPath,
  controlState,
  isSyncing,
}: Props) {
  return (
    <details className="rounded-xl bg-[hsl(var(--color-surface-container-low))] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Troubleshooting and activity</summary>
      <div className="mt-4 space-y-6">
        <PluginFormSection
          title={migrationDone ? 'Sync now' : 'Run first backup'}
          description={
            migrationDone
              ? 'Use this only to troubleshoot or force a complete backup check.'
              : 'Copy existing training history once; future changes back up automatically.'
          }
        >
          <Button
            variant="outline"
            onClick={() => void handleBulkSync()}
            disabled={!controlState?.canRunSyncAll}
            className="gap-2"
          >
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isSyncing ? controlState?.syncAllLabel : migrationDone ? 'Sync now' : 'Start first backup'}
          </Button>
        </PluginFormSection>

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
              disabled={!controlState?.canRefreshHistory}
              className="gap-2"
            >
              {syncHistoryState.status === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {controlState?.refreshHistoryLabel}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {controlState?.refreshHistoryLabel}
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
      </div>
    </details>
  );
}

export default GitHubSettingsHistoryPanel;
