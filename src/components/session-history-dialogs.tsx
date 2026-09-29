'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionLogForm } from '@/components/session-log-form';
import type { JudoSession } from '@/lib/types';
import { formatDateLabel, parseDateOnly } from '@/lib/utils';

interface SessionHistoryDialogsProps {
  editingSession: JudoSession | null;
  sessionPendingDeletion: JudoSession | null;
  deletingSessionId: string | null;
  onCloseEdit: () => void;
  onEditSaved: (session: JudoSession) => void;
  onCloseDelete: () => void;
  onDelete: (session: JudoSession) => Promise<void>;
}

export function SessionHistoryDialogs({
  editingSession,
  sessionPendingDeletion,
  deletingSessionId,
  onCloseEdit,
  onEditSaved,
  onCloseDelete,
  onDelete,
}: SessionHistoryDialogsProps) {
  return (
    <>
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && onCloseEdit()}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold">
              Edit Practice Session
            </DialogTitle>
            <DialogDescription>
              Update your practice description, techniques, effort, or notes.
            </DialogDescription>
          </DialogHeader>
          {editingSession ? (
            <div className="py-2">
              <SessionLogForm
                sessionToEdit={editingSession}
                onSuccess={() => onEditSaved(editingSession)}
                onCancel={onCloseEdit}
                showAvatar={false}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!sessionPendingDeletion}
        onOpenChange={(open) => {
          if (!open && !deletingSessionId) onCloseDelete();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {sessionPendingDeletion
                ? `This permanently removes the ${formatDateLabel(
                    parseDateOnly(sessionPendingDeletion.date),
                    'month-day-year'
                  )} training session from your history.`
                : 'This permanently removes the training session from your history.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!!deletingSessionId}
              onClick={onCloseDelete}
            >
              Keep session
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!!deletingSessionId}
              onClick={() => {
                if (!sessionPendingDeletion) return;
                void onDelete(sessionPendingDeletion).then(onCloseDelete);
              }}
            >
              {deletingSessionId ? 'Deleting…' : 'Delete session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
