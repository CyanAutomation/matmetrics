import {
  buttonHtml,
  mountButton,
  type ButtonVariant,
} from './button';
import type { ComponentController } from './component';
import { dialogHtml, mountDialog, type DialogContent } from './dialog';

export interface ConfirmationDialogProps extends DialogContent {
  open: boolean;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  confirmVariant?: ButtonVariant;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onConfirmError?: (error: unknown) => void;
}

/** Render a native modal confirmation using the shared dialog and button primitives. */
export function confirmationDialogHtml(props: ConfirmationDialogProps): string {
  const busy = Boolean(props.pending);
  const actions = `<div class="ui-confirmation-dialog__actions">
    ${buttonHtml({
      label: props.cancelLabel,
      variant: 'outline',
      disabled: busy,
      dataAction: 'confirmation-cancel',
      onClick: () => {},
    })}
    ${buttonHtml({
      label: busy ? (props.pendingLabel ?? `${props.confirmLabel}…`) : props.confirmLabel,
      variant: props.confirmVariant ?? 'destructive',
      disabled: busy,
      ariaBusy: busy,
      dataAction: 'confirmation-submit',
      onClick: () => {},
    })}
  </div>`;

  return dialogHtml(props, actions);
}

/** Mount a confirmation dialog and own its controls until destroy is called. */
export function mountConfirmationDialog(
  dialog: HTMLDialogElement,
  initialProps: ConfirmationDialogProps
): ComponentController<ConfirmationDialogProps> {
  const cancelButton = dialog.querySelector<HTMLButtonElement>(
    '[data-ui-action="confirmation-cancel"]'
  );
  const confirmButton = dialog.querySelector<HTMLButtonElement>(
    '[data-ui-action="confirmation-submit"]'
  );
  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]');
  const title = dialog.querySelector<HTMLElement>('[data-dialog-title]');
  const description = dialog.querySelector<HTMLElement>('[data-dialog-description]');
  if (!cancelButton || !confirmButton || !closeButton || !title || !description) {
    throw new Error('Confirmation dialog markup is incomplete');
  }
  const dialogCloseButton = closeButton;

  let current = initialProps;
  let submitting = false;

  const requestClose = (afterConfirm = false) => {
    if (!afterConfirm && (current.pending || submitting)) return;
    if (!dialog.open || (afterConfirm && !current.open)) return;
    current.onOpenChange(false);
  };

  function updateButtons(): void {
    const busy = Boolean(current.pending || submitting);
    dialogCloseButton.disabled = busy;
    cancelController.update({
      label: current.cancelLabel,
      variant: 'outline',
      disabled: busy,
      dataAction: 'confirmation-cancel',
      onClick: () => requestClose(),
    });
    confirmController.update({
      label: busy
        ? (current.pendingLabel ?? `${current.confirmLabel}…`)
        : current.confirmLabel,
      variant: current.confirmVariant ?? 'destructive',
      disabled: busy,
      ariaBusy: busy,
      dataAction: 'confirmation-submit',
      onClick: submit,
    });
  }

  function submit(): void {
    if (current.pending || submitting) return;
    submitting = true;
    updateButtons();
    let action: void | Promise<void>;
    try {
      action = current.onConfirm();
    } catch (error) {
      reportError(error);
      submitting = false;
      updateButtons();
      return;
    }
    void Promise.resolve(action)
      .then(() => requestClose(true))
      .catch(reportError)
      .finally(() => {
        submitting = false;
        updateButtons();
      });
  }

  function reportError(error: unknown): void {
    try {
      current.onConfirmError?.(error);
    } catch {
      // Keep a reporting callback from leaving the dialog in a stuck state.
    }
  }

  const cancelController = mountButton(cancelButton, {
    label: current.cancelLabel,
    variant: 'outline',
    disabled: Boolean(current.pending),
    dataAction: 'confirmation-cancel',
    onClick: () => requestClose(),
  });
  const confirmController = mountButton(confirmButton, {
    label: current.pending
      ? (current.pendingLabel ?? `${current.confirmLabel}…`)
      : current.confirmLabel,
    variant: current.confirmVariant ?? 'destructive',
    disabled: Boolean(current.pending),
    ariaBusy: Boolean(current.pending),
    dataAction: 'confirmation-submit',
    onClick: submit,
  });
  updateButtons();
  const dialogController = mountDialog(dialog, {
    open: current.open,
    onOpenChange: (open) => {
      if (open) current.onOpenChange(true);
      else requestClose();
    },
  });

  const update = (next: ConfirmationDialogProps) => {
    current = next;
    dialog.id = next.id;
    title.id = `${next.id}-title`;
    description.id = `${next.id}-description`;
    title.textContent = next.title;
    description.textContent = next.description;
    dialog.setAttribute('aria-labelledby', `${next.id}-title`);
    dialog.setAttribute('aria-describedby', `${next.id}-description`);
    dialog.classList.toggle('ui-dialog--wide', next.size === 'wide');
    updateButtons();
    dialogController.update({
      open: next.open,
      onOpenChange: (open) => {
        if (open) current.onOpenChange(true);
        else requestClose();
      },
    });
  };

  return {
    update,
    destroy() {
      cancelController.destroy();
      confirmController.destroy();
      dialogController.destroy();
    },
  };
}
