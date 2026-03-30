'use client';

import type { ReactNode } from 'react';

import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';

type PluginDestructiveActionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  isPending?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  children?: ReactNode;
};

export const PLUGIN_DESTRUCTIVE_CONFIRM_LABEL = 'Confirm';
export const PLUGIN_DESTRUCTIVE_CANCEL_LABEL = 'Cancel';
export const PLUGIN_DESTRUCTIVE_PENDING_LABEL = 'Working...';

export function PluginDestructiveAction({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
  isPending,
  confirmLabel = PLUGIN_DESTRUCTIVE_CONFIRM_LABEL,
  cancelLabel = PLUGIN_DESTRUCTIVE_CANCEL_LABEL,
  pendingLabel = PLUGIN_DESTRUCTIVE_PENDING_LABEL,
  confirmDisabled,
  cancelDisabled,
  children,
}: PluginDestructiveActionProps) {
  return (
    <PluginConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      pendingLabel={pendingLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isPending={isPending}
      confirmDisabled={confirmDisabled}
      cancelDisabled={cancelDisabled}
      confirmVariant="destructive"
      titleClassName="text-destructive"
    >
      {children}
    </PluginConfirmationDialog>
  );
}
