import { escapeHtml, type ComponentController } from './component';

export interface ActionButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export function actionButtonHtml(props: ActionButtonProps, className = ''): string {
  return `<button type="button" class="ui-action-button${className ? ` ${escapeHtml(className)}` : ''}"${props.disabled ? ' disabled' : ''}>${escapeHtml(props.label)}</button>`;
}

export function mountActionButton(button: HTMLButtonElement, props: ActionButtonProps): ComponentController<ActionButtonProps> {
  let current = props;
  const handleClick = () => current.onClick();
  button.addEventListener('click', handleClick);
  return {
    update(next) {
      current = next;
      if (button.textContent !== next.label) button.textContent = next.label;
      if (button.disabled !== Boolean(next.disabled)) button.disabled = Boolean(next.disabled);
    },
    destroy() { button.removeEventListener('click', handleClick); },
  };
}
