'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  SidebarInset,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { SessionLogForm } from '@/components/session-log-form';
import { MatMetricsLogo } from '@/components/matmetrics-logo';
import {
  getSessions,
  getSessionFileIssues,
  initializeStorage,
  getSyncStatus,
  saveSession,
} from '@/lib/storage';
import { JudoSession, SessionFileIssue } from '@/lib/types';
import {
  Info,
  Plus,
  WifiOff,
  Loader2,
  LockKeyhole,
  Sparkles,
  History,
  LogOut,
  LogIn,
} from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { VersionHistoryModal } from '@/components/version-history-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/auth-provider';
import { SignInScreen } from '@/components/sign-in-screen';
import { RessaImage } from '@/components/ressa-image';
import {
  clearGuestWorkspaceAfterImport,
  dismissGuestImport,
  getGuestSessionsForImport,
  getGuestWorkspaceSummary,
  retainGuestSessionsAfterPartialImport,
  shouldPromptGuestImport,
} from '@/lib/guest-mode';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  coreTabs,
  mapDashboardExtensionsToTabs,
  TAB_IDS,
  type TabDefinition,
  type TabId,
} from '@/lib/navigation/tab-definitions';
import { type ResolvedDashboardTabExtension } from '@/lib/plugins/types';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';
import { loadDashboardTabExtensions } from '@/lib/plugins/load-dashboard-tab-extensions';

const legacyPluginRegistryFallbackEnabled =
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_PLUGIN_REGISTRY === 'true';

