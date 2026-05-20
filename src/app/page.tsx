'use client';

import React from 'react';
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { SessionLogForm } from '@/components/session-log-form';
import {
  Info,
  Plus,
  WifiOff,
  Loader2,
  LockKeyhole,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DashboardNav } from '@/components/dashboard-nav';
import { TAB_IDS } from '@/lib/navigation/tab-definitions';
import { useDashboardState } from '@/hooks/use-dashboard-state';
import { useSessionsData } from '@/hooks/use-sessions-data';
import { usePluginTabs } from '@/hooks/use-plugin-tabs';
import { useGuestImport } from '@/hooks/use-guest-import';
import { useDashboardNavigation } from '@/hooks/use-dashboard-navigation';
import {
  getUserInitials,
  getSyncStatusText,
  getGuestModeAlertMessage,
  getSignInButtonText,
} from '@/lib/dashboard-utils';

const legacyPluginRegistryFallbackEnabled =
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_PLUGIN_REGISTRY === 'true';

export default function Home() {
  const {
    authReady,
    preferencesReady,
    user,
    signOutUser,
    authMode,
    authAvailable,
  } = useAuth();

  // Custom hooks for state management
  const { activeTab, setActiveTab } = useDashboardNavigation();
  const { sessions, sessionFileIssues, syncStatus, guestWorkspace, refreshSessions } =
    useSessionsData({ userId: user?.uid, authMode });
  const {
    isLogModalOpen,
    setIsLogModalOpen,
    isAuthDialogOpen,
    setIsAuthDialogOpen,
    isImportDialogOpen: _isImportDialogOpen,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
  } = useDashboardState();
  const {
    visibleTabs,
    selectedTab,
    refreshPluginExtensions,
  } = usePluginTabs({
    legacyPluginRegistryFallbackEnabled,
    activeTab,
    hasUser: Boolean(user),
    isGuest: authMode === 'guest',
    authAvailable,
  });
  const {
    isImportDialogOpen,
    setIsImportDialogOpen,
    isImportingGuestData,
    handleDismissGuestImport,
    handleImportGuestData,
  } = useGuestImport({
    userId: user?.uid,
    sessionsLength: sessions.length,
    onImportComplete: refreshSessions,
  });

  const handleSessionAdded = () => {
    refreshSessions();
    setIsLogModalOpen(false);
    if (activeTab !== TAB_IDS.history) setActiveTab(TAB_IDS.history);
  };

  const isGuest = authMode === 'guest';
  const initials = getUserInitials(user?.displayName, user?.email, isGuest);
  const syncStatusText = getSyncStatusText(syncStatus);
  const alertMessage = getGuestModeAlertMessage(
    guestWorkspace.source,
    authAvailable
  );
  const signInButtonText = getSignInButtonText(authAvailable);

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

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-[hsl(var(--color-surface-container-low))]">
        <DashboardNav
          activeTab={activeTab}
          visibleTabs={visibleTabs}
          onTabChange={setActiveTab}
          isGuest={isGuest}
          guestWorkspaceSource={guestWorkspace.source}
        />

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
              {syncStatus.isOnline &&
                (syncStatus.isSyncing || syncStatus.pendingCount > 0) && (
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
                      {user?.email || (guestWorkspace.source === 'custom' ? 'Guest Workspace' : 'Demo Preview')}
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
                    {guestWorkspace.source === 'custom' && (
                      <span className="text-xs px-2 py-1 rounded border border-current">
                        Guest Workspace
                      </span>
                    )}
                    {guestWorkspace.source === 'demo' && (
                      <span className="text-xs px-2 py-1 rounded border border-current">
                        Demo Preview
                      </span>
                    )}
                  </AlertTitle>
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{alertMessage}</span>
                    <Button
                      size="sm"
                      onClick={() => setIsAuthDialogOpen(true)}
                      variant="outline"
                    >
                      {signInButtonText}
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
