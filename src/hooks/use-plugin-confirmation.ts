import { useCallback, useEffect, useMemo, useState } from 'react';

export type PluginTypedConfirmationConfig = {
  requiredText: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  helperText?: string;
};

export function usePluginConfirmation({
  open,
  onOpenChange,
  isPending,
  typedConfirmation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  typedConfirmation?: PluginTypedConfirmationConfig;
}) {
  const [typedValue, setTypedValue] = useState('');

  const resetTypedValue = useCallback(() => {
    setTypedValue('');
  }, []);

  useEffect(() => {
    if (!open) {
      resetTypedValue();
    }
  }, [open, resetTypedValue]);

  const canConfirmTypedInput = useMemo(() => {
    if (!typedConfirmation) {
      return true;
    }

    return typedValue.trim() === typedConfirmation.requiredText;
  }, [typedConfirmation, typedValue]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isPending) {
        return;
      }

      if (!nextOpen) {
        resetTypedValue();
      }

      onOpenChange(nextOpen);
    },
    [isPending, onOpenChange, resetTypedValue]
  );

  return {
    typedValue,
    setTypedValue,
    resetTypedValue,
    canConfirmTypedInput,
    handleOpenChange,
  };
}