export default function Home() {
  const { toast } = useToast();
  const {
    authReady,
    preferencesReady,
    user,
    signOutUser,
    authMode,
    authAvailable,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>(TAB_IDS.dashboard);
  const [sessions, setSessions] = useState<JudoSession[]>([]);
  const [sessionFileIssues, setSessionFileIssues] = useState<
    SessionFileIssue[]
  >([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isImportingGuestData, setIsImportingGuestData] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [guestWorkspace, setGuestWorkspace] = useState(() =>
    getGuestWorkspaceSummary()
  );
  const [pluginExtensions, setPluginExtensions] = useState<
    ResolvedDashboardTabExtension[]
  >(() =>
    legacyPluginRegistryFallbackEnabled
      ? loadEnabledDashboardTabExtensions()
      : []
  );

  const [resolvedPluginTabs, setResolvedPluginTabs] = useState<TabDefinition[]>(
    []
  );

  useEffect(() => {
    let cancelled = false;

    const resolvePluginTabs = async () => {
      const tabs = await mapDashboardExtensionsToTabs(pluginExtensions);
      if (!cancelled) {
        setResolvedPluginTabs(tabs);
      }
    };

    void resolvePluginTabs();

    return () => {
      cancelled = true;
    };
  }, [pluginExtensions]);

  const allTabs = React.useMemo(
    () =>
      resolvedPluginTabs.length > 0
        ? [...coreTabs, ...resolvedPluginTabs]
        : [...coreTabs],
    [resolvedPluginTabs]
  );

  const refreshSessions = useCallback(() => {
    setSessions(getSessions());
    setSessionFileIssues(getSessionFileIssues());
    setSyncStatus(getSyncStatus());
    setGuestWorkspace(getGuestWorkspaceSummary());
  }, []);

  const refreshPluginExtensions = useCallback(async () => {
    const nextExtensions = await loadDashboardTabExtensions({
      useLegacyRegistryFallback: legacyPluginRegistryFallbackEnabled,
      fallbackLoader: loadEnabledDashboardTabExtensions,
    });

    setPluginExtensions(nextExtensions);
  }, []);

  useEffect(() => {
    void refreshPluginExtensions();
  }, [refreshPluginExtensions]);

  useEffect(() => {
    initializeStorage();
    refreshSessions();

    const handleStorageSync = () => {
      refreshSessions();
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key?.startsWith('matmetrics_sessions:')) {
        refreshSessions();
      }
    };

    window.addEventListener('storageSync', handleStorageSync);
    window.addEventListener('storage', handleStorageChange);

    const statusInterval = setInterval(() => {
      setSyncStatus(getSyncStatus());
    }, 500);

    return () => {
      window.removeEventListener('storageSync', handleStorageSync);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(statusInterval);
    };
  }, [refreshSessions, user?.uid, authMode]);

  useEffect(() => {
    if (!user) {
      setIsImportDialogOpen(false);
      return;
    }

    let cancelled = false;

    const updateImportDialogState = async () => {
      const shouldPrompt = await shouldPromptGuestImport(user.uid);
      if (!cancelled) {
        setIsImportDialogOpen(shouldPrompt);
      }
    };

    setIsAuthDialogOpen(false);
    void updateImportDialogState();

    return () => {
      cancelled = true;
    };
  }, [user, sessions.length]);

  const handleSessionAdded = () => {
    refreshSessions();
    setIsLogModalOpen(false);
    if (activeTab !== TAB_IDS.history) setActiveTab(TAB_IDS.history);
  };

  const handleDismissGuestImport = async () => {
    if (!user) {
      return;
    }

    await dismissGuestImport(user.uid);
    setIsImportDialogOpen(false);
  };

  const handleImportGuestData = async () => {
    if (!user) {
      return;
    }

    setIsImportingGuestData(true);
    try {
      const guestSessions = getGuestSessionsForImport();
      const results = await Promise.allSettled(
        guestSessions.map(async (session) => ({
          session,
          result: await saveSession(session),
        }))
      );
      const successfulSessions = results.flatMap((entry) =>
        entry.status === 'fulfilled' ? [entry.value] : []
      );
      const permanentlyFailedSessions = results.flatMap((entry, index) =>
        entry.status === 'rejected' ? [guestSessions[index]] : []
      );

      if (permanentlyFailedSessions.length === 0) {
        clearGuestWorkspaceAfterImport();
      } else {
        retainGuestSessionsAfterPartialImport(permanentlyFailedSessions);
      }

      refreshSessions();
      if (permanentlyFailedSessions.length === 0) {
        setIsImportDialogOpen(false);
        const queuedCount = successfulSessions.filter(
          ({ result }) => result.status === 'queued'
        ).length;
        toast({
          title: 'Guest sessions imported',
          description:
            queuedCount > 0
              ? `${successfulSessions.length} session${successfulSessions.length === 1 ? '' : 's'} moved into your account. ${queuedCount} ${queuedCount === 1 ? 'is' : 'are'} queued to finish syncing.`
              : `${successfulSessions.length} local session${successfulSessions.length === 1 ? '' : 's'} moved into your account.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Guest import incomplete',
          description: `${successfulSessions.length} session${successfulSessions.length === 1 ? '' : 's'} imported, ${permanentlyFailedSessions.length} left in guest mode for retry.`,
        });
      }
    } finally {
      setIsImportingGuestData(false);
    }
  };

  const isGuest = authMode === 'guest';
  const visibleTabs = allTabs.filter(
    (tab) =>
      tab.isVisible?.({
        hasUser: Boolean(user),
        isGuest,
        authAvailable,
      }) ?? true
  );
  const selectedTab =
    visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0] ?? null;

  if (!authReady || !preferencesReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading your workspace...</span>
        </div>
      </div>
    );
  }

  const initials = (
    user?.displayName ||
    user?.email ||
    (isGuest ? 'Guest' : 'MM')
  )
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const guestBadgeLabel =
    guestWorkspace.source === 'custom' ? 'Guest Workspace' : 'Demo Preview';

  const syncStatusText = !syncStatus.isOnline
    ? 'Offline'
    : syncStatus.isSyncing
      ? 'Syncing'
      : syncStatus.pendingCount > 0
        ? `${syncStatus.pendingCount} pending`
        : 'Synced';
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-[hsl(var(--color-surface-container-low))]">
        <Sidebar className="glass-surface bg-sidebar/90 shadow-[inset_-1px_0_0_hsl(var(--sidebar-border)/0.12)] [[data-contrast='high']_&]:shadow-[inset_-1px_0_0_hsl(var(--color-outline-variant)/0.92)]">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <MatMetricsLogo size="md" variant="solid" />
              <div>
                <div className="text-display-sm font-black text-primary">
                  MatMetrics
                </div>
                {isGuest && (
                  <Badge variant="outline" className="mt-1 border-primary/20">
                    {guestBadgeLabel}
                  </Badge>
                )}
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2">
            <SidebarMenu className="gap-2">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      isActive={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="py-6 rounded-xl data-[active=true]:bg-[hsl(var(--color-primary-fixed))] data-[active=true]:text-[hsl(var(--color-on-primary-fixed))]"
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-base font-semibold">
                        {tab.title}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          {isGuest && (
            <SidebarFooter className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded-xl bg-[hsl(var(--color-surface-container-low))]">
                <Sparkles className="h-3 w-3 text-[hsl(var(--color-on-primary-fixed))]" />
                <span className="text-[hsl(var(--color-on-primary-fixed))]">
                  {guestWorkspace.source === 'custom'
                    ? 'Local guest data'
                    : 'Demo data loaded'}
                </span>
              </div>
            </SidebarFooter>
          )}
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col bg-background overflow-hidden relative">
          <header className="glass-surface h-14 flex items-center px-6 justify-between sticky top-0 z-10 border-b border-[color:color-mix(in_srgb,var(--color-outline-variant)_0.12,transparent)]">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <h2 className="font-semibold tracking-tight text-foreground">
                {selectedTab?.headerTitle ?? 'MatMetrics'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!syncStatus.isOnline && (
                <span title="Offline" className="flex items-center">
                  <WifiOff className="h-4 w-4 text-[hsl(var(--color-on-warning-container))]" />
                </span>
              )}
              {syncStatus.isOnline && (syncStatus.isSyncing || syncStatus.pendingCount > 0) && (
                <span title={syncStatusText} className="flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--color-on-info-container))]" />
                </span>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-[hsl(var(--color-outline-variant)/0.15)] text-primary hover:bg-[hsl(var(--color-primary-fixed))]"
                onClick={() => setIsLogModalOpen(true)}
                title="Log a session"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <ModeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-9 h-9 rounded-full bg-[hsl(var(--color-primary-fixed))] flex items-center justify-center text-[hsl(var(--color-on-primary-fixed))] font-semibold text-sm cursor-pointer hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="font-semibold truncate">
                      {user?.displayName || user?.email || 'Guest Mode'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user?.email || guestBadgeLabel}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsVersionHistoryOpen(true)}>
                    <History className="mr-2 h-4 w-4" />
                    Version History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user ? (
                    <DropdownMenuItem
                      onClick={() => void signOutUser()}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setIsAuthDialogOpen(true)}>
                      <LogIn className="mr-2 h-4 w-4" />
                      {authAvailable ? 'Sign In' : 'Sign-in Info'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
            <div className="space-y-6">
              {isGuest && (
                <Alert className="border-[hsl(var(--color-outline-variant)/0.15)] bg-[hsl(var(--color-primary-fixed)/0.45)] shadow-[0_16px_30px_-28px_hsl(var(--primary)/0.18)]">
                  <LockKeyhole className="h-4 w-4 text-[hsl(var(--color-on-primary-fixed))]" />
                  <AlertTitle className="flex items-center gap-2">
                    Guest access is active
                    <Badge variant="outline">{guestBadgeLabel}</Badge>
                  </AlertTitle>
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {guestWorkspace.source === 'custom'
                        ? 'You can keep logging sessions locally in this browser. Sign in to unlock AI tools, GitHub sync, and cloud-backed preferences.'
                        : 'You are browsing a seeded preview workspace. Start editing to turn it into your own local guest workspace.'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setIsAuthDialogOpen(true)}
                      variant="outline"
                    >
                      {authAvailable
                        ? 'Sign in to unlock more'
                        : 'View sign-in setup'}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {!isGuest && sessionFileIssues.length > 0 && (
                <Alert className="ui-alert-warning">
                  <Info className="h-4 w-4" />
                  <AlertTitle>
                    {sessionFileIssues.length} GitHub session file
                    {sessionFileIssues.length === 1 ? '' : 's'} skipped
                  </AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs sm:text-sm">
                      {sessionFileIssues.slice(0, 3).map((issue) => (
                        <li key={`${issue.filePath}-${issue.code}`}>
                          <span className="font-medium">{issue.filePath}</span>:{' '}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                    {sessionFileIssues.length > 3 && (
                      <p className="mt-2 text-xs">
                        {sessionFileIssues.length - 3} more issue
                        {sessionFileIssues.length - 3 === 1 ? '' : 's'} not
                        shown.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {selectedTab?.render({
                sessions,
                refreshSessions,
                refreshPluginExtensions,
                onLogSession: () => setIsLogModalOpen(true),
              })}
            </div>
          </main>
          <div className="fixed bottom-6 right-6 md:hidden z-50">
            <Button
              size="icon"
              className="h-14 w-14 rounded-full hover:scale-105 transition-transform"
              onClick={() => setIsLogModalOpen(true)}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </SidebarInset>
      </div>

      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">Log practice session</DialogTitle>
          {isLogModalOpen && (
            <SessionLogForm
              key="quick-log-instance"
              onSuccess={handleSessionAdded}
              onCancel={() => setIsLogModalOpen(false)}
              hideHeader={true}
              showAvatar={true}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogTitle className="sr-only">Sign in to MatMetrics</DialogTitle>
          <SignInScreen onContinueAsGuest={() => setIsAuthDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex flex-col sm:flex-row items-start gap-4 mb-2">
            <RessaImage
              pose={4}
              size="compact"
              className="shrink-0"
              alt="Ressa excited about importing your sessions"
            />
            <DialogHeader>
              <DialogTitle>Import your guest sessions?</DialogTitle>
              <DialogDescription>
                You have local guest sessions in this browser. Import them into
                your signed-in account or keep them separate.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={handleDismissGuestImport}>
              Keep separate
            </Button>
            <Button
              onClick={() => void handleImportGuestData()}
              disabled={isImportingGuestData}
            >
              {isImportingGuestData ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Import guest sessions
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <VersionHistoryModal
        open={isVersionHistoryOpen}
        onOpenChange={setIsVersionHistoryOpen}
      />
    </SidebarProvider>
  );
}
