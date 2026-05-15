'use client';

import { useState } from 'react';

/**
 * Manages all modal and dialog open/close states for the dashboard
 */
export function useDashboardState() {
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  return {
    isLogModalOpen,
    setIsLogModalOpen,
    isAuthDialogOpen,
    setIsAuthDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
  };
}
