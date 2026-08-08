import { useCallback } from 'react';

type ValidationController = {
  scanFiles: () => Promise<void>;
  previewFixes: (selectedPaths: string[]) => Promise<void>;
  applyFixes: (selectedPaths: string[]) => Promise<void>;
  cancelOperation: () => void;
};

export function useLogDoctorValidationActions({
  controller,
  selectedPaths,
  selectedCount,
  branch,
  toast,
  setShowApplyConfirmation,
  emitAction,
}: {
  controller: ValidationController;
  selectedPaths: string[];
  selectedCount: number;
  branch: string;
  toast: (config: {
    variant?: 'destructive';
    title?: string;
    description?: string;
  }) => unknown;
  setShowApplyConfirmation: (open: boolean) => void;
  emitAction: (
    stage: 'opened' | 'confirmed' | 'canceled',
    metadata?: Record<string, string | number | boolean>
  ) => void;
}) {
  const handleScan = useCallback(async () => {
    try {
      await controller.scanFiles();
    } catch (error) {
      console.error('Failed to scan files:', error);
    }
  }, [controller]);

  const handlePreviewFixes = useCallback(async () => {
    if (selectedPaths.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Select at least one file before previewing fixes.',
      });
      return;
    }
    try {
      await controller.previewFixes(selectedPaths);
    } catch (error) {
      console.error('Failed to preview fixes:', error);
    }
  }, [controller, selectedPaths, toast]);

  const handleApplyFixes = useCallback(() => {
    setShowApplyConfirmation(true);
    emitAction('opened', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
  }, [branch, emitAction, selectedCount, setShowApplyConfirmation]);

  const handleCancelApplyConfirmation = useCallback(() => {
    setShowApplyConfirmation(false);
    emitAction('canceled', { selectedCount });
  }, [emitAction, selectedCount, setShowApplyConfirmation]);

  const handleConfirmApplyFixes = useCallback(async () => {
    if (selectedPaths.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Select at least one file before applying fixes.',
      });
      return;
    }
    emitAction('confirmed', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
    setShowApplyConfirmation(false);
    try {
      await controller.applyFixes(selectedPaths);
    } catch (error) {
      console.error('Failed to apply fixes:', error);
    }
  }, [
    branch,
    controller,
    emitAction,
    selectedCount,
    selectedPaths,
    setShowApplyConfirmation,
    toast,
  ]);

  return {
    handleScan,
    handlePreviewFixes,
    handleApplyFixes,
    handleCancelApplyConfirmation,
    handleConfirmApplyFixes,
    handleCancelActiveOperation: controller.cancelOperation,
  };
}
