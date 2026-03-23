'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  fetchInstalledPlugins,
  getPluginManagerAccessState,
  toggleInstalledPlugin,
} from '@/lib/plugins/plugin-manager-client';
import type {
  PluginManifest,
  PluginValidationIssue,
  PluginValidationSeverity,
} from '@/lib/plugins/types';

type PluginToggleStatus = 'idle' | 'pending' | 'success' | 'failure';

type InstalledPluginRow = Pick<
  PluginManifest,
  'id' | 'name' | 'version' | 'description' | 'enabled'
> & {
  status: PluginToggleStatus;
  statusMessage?: string;
  issues: PluginValidationIssue[];
};

const severityOrder: Record<PluginValidationSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

const severityLabel = (severity: PluginValidationSeverity): string => {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
};

const severityBadgeClass: Record<PluginValidationSeverity, string> = {
  error: 'bg-destructive/10 text-destructive border-destructive/30',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-300/40',
  info: 'bg-primary/10 text-primary border-primary/30',
};

const resolveEntrySummarySeverity = (
  issues: PluginValidationIssue[]
): PluginValidationSeverity => {
  if (issues.some((issue) => issue.severity === 'error')) {
    return 'error';
  }

  if (issues.some((issue) => issue.severity === 'warning')) {
    return 'warning';
  }

  return 'info';
};

type PluginManagerProps = {
  onPluginsChanged?: () => void | Promise<void>;
};

