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
  initializeStorage,
  getSyncStatus,
  saveSession,
} from '@/lib/storage';
import { JudoSession } from '@/lib/types';
import {
  Info,
  Plus,
  WifiOff,
  Loader2,
  CheckCircle,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { isSameMonthAndYear } from '@/lib/utils';
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
  type TabId,
} from '@/lib/navigation/tab-definitions';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';

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
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImportingGuestData, setIsImportingGuestData] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [guestWorkspace, setGuestWorkspace] = useState(() =>
    getGuestWorkspaceSummary()
  );

  const resolvedPluginTabs = mapDashboardExtensionsToTabs(
    loadEnabledDashboardTabExtensions()
  );
  const allTabs =
    resolvedPluginTabs.length > 0
      ? [...coreTabs, ...resolvedPluginTabs]
      : [...coreTabs];

  const refreshSessions = useCallback(() => {
    setSessions(getSessions());
    setSyncStatus(getSyncStatus());
    setGuestWorkspace(getGuestWorkspaceSummary());
  }, []);

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

    setIsAuthDialogOpen(false);
    setIsImportDialogOpen(shouldPromptGuestImport(user.uid));
  }, [user, sessions.length]);

  const handleSessionAdded = () => {
    refreshSessions();
    setIsLogModalOpen(false);
    if (activeTab !== TAB_IDS.history) setActiveTab(TAB_IDS.history);
  };

  const handleDismissGuestImport = () => {
    if (!user) {
      return;
    }

    dismissGuestImport(user.uid);
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

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar className="border-r border-primary/10">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <MatMetricsLogo size="md" variant="solid" />
              <div>
                <div className="font-headline font-black text-2xl tracking-tighter text-primary">
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
                      className="py-6 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
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
            <Separator className="my-6 bg-primary/5" />
            <div className="px-4 py-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
                Training Stats
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Sessions</span>
                  <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {sessions.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">This Month</span>
                  <span className="text-sm font-bold bg-accent/10 text-accent-foreground px-2 py-0.5 rounded">
                    {
                      sessions.filter((s) =>
                        isSameMonthAndYear(s.date, new Date())
                      ).length
                    }
                  </span>
                </div>
              </div>
            </div>
          </SidebarContent>
          <SidebarFooter className="p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Info className="h-3 w-3" />
                <span>v1.2.0 Stable</span>
              </div>
              {isGuest ? (
                <div className="flex items-center gap-2 text-xs font-medium pt-2 px-2 py-1 rounded bg-muted/50">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-primary">
                    {guestWorkspace.source === 'custom'
                      ? 'Local guest data'
                      : 'Demo data loaded'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-medium pt-2 px-2 py-1 rounded bg-muted/50">
                  {!syncStatus.isOnline ? (
                    <>
                      <WifiOff className="h-3 w-3 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400">
                        Offline
                      </span>
                      {syncStatus.pendingCount > 0 && (
                        <span className="ml-auto text-amber-600 dark:text-amber-400">
                          {syncStatus.pendingCount} pending
                        </span>
                      )}
                    </>
                  ) : syncStatus.isSyncing ? (
                    <>
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                      <span className="text-blue-600 dark:text-blue-400">
                        Syncing...
                      </span>
                    </>
                  ) : syncStatus.pendingCount > 0 ? (
                    <>
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                      <span className="text-blue-600 dark:text-blue-400">
                        {syncStatus.pendingCount} syncing
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        Synced
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col bg-background/50 overflow-hidden relative">
          <header className="h-16 border-b flex items-center px-6 justify-between bg-white/80 dark:bg-card/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <h2 className="text-xl font-bold tracking-tight text-primary">
                {selectedTab?.headerTitle ?? 'MatMetrics'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => setIsLogModalOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <ModeToggle />
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-sm font-bold">
                  {user?.displayName || user?.email || 'Guest Mode'}
                </span>
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                  {user?.email || guestBadgeLabel}
                </span>
              </div>
              {user ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void signOutUser()}
                  className="text-muted-foreground"
                >
                  Logout
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAuthDialogOpen(true)}
                  className="text-muted-foreground"
                >
                  {authAvailable ? 'Sign in' : 'Sign-in info'}
                </Button>
              )}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border-2 border-primary/20">
                {initials}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 space-y-6">
              {isGuest && (
                <Alert className="border-primary/20 bg-primary/5">
                  <LockKeyhole className="h-4 w-4 text-primary" />
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

              {selectedTab?.render({
                sessions,
                refreshSessions,
              })}
            </div>
          </main>
          <div className="fixed bottom-6 right-6 md:hidden z-50">
            <Button
              size="icon"
              className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform"
              onClick={() => setIsLogModalOpen(true)}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </SidebarInset>
      </div>

      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {isLogModalOpen && (
            <>
              <div className="flex flex-col sm:flex-row items-start gap-6 mb-2">
                <RessaImage
                  pose={1}
                  size="medium"
                  className="shrink-0 mt-1"
                  alt="Ressa in coach mode, ready to help log your training session"
                />
                <div className="flex-1">
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-2xl font-bold">
                      Log Practice Session
                    </DialogTitle>
                    <DialogDescription>
                      Record your techniques and reflections.
                    </DialogDescription>
                  </DialogHeader>
                </div>
              </div>
              <div className="py-2">
                <SessionLogForm
                  key="quick-log-instance"
                  onSuccess={handleSessionAdded}
                  onCancel={() => setIsLogModalOpen(false)}
                  hideHeader={true}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
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
    </SidebarProvider>
  );
}
