import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  PluginActionPrimary,
  PluginActionRow,
  PluginActionSecondary,
} from '@/components/plugins/plugin-action-row';
import { PluginFormSection } from '@/components/plugins/plugin-kit';
import { GitHubRepositoryFields } from './github-repository-fields';

type Props = {
  owner: string;
  repo: string;
  branch: string;
  isEnabled: boolean;
  migrationDone: boolean;
  canUseGitHubSync: boolean;
  inputTone: string;
  testResult: any;
  isTesting: boolean;
  hasConnectionChanges: boolean;
  isManagingConnection: boolean;
  setIsManagingConnection: (v: (b: boolean) => boolean) => void;
  onOwnerChange: (s: string) => void;
  onRepoChange: (s: string) => void;
  onBranchChange: (s: string) => void;
  onTestConnection: () => Promise<void> | void;
  onSaveConfig: () => Promise<void> | void;
  controlState: any;
};

export function GitHubSettingsConnectionForm({
  owner,
  repo,
  branch,
  isEnabled,
  migrationDone,
  canUseGitHubSync,
  inputTone,
  testResult,
  isTesting,
  hasConnectionChanges,
  isManagingConnection,
  setIsManagingConnection,
  onOwnerChange,
  onRepoChange,
  onBranchChange,
  onTestConnection,
  onSaveConfig,
  controlState,
}: Props) {
  return (
    <PluginFormSection
      title={isEnabled ? 'Backup connection' : 'Connect a repository'}
      description={
        isEnabled
          ? `Backing up to ${owner}/${repo}. Manage the destination only when it changes.`
          : 'Choose where new and updated training sessions should be backed up.'
      }
      headerActions={
        isEnabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsManagingConnection((open) => !open)}
            aria-expanded={isManagingConnection}
          >
            {isManagingConnection ? 'Done' : 'Manage connection'}
          </Button>
        ) : undefined
      }
      footerActions={
        !isEnabled || isManagingConnection ? (
          <PluginActionRow>
            <PluginActionSecondary>
              <Button
                onClick={() => void onTestConnection()}
                disabled={!controlState?.canTestConnection}
                variant="outline"
                className="gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {controlState?.testConnectionLabel}
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
                onClick={() => void onSaveConfig()}
                disabled={
                  !canUseGitHubSync || !owner || !repo || (isEnabled && !hasConnectionChanges)
                }
              >
                {isEnabled ? 'Save changes' : 'Connect repository'}
              </Button>
            </PluginActionPrimary>
          </PluginActionRow>
        ) : undefined
      }
    >
      {!isEnabled || isManagingConnection ? (
        <GitHubRepositoryFields
          owner={owner}
          repo={repo}
          branch={branch}
          isEnabled={isEnabled}
          migrationDone={migrationDone}
          canUseGitHubSync={canUseGitHubSync}
          inputTone={inputTone}
          testResult={testResult}
          onOwnerChange={onOwnerChange}
          onRepoChange={onRepoChange}
          onBranchChange={onBranchChange}
        />
      ) : null}
    </PluginFormSection>
  );
}

export default GitHubSettingsConnectionForm;
