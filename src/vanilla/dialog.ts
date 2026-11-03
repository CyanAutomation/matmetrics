import { escapeHtml, type ComponentController } from './component';

export interface DialogContent {
  /** A unique, whitespace-free identifier for this dialog. */
  id: string;
  title: string;
  description: string;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The caller owns the content slot, including escaping its trusted HTML. */
export function dialogHtml(content: DialogContent, contentHtml = ''): string {
  const id = escapeHtml(content.id);
  return `<dialog class="ui-dialog" aria-labelledby="${id}-title" aria-describedby="${id}-description">
    <header class="ui-dialog__header"><h2 id="${id}-title" data-dialog-title>${escapeHtml(content.title)}</h2><p id="${id}-description" data-dialog-description>${escapeHtml(content.description)}</p></header>
    <button type="button" class="ui-dialog__close" data-dialog-close aria-label="Close">&#215;</button>
    <div class="ui-dialog__content" data-dialog-content>${contentHtml}</div>
  </dialog>`;
}

/** Native modal dialogs provide focus containment and inert background behavior. */
export function mountDialog(dialog: HTMLDialogElement, props: DialogProps): ComponentController<DialogProps> {
  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]');
  if (!closeButton) throw new Error('Dialog markup is incomplete');
  let current = props;
  let previousFocus: HTMLElement | null = null;
  const requestClose = () => current.onOpenChange(false);
  const cancel = (event: Event) => { event.preventDefault(); requestClose(); };
  const backdropClick = (event: MouseEvent) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
  };
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  const update = (next: DialogProps) => {
    current = next;
    if (next.open && !dialog.open) {
      const active = dialog.ownerDocument.activeElement;
      previousFocus = active instanceof dialog.ownerDocument.defaultView!.HTMLElement ? active : null;
      dialog.showModal();
    } else if (!next.open) close();
  };
  closeButton.addEventListener('click', requestClose);
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('click', backdropClick);
  update(props);
  return {
    update,
    destroy() {
      closeButton.removeEventListener('click', requestClose);
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('click', backdropClick);
      close();
    },
  };
}