export function PluginManager({ onPluginsChanged }: PluginManagerProps) {
  const { toast } = useToast();
  const { user, authAvailable } = useAuth();
  const toggleRequestVersionRef = React.useRef<Map<string, number>>(new Map());
  const [installedManifestRows, setInstalledManifestRows] = React.useState<
    Array<{ manifest: PluginManifest; issues: PluginValidationIssue[] }>
  >([]);
  const [rowStatuses, setRowStatuses] = React.useState<
    Record<string, Pick<InstalledPluginRow, 'status' | 'statusMessage'>>
  >({});
  const accessState = React.useMemo(
    () =>
      getPluginManagerAccessState({
        authAvailable,
        userPresent: !!user,
      }),
    [authAvailable, user]
  );
  const canManagePlugins = accessState === 'ready';

  const refreshInstalledPlugins = React.useCallback(async () => {
    const validPlugins = await fetchInstalledPlugins({
      getHeaders: getAuthHeaders,
    });
    setInstalledManifestRows(validPlugins);
  }, []);

  React.useEffect(() => {
    if (!canManagePlugins) {
      setInstalledManifestRows([]);
      setRowStatuses({});
      return;
    }

    void refreshInstalledPlugins().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not load installed plugins from the API.';
      toast({
        variant: 'destructive',
        title: 'Failed to load plugins',
        description: message,
      });
    });
  }, [canManagePlugins, refreshInstalledPlugins, toast]);

  const installedPlugins = React.useMemo<InstalledPluginRow[]>(() => {
    const statusEntries = rowStatuses;

    return installedManifestRows
      .sort((a, b) => {
        if (a.manifest.id === 'tag-manager') {
          return -1;
        }
        if (b.manifest.id === 'tag-manager') {
          return 1;
        }
        return a.manifest.name.localeCompare(b.manifest.name);
      })
      .map((manifest) => ({
        id: manifest.manifest.id,
        name: manifest.manifest.name,
        version: manifest.manifest.version,
        description: manifest.manifest.description,
        enabled: manifest.manifest.enabled,
        issues: manifest.issues,
        status: statusEntries[manifest.manifest.id]?.status ?? 'idle',
        statusMessage: statusEntries[manifest.manifest.id]?.statusMessage,
      }));
  }, [installedManifestRows, rowStatuses]);

  React.useEffect(() => {
    setRowStatuses((prev) => {
      const next: Record<
        string,
        Pick<InstalledPluginRow, 'status' | 'statusMessage'>
      > = {};

      for (const plugin of installedManifestRows) {
        if (prev[plugin.manifest.id]) {
          next[plugin.manifest.id] = prev[plugin.manifest.id];
        }
      }

      return next;
    });
  }, [installedManifestRows]);

  const togglePluginEnabled = async (
    pluginId: string,
    nextEnabled: boolean
  ) => {
    const plugin = installedPlugins.find((row) => row.id === pluginId);
    if (!plugin || !canManagePlugins) {
      return;
    }

    const requestVersion =
      (toggleRequestVersionRef.current.get(pluginId) ?? 0) + 1;
    toggleRequestVersionRef.current.set(pluginId, requestVersion);

    setRowStatuses((prev) => ({
      ...prev,
      [pluginId]: {
        status: 'pending',
        statusMessage: `Saving ${nextEnabled ? 'enabled' : 'disabled'} state...`,
      },
    }));

    toast({
      title: 'Plugin update pending',
      description: `${plugin.name}: applying enabled state change...`,
    });

    try {
      await toggleInstalledPlugin({
        pluginId,
        enabled: nextEnabled,
        getHeaders: getAuthHeaders,
      });

      await refreshInstalledPlugins();
      try {
        await onPluginsChanged?.();
      } catch (error) {
        console.error('Plugin extension refresh callback failed', error);
      }

      const latestVersion = toggleRequestVersionRef.current.get(pluginId);
      if (latestVersion !== requestVersion) {
        return;
      }

      setRowStatuses((prev) => ({
        ...prev,
        [pluginId]: {
          status: 'success',
          statusMessage: `Plugin ${nextEnabled ? 'enabled' : 'disabled'} successfully.`,
        },
      }));

      toast({
        title: 'Plugin updated',
        description: `${plugin.name} is now ${nextEnabled ? 'enabled' : 'disabled'}.`,
      });
    } catch (error) {
      const latestVersion = toggleRequestVersionRef.current.get(pluginId);
      if (latestVersion !== requestVersion) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Could not update plugin state. Please retry.';

      setRowStatuses((prev) => ({
        ...prev,
        [pluginId]: {
          status: 'failure',
          statusMessage: message,
        },
      }));

      toast({
        variant: 'destructive',
        title: 'Plugin update failed',
        description: `${plugin.name} could not be updated: ${message}`,
      });
    }
  };

  const accessAlert =
    accessState === 'sign-in-required' ? (
      <Alert className="bg-amber-50 border-amber-200">
        <AlertCircle className="h-4 w-4 text-amber-700" />
        <AlertTitle className="text-amber-900 font-bold">
          Sign-in required
        </AlertTitle>
        <AlertDescription className="text-amber-800">
          Plugin management is only available for signed-in accounts.
        </AlertDescription>
      </Alert>
    ) : accessState === 'auth-unavailable' ? (
      <Alert className="bg-amber-50 border-amber-200">
        <Info className="h-4 w-4 text-amber-700" />
        <AlertTitle className="text-amber-900 font-bold">
          Plugin management unavailable
        </AlertTitle>
        <AlertDescription className="text-amber-800">
          Plugin management requires Firebase authentication, which is not
          configured for this deployment.
        </AlertDescription>
      </Alert>
    ) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="bg-card/95">
        <CardHeader className="bg-secondary/45">
          <CardTitle>Plugins</CardTitle>
          <CardDescription>
            Enable or disable installed plugins, and review plugin issues.
          </CardDescription>
        </CardHeader>
      </Card>

      {accessAlert}

      <Card>
        <CardHeader>
          <CardTitle>Installed Plugins</CardTitle>
          <CardDescription>
            Use this to enable or disable plugins and view plugin status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canManagePlugins ? (
            <p className="text-sm text-muted-foreground">
              {accessState === 'auth-unavailable'
                ? 'Plugin management cannot load in this environment until Firebase authentication is configured.'
                : 'Sign in with a configured account to load installed plugins and update their enabled state.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>name</TableHead>
                  <TableHead>id</TableHead>
                  <TableHead>version</TableHead>
                  <TableHead>description</TableHead>
                  <TableHead>enabled</TableHead>
                  <TableHead className="text-right">status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installedPlugins.map((plugin) => {
                  return (
                    <TableRow key={plugin.id}>
                      <TableCell className="font-medium">
                        {plugin.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {plugin.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {plugin.version}
                      </TableCell>
                      <TableCell className="max-w-sm text-sm text-muted-foreground">
                        {plugin.description}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`plugin-enabled-${plugin.id}`}
                            checked={plugin.enabled}
                            disabled={plugin.status === 'pending'}
                            onCheckedChange={(checked) =>
                              void togglePluginEnabled(plugin.id, checked)
                            }
                          />
                          <Label htmlFor={`plugin-enabled-${plugin.id}`}>
                            Enabled
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {plugin.status === 'pending' ? (
                          <span className="text-xs text-muted-foreground">
                            Saving…
                          </span>
                        ) : plugin.status === 'success' ? (
                          <span className="text-xs text-emerald-700">Saved</span>
                        ) : plugin.status === 'failure' ? (
                          <span className="text-xs text-destructive">Failed</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Idle
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {canManagePlugins ? (
            <div className="mt-4 space-y-2">
              {installedPlugins
                .filter((plugin) => plugin.status !== 'idle')
                .map((plugin) => (
                  <Alert key={`toggle-status-${plugin.id}`}>
                    {plugin.status === 'failure' ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : plugin.status === 'pending' ? (
                      <Info className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <AlertTitle>{plugin.name}</AlertTitle>
                    <AlertDescription>{plugin.statusMessage}</AlertDescription>
                  </Alert>
                ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-plugin issue details</CardTitle>
          <CardDescription>
            Validation summary and issue details for each installed
            plugin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManagePlugins ? (
            <p className="text-sm text-muted-foreground">
              {accessState === 'auth-unavailable'
                ? 'Plugin issue details are unavailable because Firebase authentication is not configured.'
                : 'Plugin issue details load after authentication succeeds.'}
            </p>
          ) : (
            installedPlugins.map((plugin) => {
              const summarySeverity = resolveEntrySummarySeverity(plugin.issues);

              return (
                <div
                  key={`validate-${plugin.id}`}
                  className="rounded-lg bg-secondary/20 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{plugin.id}</div>
                    <Badge className={severityBadgeClass[summarySeverity]}>
                      {severityLabel(summarySeverity)}
                    </Badge>
                  </div>

                  {plugin.issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No issues found.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {plugin.issues
                        .slice()
                        .sort(
                          (a, b) =>
                            severityOrder[b.severity] - severityOrder[a.severity]
                        )
                        .map((issue, issueIndex) => (
                          <li
                            key={`${plugin.id}-${issue.path}-${issueIndex}`}
                            className="text-sm"
                          >
                            <span className="font-medium">{issue.path}:</span>{' '}
                            {issue.message}{' '}
                            <Badge
                              variant="outline"
                              className={severityBadgeClass[issue.severity]}
                            >
                              {severityLabel(issue.severity)}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
