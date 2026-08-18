'use client';

import React from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Info, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DashboardNav } from '@/components/dashboard-nav';
import { DashboardDialogs } from '@/components/dashboard-dialogs';
import { DashboardHeader } from '@/components/dashboard-header';
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
  const {
    sessions,
    sessionFileIssues,
    syncStatus,
    guestWorkspace,
    refreshSessions,
  } = useSessionsData({ userId: user?.uid, authMode });
  const {
    isLogModalOpen,
    setIsLogModalOpen,
    isAuthDialogOpen,
    setIsAuthDialogOpen,
    isImportDialogOpen: _isImportDialogOpen,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
  } = useDashboardState();
  const { visibleTabs, selectedTab, refreshPluginExtensions } = usePluginTabs({
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
          <DashboardHeader
            title={selectedTab?.headerTitle ?? 'MatMetrics'}
            pageIcon={selectedTab?.icon ?? Info}
            isOnline={syncStatus.isOnline}
            isSyncing={syncStatus.isSyncing}
            pendingCount={syncStatus.pendingCount}
            syncStatusText={syncStatusText}
            initials={initials}
            displayName={user?.displayName}
            email={user?.email}
            guestWorkspaceLabel={
              guestWorkspace.source === 'custom'
                ? 'Guest Workspace'
                : 'Demo Preview'
            }
            hasUser={Boolean(user)}
            authAvailable={authAvailable}
            onLogSession={() => setIsLogModalOpen(true)}
            onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
            onSignOut={() => void signOutUser()}
            onOpenAuth={() => setIsAuthDialogOpen(true)}
          />

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
                isRefreshing: syncStatus.isSyncing,
              })}
            </div>
          </main>
        </SidebarInset>
      </div>

      <DashboardDialogs
        isLogModalOpen={isLogModalOpen}
        setIsLogModalOpen={setIsLogModalOpen}
        isAuthDialogOpen={isAuthDialogOpen}
        setIsAuthDialogOpen={setIsAuthDialogOpen}
        isImportDialogOpen={isImportDialogOpen}
        setIsImportDialogOpen={setIsImportDialogOpen}
        isImportingGuestData={isImportingGuestData}
        isVersionHistoryOpen={isVersionHistoryOpen}
        setIsVersionHistoryOpen={setIsVersionHistoryOpen}
        onSessionAdded={handleSessionAdded}
        onDismissGuestImport={handleDismissGuestImport}
        onImportGuestData={() => void handleImportGuestData()}
      />
    </SidebarProvider>
  );
}
