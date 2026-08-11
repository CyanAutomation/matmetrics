'use client';

import { CheckCircle2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PluginErrorState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import { PluginInlineMessage } from '@/components/plugins/plugin-inline-message';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';

export function GitHubRepositoryFields({
  owner,
  repo,
  branch,
  isEnabled,
  migrationDone,
  canUseGitHubSync,
  inputTone,
  testResult,
  onOwnerChange,
  onRepoChange,
  onBranchChange,
}: {
  owner: string;
  repo: string;
  branch: string;
  isEnabled: boolean;
  migrationDone: boolean;
  canUseGitHubSync: boolean;
  inputTone: string;
  testResult?: { success: boolean; message: string } | null;
  onOwnerChange: (value: string) => void;
  onRepoChange: (value: string) => void;
  onBranchChange: (value: string) => void;
}) {
  const disabled = !canUseGitHubSync || (isEnabled && migrationDone);
  return (
    <>
      <details className="rounded-lg border bg-muted/20 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Connection requirements
        </summary>
        <PluginInlineMessage
          tone="warning"
          title="Setup Requirements"
          description={
            <ul className="list-inside list-disc space-y-1 text-sm">
              <li>
                Add{' '}
                <code className={getPluginUiTokenClassNames('code.inline')}>
                  GITHUB_TOKEN
                </code>{' '}
                to your Vercel environment variables
              </li>
              <li>
                Token must have{' '}
                <code className={getPluginUiTokenClassNames('code.inline')}>
                  repo
                </code>{' '}
                permissions
              </li>
              <li>Repository will be created or used if it already exists</li>
            </ul>
          }
          className="mt-3 shadow-sm"
        />
      </details>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="owner" className="text-sm font-semibold">
              GitHub Owner/Username
            </Label>
            <Input
              id="owner"
              placeholder="e.g., CyanAutomation"
              value={owner}
              onChange={(event) => onOwnerChange(event.target.value)}
              disabled={disabled}
              className={inputTone}
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
              onChange={(event) => onRepoChange(event.target.value)}
              disabled={disabled}
              className={inputTone}
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
              onChange={(event) => onBranchChange(event.target.value)}
              disabled={disabled}
              className={inputTone}
            />
          </div>
        </div>
        {isEnabled ? (
          <PluginSuccessState
            title="Repository connected"
            description={
              <>
                Connected to <strong>{owner}</strong>/<strong>{repo}</strong>
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
            icon={
              <CheckCircle2
                className={`h-4 w-4 ${getPluginUiTokenClassNames('icon.success')}`}
              />
            }
          />
        ) : null}
        {testResult && !testResult.success ? (
          <PluginErrorState
            title="Connection test failed"
            message={testResult.message}
          />
        ) : null}
      </div>
    </>
  );
}
