'use client';

import { Loader2 } from 'lucide-react';
import { SessionLogForm } from '@/components/session-log-form';
import { SignInScreen } from '@/components/sign-in-screen';
import { RessaImage } from '@/components/ressa-image';
import { VersionHistoryModal } from '@/components/version-history-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type DashboardDialogsProps = {
  isLogModalOpen: boolean;
  setIsLogModalOpen: (open: boolean) => void;
  isAuthDialogOpen: boolean;
  setIsAuthDialogOpen: (open: boolean) => void;
  isImportDialogOpen: boolean;
  setIsImportDialogOpen: (open: boolean) => void;
  isImportingGuestData: boolean;
  isVersionHistoryOpen: boolean;
  setIsVersionHistoryOpen: (open: boolean) => void;
  onSessionAdded: () => void;
  onDismissGuestImport: () => void;
  onImportGuestData: () => void;
};

export function DashboardDialogs({
  isLogModalOpen,
  setIsLogModalOpen,
  isAuthDialogOpen,
  setIsAuthDialogOpen,
  isImportDialogOpen,
  setIsImportDialogOpen,
  isImportingGuestData,
  isVersionHistoryOpen,
  setIsVersionHistoryOpen,
  onSessionAdded,
  onDismissGuestImport,
  onImportGuestData,
}: DashboardDialogsProps) {
  return (
    <>
      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="sticky top-0 z-20 border-b bg-card/95 px-5 py-4 backdrop-blur sm:px-6">
            <DialogTitle>Log training</DialogTitle>
            <DialogDescription>
              Capture the essentials now; add reflection and media only when useful.
            </DialogDescription>
          </DialogHeader>
          {isLogModalOpen && (
            <SessionLogForm
              key="quick-log-instance"
              onSuccess={onSessionAdded}
              onCancel={() => setIsLogModalOpen(false)}
              hideHeader
              showAvatar
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogTitle className="sr-only">Sign in to MatMetrics</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in to sync your training sessions and unlock account features.
          </DialogDescription>
          <SignInScreen
            onContinueAsGuest={() => setIsAuthDialogOpen(false)}
            onAuthenticated={() => setIsAuthDialogOpen(false)}
          />
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
            <Button variant="ghost" onClick={onDismissGuestImport}>
              Keep separate
            </Button>
            <Button onClick={onImportGuestData} disabled={isImportingGuestData}>
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
    </>
  );
}
