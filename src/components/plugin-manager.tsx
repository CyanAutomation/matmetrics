'use client';

import React from 'react';
import { AlertCircle, Info, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  PluginValidationIssue,
  PluginValidationSeverity,
} from '@/lib/plugins/types';
import {
  resolvePluginSeverityToneClass,
  resolvePluginTierPresentation,
} from '@/lib/ui-semantic';

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
        description="Checking installed plugins. This usually takes a moment."
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
    <div
      className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      data-testid="plugins-table-state"
    >
      {installedPlugins.map((plugin) => {
        const scoredWithContractIssues =
          Boolean(plugin.maturity) && hasBlockingContractIssues(plugin.issues);
        const summarySeverity = resolveEntrySummarySeverity(plugin.issues);
        return (
          <div
            key={plugin.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4"
          >
            {/* Header row: name + maturity + toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{plugin.name}</span>
                  {plugin.maturity ? (
                    <>
                      <Badge
                        variant="outline"
                        className={
                          resolvePluginTierPresentation(plugin.maturity.tier)
                            .toneClass
                        }
                      >
                        {
                          resolvePluginTierPresentation(plugin.maturity.tier)
                            .label
                        }{' '}
                        {plugin.maturity.score}/100
                      </Badge>
                      {scoredWithContractIssues ? (
                        <Badge variant="outline" className="ui-pill-warning">
                          Contract issues
                        </Badge>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Unscored
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {plugin.id} · v{plugin.version}
                </p>
              </div>
              <Switch
                id={`plugin-enabled-${plugin.id}`}
                checked={plugin.enabled}
                disabled={
                  plugin.status === 'pending' || fetchState === 'loading'
                }
                onCheckedChange={(checked) =>
                  onTogglePluginEnabled(plugin.id, checked)
                }
                aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
              />
            </div>

            {/* Description */}
            <p className="text-sm leading-snug text-muted-foreground">
              {plugin.description}
            </p>

            {/* Validation issues indicator */}
            {plugin.issues.length > 0 && (
              <div
                className="flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
                data-severity={summarySeverity}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {plugin.issues.length} validation{' '}
                  {plugin.issues.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>
            )}

            {/* Toggle status inline */}
            {plugin.status !== 'idle' ? (
              <div className="text-xs">
                {plugin.status === 'pending' ? (
                  <span className="text-muted-foreground">Saving…</span>
                ) : plugin.status === 'success' ? (
                  <span className="text-[hsl(var(--color-on-success-container))]">
                    Saved
                  </span>
                ) : (
                  <span className="text-destructive">Failed to update</span>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
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
  const [_maturityDebug, setMaturityDebug] =
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
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
      setMaturityDebug({});
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
      setFetchState('error');
      if (
        !isActiveRefreshRequest({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          isMounted: isMountedRef.current,
        })
      ) {
        return;
      }
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
      <Alert className="ui-alert-warning">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="font-bold">Sign-in required</AlertTitle>
        <AlertDescription>
          Plugin management is only available for signed-in accounts.
        </AlertDescription>
      </Alert>
    ) : accessState === 'auth-unavailable' ? (
      <Alert className="ui-alert-warning">
        <Info className="h-4 w-4" />
        <AlertTitle className="font-bold">
          Plugin management unavailable
        </AlertTitle>
        <AlertDescription>
          Plugin management requires Firebase authentication, which is not
          configured for this deployment.
        </AlertDescription>
      </Alert>
    ) : null;

  return (
    <PluginPageShell
      title="Plugins"
      description="Enable or disable installed plugins, and review plugin issues."
      className="max-w-4xl"
      contentClassName={PLUGIN_PAGE_CLASS_PATTERNS.verticalSpacing}
    >
      {accessAlert}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-headline-sm">Installed Plugins</h3>
          {canManagePlugins && lastUpdatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {lastUpdatedAt.toLocaleString()}
            </p>
          )}
        </div>
        {canManagePlugins && (
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
        )}
      </div>

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

      <div className="mt-8">
        <h3 className="text-headline-sm mb-4">Issue details</h3>
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
            Plugin issue details are unavailable because plugin loading failed.
            Retry loading installed plugins.
          </p>
        ) : installedPluginsViewState === 'empty' ? (
          <p className="text-sm text-muted-foreground">
            No installed plugins were found, so there are no issue details to
            display.
          </p>
        ) : (
          <div className="space-y-4">
            {installedPlugins.map((plugin) => {
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
                  className="py-4 first:pt-0 border-t border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.15,transparent)] first:border-0"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="font-semibold">{plugin.id}</div>
                    <div className="flex items-center gap-2">
                      {plugin.maturity ? (
                        <Badge
                          variant="outline"
                          className={
                            resolvePluginTierPresentation(plugin.maturity.tier)
                              .toneClass
                          }
                        >
                          {
                            resolvePluginTierPresentation(plugin.maturity.tier)
                              .label
                          }{' '}
                          {plugin.maturity.score}/100
                        </Badge>
                      ) : null}
                      <Badge
                        className={resolvePluginSeverityToneClass(
                          summarySeverity
                        )}
                        data-severity={summarySeverity}
                      >
                        {severityLabel(summarySeverity)}
                      </Badge>
                      {scoredWithContractIssues ? (
                        <Badge variant="outline" className="ui-pill-warning">
                          Scored with contract issues
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {blockingIssues.length > 0 ? (
                    <Alert className="border-destructive/30 bg-destructive/5 mb-3">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <AlertTitle>Blocking contract issues</AlertTitle>
                      <AlertDescription>
                        Fix errors in the plugin folder (entrypoint, component
                        mapping, README) before activation.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {plugin.maturity ? (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-foreground">
                        Maturity guidance
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
                              className={resolvePluginSeverityToneClass(
                                issue.severity
                              )}
                              data-severity={issue.severity}
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
          </div>
        )}
      </div>
    </PluginPageShell>
  );
}
