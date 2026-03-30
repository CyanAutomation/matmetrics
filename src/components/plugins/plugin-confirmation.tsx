'use client';

import * as React from 'react';

import { usePluginConfirmation } from '@/hooks/use-plugin-confirmation';
import type { PluginTypedConfirmationConfig } from '@/hooks/use-plugin-confirmation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PluginConfirmationProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  isPending?: boolean;
  confirmVariant?: React.ComponentProps<typeof Button>['variant'];
  titleClassName?: string;
  typedConfirmation?: PluginTypedConfirmationConfig;
  children?: React.ReactNode;
};

export function PluginConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  cancelDisabled = false,
  isPending = false,
  confirmVariant = 'destructive',
  titleClassName = 'text-destructive',
  typedConfirmation,
  children,
}: PluginConfirmationProps) {
  const {
    typedValue,
    setTypedValue,
    canConfirmTypedInput,
    resetTypedValue,
    handleOpenChange,
  } = usePluginConfirmation({
    open,
    onOpenChange,
    isPending,
    typedConfirmation,
  });

  const handleCancel = () => {
    if (cancelDisabled || isPending) {
      return;
    }

    resetTypedValue();
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (confirmDisabled || isPending || !canConfirmTypedInput) {
      return;
    }

    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={titleClassName}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {typedConfirmation && (
          <div className="space-y-2">
            <Label htmlFor="plugin-confirmation-input">
              {typedConfirmation.inputLabel ?? 'Confirmation text'}
            </Label>
            <Input
              id="plugin-confirmation-input"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              placeholder={
                typedConfirmation.inputPlaceholder ??
                `Type ${typedConfirmation.requiredText}`
              }
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {typedConfirmation.helperText ??
                `Type ${typedConfirmation.requiredText} to continue.`}
            </p>
          </div>
        )}
        {children}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelDisabled || isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={confirmDisabled || isPending || !canConfirmTypedInput}
          >
            {isPending ? pendingLabel ?? confirmLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
