'use client';

import React, { useState, useEffect } from 'react';
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
import { useAuth } from '@/components/auth-provider';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  clearGitHubConfigPreference,
  saveGitHubSettingsPreference,
} from '@/lib/user-preferences';

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
  const [migrationDone, setMigrationDone] = useState(false);

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

  const handleSaveConfig = async () => {
    if (!user) return;

    if (!owner || !repo) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both GitHub owner and repository name.',
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
    if (!owner || !repo) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both GitHub owner and repository name.',
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

      const result = await response.json();
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({
        success: false,
        message: `Error: ${message}`,
      });
      toast({
        title: 'Error',
        description: 'Failed to test connection',
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

      const result = await response.json();

      if (result.success) {
        setMigrationDone(true);
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
        toast({
          title: 'Bulk Sync Complete',
          description: result.message,
        });
      } else {
        toast({
          title: 'Sync Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Error',
        description: `Bulk sync failed: ${message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisable = async () => {
    if (!user) return;

    await saveGitHubSettingsPreference(user.uid, {
      ...preferences.gitHub,
      enabled: false,
    });
    setIsEnabled(false);
    toast({
      description: 'GitHub sync disabled',
    });
  };

  const handleClear = async () => {
    if (!user) return;

    if (confirm('Are you sure? This will clear your GitHub configuration.')) {
      await clearGitHubConfigPreference(user.uid);
      setOwner('');
      setRepo('');
      setBranch('');
      setIsEnabled(false);
      setTestResult(null);
      setMigrationDone(false);
      toast({
        description: 'GitHub configuration cleared',
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!canUseGitHubSync && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900 font-bold">
            Sign-in required
          </AlertTitle>
          <AlertDescription className="text-amber-800">
            {authAvailable
              ? 'GitHub sync is only available for signed-in accounts because repository settings are stored per user.'
              : 'GitHub sync is unavailable because Firebase authentication is not configured for this deployment.'}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="bg-blue-50 border-blue-200">
        <Github className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900 font-bold">GitHub Sync</AlertTitle>
        <AlertDescription className="text-blue-800">
          Sync your Judo training sessions to a personal GitHub repository.
          Sessions are stored as markdown files and synced automatically when
          you create or update entries.
        </AlertDescription>
      </Alert>

      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="bg-blue-50 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-md">
              <Github className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>GitHub Repository Configuration</CardTitle>
              <CardDescription>
                Configure where your training sessions will be synced.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-8 space-y-6">
          {/* Configuration Information */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
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
                  className="border-blue-200 focus:border-blue-400"
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
                  className="border-blue-200 focus:border-blue-400"
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
                  className="border-blue-200 focus:border-blue-400"
                />
              </div>
            </div>

            {/* Status */}
            {isEnabled && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
                Connected to{' '}
                <strong>
                  {owner}/{repo}
                </strong>
                {branch.trim() ? (
                  <>
                    {' '}
                    on branch <strong>{branch.trim()}</strong>
                  </>
                ) : (
                  <> on repository default branch</>
                )}
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>{testResult.message}</div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={() => void handleTestConnection()}
              disabled={!canUseGitHubSync || isTesting || !owner || !repo}
              variant="outline"
              className="gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
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
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              Save Configuration
            </Button>

            {isEnabled && (
              <Button
                onClick={() => void handleDisable()}
                disabled={!canUseGitHubSync}
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Disable Sync
              </Button>
            )}

            {isEnabled && (
              <Button
                onClick={() => void handleClear()}
                disabled={!canUseGitHubSync}
                variant="ghost"
                size="sm"
                className="text-gray-600 ml-auto"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Sync Section */}
      {isEnabled && !migrationDone && (
        <Card className="border-purple-100 shadow-sm">
          <CardHeader className="bg-purple-50 border-b">
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
              disabled={!canUseGitHubSync || isSyncing}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing...
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

      {/* Success State */}
      {isEnabled && migrationDone && (
        <Card className="border-green-200 bg-green-50">
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
    </div>
  );
}
