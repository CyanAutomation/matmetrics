'use client';

import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

export function Toaster() {
  const { toasts } = useToast();

  useEffect(() => {
    if (toasts.length > 0) {
      document.body.dataset.snackbarVisible = 'true';
    } else {
      delete document.body.dataset.snackbarVisible;
    }
  }, [toasts]);

  useEffect(
    () => () => {
      delete document.body.dataset.snackbarVisible;
    },
    []
  );

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        variant,
        duration,
        ...props
      }) {
        return (
          <Toast
            key={id}
            {...props}
            variant={variant}
            duration={
              duration ??
              (action ? 7000 : variant === 'destructive' ? 8000 : 4000)
            }
            role={variant === 'destructive' ? 'alert' : 'status'}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
