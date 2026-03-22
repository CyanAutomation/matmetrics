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
import { useToast } from '@/hooks/use-toast';
import { getLocalPluginManifestCandidates } from '@/lib/plugins/registry';
import { isManifestLike, validatePluginManifest } from '@/lib/plugins/validate';
import type {
  PluginManifest,
  PluginManifestValidationResult,
  PluginValidationSeverity,
} from '@/lib/plugins/types';

type PluginCandidateEntry = {
  key: string;
  source: unknown;
  result: PluginManifestValidationResult;
};

type PluginToggleStatus = 'idle' | 'pending' | 'success' | 'failure';

type InstalledPluginRow = Pick<
  PluginManifest,
  'id' | 'name' | 'version' | 'description' | 'enabled'
> & {
  status: PluginToggleStatus;
  statusMessage?: string;
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
  issues: PluginManifestValidationResult['issues']
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
  const toggleRequestVersionRef = React.useRef<Map<string, number>>(new Map());
  const [installedManifestRows, setInstalledManifestRows] = React.useState<
    PluginManifest[]
  >([]);
  const [rowStatuses, setRowStatuses] = React.useState<
    Record<string, Pick<InstalledPluginRow, 'status' | 'statusMessage'>>
  >({});

  const candidateEntries = React.useMemo<PluginCandidateEntry[]>(
    () =>
      getLocalPluginManifestCandidates().map((source, index) => ({
        key: `plugin-candidate-${index}`,
        source,
        result: validatePluginManifest(source),
      })),
    []
  );

  const refreshInstalledPlugins = React.useCallback(async () => {
    const response = await fetch('/api/plugins/list', { method: 'GET' });
    if (!response.ok) {
      throw new Error('Could not refresh installed plugins.');
    }

    const payload = (await response.json()) as {
      plugins?: unknown[];
      error?: string;
    };

    if (!Array.isArray(payload.plugins)) {
      throw new Error(payload.error ?? 'Invalid plugins list response.');
    }

    const validPlugins = payload.plugins
      .map((plugin) => validatePluginManifest(plugin))
      .flatMap((result) => (result.isValid ? [result.manifest] : []));

    setInstalledManifestRows(validPlugins);
  }, []);

  React.useEffect(() => {
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
  }, [refreshInstalledPlugins, toast]);

  const installedPlugins = React.useMemo<InstalledPluginRow[]>(() => {
    const statusEntries = rowStatuses;

    return installedManifestRows
      .sort((a, b) => {
        if (a.id === 'tag-manager') {
          return -1;
        }
        if (b.id === 'tag-manager') {
          return 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map((manifest) => ({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        enabled: manifest.enabled,
        status: statusEntries[manifest.id]?.status ?? 'idle',
        statusMessage: statusEntries[manifest.id]?.statusMessage,
      }));
  }, [installedManifestRows, rowStatuses]);

  React.useEffect(() => {
    setRowStatuses((prev) => {
      const next: Record<
        string,
        Pick<InstalledPluginRow, 'status' | 'statusMessage'>
      > = {};

      for (const plugin of installedManifestRows) {
        if (prev[plugin.id]) {
          next[plugin.id] = prev[plugin.id];
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
    if (!plugin) {
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
      const response = await fetch('/api/plugins/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: pluginId,
          enabled: nextEnabled,
          confirm: true,
          confirmOverwrite: true,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not update plugin state.');
      }

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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="bg-card/95">
        <CardHeader className="bg-secondary/45">
          <CardTitle>Plugins</CardTitle>
          <CardDescription>
            Enable or disable installed plugins, and review plugin issues.
            Plugin creation and editing are not available in this UI.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Installed Plugins</CardTitle>
          <CardDescription>
            Use this table to enable or disable plugins and view plugin issue
            status.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableCell className="font-medium">{plugin.name}</TableCell>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-plugin issue details</CardTitle>
          <CardDescription>
            Current validation summary and issue details for each manifest
            candidate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidateEntries.map((entry) => {
            const summarySeverity = resolveEntrySummarySeverity(
              entry.result.issues
            );
            const manifestId = entry.result.isValid
              ? entry.result.manifest.id
              : isManifestLike(entry.source) && typeof entry.source.id === 'string'
                ? entry.source.id
                : entry.key;

            return (
              <div
                key={`validate-${entry.key}`}
                className="rounded-lg bg-secondary/20 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{manifestId}</div>
                  <Badge className={severityBadgeClass[summarySeverity]}>
                    {severityLabel(summarySeverity)}
                  </Badge>
                </div>

                {entry.result.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No issues found.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {entry.result.issues
                      .slice()
                      .sort(
                        (a, b) =>
                          severityOrder[b.severity] - severityOrder[a.severity]
                      )
                      .map((issue, issueIndex) => (
                        <li
                          key={`${entry.key}-${issue.path}-${issueIndex}`}
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
          })}
        </CardContent>
      </Card>
    </div>
  );
}
