import { useState } from 'react';

import { ToastAction } from '@/components/ui/toast';
import {
  resolveResetDiagnosticsSnapshot,
  type DiagnosticsSnapshot,
} from '../components/log-doctor-state';

export function useLogDoctorReset({
  fileValidation,
  snapshot,
  setSelectedPaths,
  toast,
  emitAction,
}: {
  fileValidation: { reset: () => void };
  snapshot: DiagnosticsSnapshot;
  setSelectedPaths: (paths: string[]) => void;
  toast: (value: any) => void;
  emitAction: (stage: 'opened' | 'confirmed' | 'canceled' | 'undone') => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => {
    setIsOpen(true);
    emitAction('opened');
  };
  const cancel = () => {
    setIsOpen(false);
    emitAction('canceled');
  };
  const confirm = () => {
    const resolved = resolveResetDiagnosticsSnapshot(snapshot, true);
    setIsOpen(false);
    fileValidation.reset();
    setSelectedPaths(resolved.next.selectedPaths);
    emitAction('confirmed');
    if (!resolved.previous) return;
    toast({
      title: 'Diagnostics state reset',
      description: 'Cleared current scan and fix results. Undo is available.',
      action: (
        <ToastAction
          altText="Undo reset diagnostics state"
          onClick={() => {
            setSelectedPaths(resolved.previous?.selectedPaths ?? []);
            emitAction('undone');
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };
  return { isOpen, open, cancel, confirm };
}
