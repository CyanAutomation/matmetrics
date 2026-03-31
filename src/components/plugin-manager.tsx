'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  PluginPageShell,
  PLUGIN_PAGE_CLASS_PATTERNS,
} from '@/components/plugins/plugin-page-shell';
import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
} from '@/components/plugins/plugin-state';
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
  type PluginMaturityDebugMetadata,
  getPluginManagerAccessState,
  type InstalledPluginManifestRow,
  type PluginManagerAccessState,
  toggleInstalledPlugin,
} from '@/lib/plugins/plugin-manager-client';
import type {
  PluginManifest,
  PluginMaturityScorecard,
  PluginMaturityTier,
  PluginValidationIssue,
  PluginValidationSeverity,
} from '@/lib/plugins/types';

type PluginToggleStatus = 'idle' | 'pending' | 'success' | 'failure';
type PluginFetchState = 'idle' | 'loading' | 'success' | 'error';

export const isActiveRefreshRequest = ({
  requestId,
  latestRequestId,
  isMounted,
}: {
  requestId: number;
  latestRequestId: number;
  isMounted: boolean;
}): boolean => isMounted && requestId === latestRequestId;

export type InstalledPluginRow = Pick<
  PluginManifest,
  'id' | 'name' | 'version' | 'description' | 'enabled'
> & {
  status: PluginToggleStatus;
  statusMessage?: string;
  issues: PluginValidationIssue[];
  maturity?: PluginMaturityScorecard;
};

type InstalledPluginRowStatuses = Record<
  string,
  Pick<InstalledPluginRow, 'status' | 'statusMessage'>
>;

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

const tierBadgeClass: Record<PluginMaturityTier, string> = {
  bronze: 'bg-amber-700/10 text-amber-800 border-amber-700/30',
  silver: 'bg-slate-500/10 text-slate-700 border-slate-400/40',
  gold: 'bg-yellow-500/10 text-yellow-800 border-yellow-400/40',
};

const formatTierLabel = (tier: PluginMaturityTier): string =>
  tier.charAt(0).toUpperCase() + tier.slice(1);

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

const getBlockingContractGateIssues = (
  issues: PluginValidationIssue[]
): PluginValidationIssue[] =>
  issues.filter(
    (issue) =>
      issue.severity === 'error' &&
      (issue.path === 'contractGate.entrypoint' ||
        issue.path === 'contractGate.readme' ||
        issue.path.includes('config.component'))
  );

const hasBlockingContractIssues = (issues: PluginValidationIssue[]): boolean =>
  getBlockingContractGateIssues(issues).length > 0;

export const deriveInstalledPlugins = ({
  installedManifestRows,
  rowStatuses,
}: {
  installedManifestRows: InstalledPluginManifestRow[];
  rowStatuses: InstalledPluginRowStatuses;
}): InstalledPluginRow[] =>
  installedManifestRows
    .slice()
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
      maturity: manifest.maturity,
      status: rowStatuses[manifest.manifest.id]?.status ?? 'idle',
      statusMessage: rowStatuses[manifest.manifest.id]?.statusMessage,
    }));

type PluginManagerProps = {
  onPluginsChanged?: () => void | Promise<void>;
};

export type PluginManagerInstalledViewState =
  | 'access-blocked'
  | 'loading'
  | 'error'
  | 'empty'
  | 'table';

export const derivePluginManagerInstalledViewState = (params: {
  canManagePlugins: boolean;
  fetchState: PluginFetchState;
  installedPluginCount: number;
}): PluginManagerInstalledViewState => {
  const { canManagePlugins, fetchState, installedPluginCount } = params;
  if (!canManagePlugins) {
    return 'access-blocked';
  }
  if (fetchState === 'loading' || fetchState === 'idle') {
    return 'loading';
  }
  if (fetchState === 'error') {
    return 'error';
  }
  if (installedPluginCount === 0) {
    return 'empty';
  }
  return 'table';
};

