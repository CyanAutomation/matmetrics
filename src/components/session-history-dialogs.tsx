'use client';

import { VanillaConfirmationDialog } from '@/components/vanilla-confirmation-dialog';
import { VanillaDialog } from '@/components/vanilla-dialog';
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
      <VanillaDialog
        open={!!editingSession}
        onOpenChange={(open) => !open && onCloseEdit()}
        title="Edit Practice Session"
        description="Update your practice description, techniques, effort, or notes."
        size="wide"
      >
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
      </VanillaDialog>

      <VanillaConfirmationDialog
        open={!!sessionPendingDeletion}
        onOpenChange={(open) => !open && onCloseDelete()}
        title="Delete this session?"
        description={
          sessionPendingDeletion
            ? `This permanently removes the ${formatDateLabel(
                parseDateOnly(sessionPendingDeletion.date),
                'month-day-year'
              )} training session from your history.`
            : 'This permanently removes the training session from your history.'
        }
        cancelLabel="Keep session"
        confirmLabel="Delete session"
        pendingLabel="Deleting…"
        pending={!!deletingSessionId}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (sessionPendingDeletion) await onDelete(sessionPendingDeletion);
        }}
      />
    </>
  );
}