export function PluginManagerInstalledContent(props: {
  installedPluginsViewState: PluginManagerInstalledViewState;
  accessState: PluginManagerAccessState;
  loadErrorMessage: string | null;
  installedPlugins: InstalledPluginRow[];
  fetchState: PluginFetchState;
  onRetry: () => void;
  onTogglePluginEnabled: (pluginId: string, enabled: boolean) => void;
}) {
  const {
    accessState,
    fetchState,
    installedPlugins,
    installedPluginsViewState,
    loadErrorMessage,
    onRetry,
    onTogglePluginEnabled,
  } = props;

  if (installedPluginsViewState === 'access-blocked') {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="plugins-access-blocked-state"
      >
        {accessState === 'auth-unavailable'
          ? 'Plugin management cannot load in this environment until Firebase authentication is configured.'
          : 'Sign in with a configured account to load installed plugins and update their enabled state.'}
      </p>
    );
  }

  if (installedPluginsViewState === 'loading') {
    return (
      <PluginLoadingState
        title="Loading installed plugins"
        description="Loading installed plugins…"
        className="bg-secondary/20"
        data-testid="plugins-loading-state"
      />
    );
  }

  if (installedPluginsViewState === 'error') {
    return (
      <PluginErrorState
        title="Failed to load installed plugins"
        message={
          loadErrorMessage ?? 'Could not load installed plugins from the API.'
        }
        onRetry={onRetry}
        className="bg-destructive/5"
        retryAriaLabel="Retry loading installed plugins"
        data-testid="plugins-error-state"
      />
    );
  }

  if (installedPluginsViewState === 'empty') {
    return (
      <PluginEmptyState
        title="No installed plugins found."
        description={
          <div className="space-y-1">
            <p>No installed plugins found in plugins/*/plugin.json.</p>
            <p>Add a plugin manifest, then retry loading this list.</p>
          </div>
        }
        className="bg-secondary/20"
        data-testid="plugins-empty-state"
      />
    );
  }

  return (
    <Table data-testid="plugins-table-state">
      <TableHeader>
        <TableRow>
          <TableHead>name</TableHead>
          <TableHead>id</TableHead>
          <TableHead>version</TableHead>
          <TableHead>maturity</TableHead>
          <TableHead>description</TableHead>
          <TableHead>enabled</TableHead>
          <TableHead className="text-right">status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {installedPlugins.map((plugin) => {
          const scoredWithContractIssues =
            Boolean(plugin.maturity) &&
            hasBlockingContractIssues(plugin.issues);
          return (
            <TableRow key={plugin.id}>
              <TableCell className="font-medium">{plugin.name}</TableCell>
              <TableCell className="font-mono text-xs">{plugin.id}</TableCell>
              <TableCell className="font-mono text-xs">
                {plugin.version}
              </TableCell>
              <TableCell>
                {plugin.maturity ? (
                  <div className="space-y-1">
                    <Badge
                      variant="outline"
                      className={tierBadgeClass[plugin.maturity.tier]}
                    >
                      {formatTierLabel(plugin.maturity.tier)}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {plugin.maturity.score}/100
                    </div>
                    {scoredWithContractIssues ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-700 border-amber-300/40"
                      >
                        Scored with contract issues
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Unscored
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-sm text-sm text-muted-foreground">
                {plugin.description}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`plugin-enabled-${plugin.id}`}
                    checked={plugin.enabled}
                    disabled={
                      plugin.status === 'pending' || fetchState === 'loading'
                    }
                    onCheckedChange={(checked) =>
                      onTogglePluginEnabled(plugin.id, checked)
                    }
                  />
                  <Label htmlFor={`plugin-enabled-${plugin.id}`}>Enabled</Label>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {plugin.status === 'pending' ? (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                ) : plugin.status === 'success' ? (
                  <span className="text-xs text-emerald-700">Saved</span>
                ) : plugin.status === 'failure' ? (
                  <span className="text-xs text-destructive">Failed</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Idle</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function PluginManager({ onPluginsChanged }: PluginManagerProps) {
  const MATURITY_REASONS_PREVIEW_COUNT = 3;
  const { toast } = useToast();
  const { user, authAvailable } = useAuth();
  const toggleRequestVersionRef = React.useRef<Map<string, number>>(new Map());
  const refreshRequestIdRef = React.useRef(0);
  const isMountedRef = React.useRef(true);
  const [installedManifestRows, setInstalledManifestRows] = React.useState<
    InstalledPluginManifestRow[]
  >([]);
  const [fetchState, setFetchState] = React.useState<PluginFetchState>('idle');
  const [loadErrorMessage, setLoadErrorMessage] = React.useState<string | null>(
    null
  );
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);
  const [maturityDebug, setMaturityDebug] =
    React.useState<PluginMaturityDebugMetadata>({});
  const [rowStatuses, setRowStatuses] =
    React.useState<InstalledPluginRowStatuses>({});
  const [expandedMaturityReasons, setExpandedMaturityReasons] = React.useState<
    Record<string, boolean>
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

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshInstalledPlugins = React.useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setFetchState('loading');
    setLoadErrorMessage(null);
    try {
      const result = await fetchInstalledPlugins({
        getHeaders: getAuthHeaders,
      });
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }

      setInstalledManifestRows(result.rows);
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
      setMaturityDebug(result.maturityDebug);
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
      setFetchState('success');
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
      setLastUpdatedAt(new Date());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not load installed plugins from the API.';
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }

      setInstalledManifestRows([]);
      setMaturityDebug({});
      setFetchState('error');
      setLoadErrorMessage(message);
      throw error;
    }
  }, []);

  React.useEffect(() => {
    if (!canManagePlugins) {
      setInstalledManifestRows([]);
      setMaturityDebug({});
      setRowStatuses({});
      setFetchState('idle');
      setLoadErrorMessage(null);
      setLastUpdatedAt(null);
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

  const refreshInstalledPluginsRef = React.useRef(refreshInstalledPlugins);

  React.useEffect(() => {
    refreshInstalledPluginsRef.current = refreshInstalledPlugins;
  }, [refreshInstalledPlugins]);

  React.useEffect(() => {
    if (!canManagePlugins) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshInstalledPluginsRef.current().catch((error) => {
        console.error('Background plugin refresh failed', error);
      });
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canManagePlugins]);

  const handleManualRefresh = React.useCallback(() => {
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
    return deriveInstalledPlugins({
      installedManifestRows,
      rowStatuses,
    });
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

  const installedPluginsViewState = derivePluginManagerInstalledViewState({
    canManagePlugins,
    fetchState,
    installedPluginCount: installedPlugins.length,
  });

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
    <PluginPageShell
      title="Plugins"
      description="Enable or disable installed plugins, and review plugin issues."
      className="max-w-5xl"
      contentClassName={PLUGIN_PAGE_CLASS_PATTERNS.verticalSpacing}
    >
      {accessAlert}

      <Card className="bg-card/95 shadow-sm">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Installed Plugins</CardTitle>
            <CardDescription>
              Use this to enable or disable plugins and view plugin status.
            </CardDescription>
            {canManagePlugins ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Last updated:{' '}
                  {lastUpdatedAt
                    ? lastUpdatedAt.toLocaleString()
                    : 'Not loaded yet'}
                </p>
                <p>
                  Last generated at{' '}
                  {maturityDebug.routeGeneratedAt ?? 'unavailable'}
                </p>
                {maturityDebug.responseCachePolicy ? (
                  <p>Cache: {maturityDebug.responseCachePolicy}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          {canManagePlugins ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={fetchState === 'loading'}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  fetchState === 'loading' ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className={PLUGIN_PAGE_CLASS_PATTERNS.cardSpacing}>
          <PluginManagerInstalledContent
            installedPluginsViewState={installedPluginsViewState}
            accessState={accessState}
            loadErrorMessage={loadErrorMessage}
            installedPlugins={installedPlugins}
            fetchState={fetchState}
            onRetry={handleManualRefresh}
            onTogglePluginEnabled={(pluginId, enabled) => {
              void togglePluginEnabled(pluginId, enabled);
            }}
          />

          {canManagePlugins && installedPluginsViewState === 'table' ? (
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

      <Card className="bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Plugin issue details</CardTitle>
          <CardDescription>
            Validation summary and issue details for each installed plugin.
          </CardDescription>
        </CardHeader>
        <CardContent className={PLUGIN_PAGE_CLASS_PATTERNS.cardSpacing}>
          {installedPluginsViewState === 'access-blocked' ? (
            <p className="text-sm text-muted-foreground">
              {accessState === 'auth-unavailable'
                ? 'Plugin issue details are unavailable because Firebase authentication is not configured.'
                : 'Plugin issue details load after authentication succeeds.'}
            </p>
          ) : installedPluginsViewState === 'loading' ? (
            <p className="text-sm text-muted-foreground">
              Plugin issue details will appear after plugin loading completes.
            </p>
          ) : installedPluginsViewState === 'error' ? (
            <p className="text-sm text-muted-foreground">
              Plugin issue details are unavailable because plugin loading
              failed. Retry loading installed plugins.
            </p>
          ) : installedPluginsViewState === 'empty' ? (
            <p className="text-sm text-muted-foreground">
              No installed plugins were found, so there are no issue details to
              display.
            </p>
          ) : (
            installedPlugins.map((plugin) => {
              const summarySeverity = resolveEntrySummarySeverity(
                plugin.issues
              );
              const blockingIssues = getBlockingContractGateIssues(
                plugin.issues
              );
              const scoredWithContractIssues =
                Boolean(plugin.maturity) && blockingIssues.length > 0;

              return (
                <div
                  key={`validate-${plugin.id}`}
                  className="rounded-lg bg-secondary/20 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{plugin.id}</div>
                    <div className="flex items-center gap-2">
                      {plugin.maturity ? (
                        <Badge
                          variant="outline"
                          className={tierBadgeClass[plugin.maturity.tier]}
                        >
                          {formatTierLabel(plugin.maturity.tier)}{' '}
                          {plugin.maturity.score}/100
                        </Badge>
                      ) : null}
                      <Badge className={severityBadgeClass[summarySeverity]}>
                        {severityLabel(summarySeverity)}
                      </Badge>
                      {scoredWithContractIssues ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-700 border-amber-300/40"
                        >
                          Scored with contract issues
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {blockingIssues.length > 0 ? (
                    <Alert className="border-destructive/30 bg-destructive/5">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <AlertTitle>Blocking contract issues</AlertTitle>
                      <AlertDescription>
                        Activation is blocked until the contract gate passes.
                        Fix the errors below in the plugin folder (entrypoint,
                        component mapping, and README sections). Maturity
                        recommendations below are still current advisory
                        guidance.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {plugin.maturity ? (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-foreground">
                        Maturity guidance (advisory)
                      </p>
                      {plugin.maturity.reasons.length === 0 ? (
                        <p className="text-muted-foreground">
                          No maturity gaps are currently recorded.
                        </p>
                      ) : (
                        <>
                          <ul className="space-y-1 text-muted-foreground list-disc pl-5">
                            {(expandedMaturityReasons[plugin.id]
                              ? plugin.maturity.reasons
                              : plugin.maturity.reasons.slice(
                                  0,
                                  MATURITY_REASONS_PREVIEW_COUNT
                                )
                            ).map((reason, index) => (
                              <li key={`${plugin.id}-maturity-reason-${index}`}>
                                {reason}
                              </li>
                            ))}
                          </ul>
                          {plugin.maturity.reasons.length >
                          MATURITY_REASONS_PREVIEW_COUNT ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-0 text-sm"
                              onClick={() =>
                                setExpandedMaturityReasons((current) => ({
                                  ...current,
                                  [plugin.id]: !current[plugin.id],
                                }))
                              }
                            >
                              {expandedMaturityReasons[plugin.id]
                                ? 'Show fewer'
                                : `Show ${
                                    plugin.maturity.reasons.length -
                                    MATURITY_REASONS_PREVIEW_COUNT
                                  } more`}
                            </Button>
                          ) : null}
                        </>
                      )}
                      {plugin.maturity.nextActions.length > 0 ? (
                        <ul className="space-y-1 text-muted-foreground">
                          {plugin.maturity.nextActions.map((action) => (
                            <li key={`${plugin.id}-${action}`}>{action}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

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
                            severityOrder[b.severity] -
                            severityOrder[a.severity]
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
    </PluginPageShell>
  );
}
