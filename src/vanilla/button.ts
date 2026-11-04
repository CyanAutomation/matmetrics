import { escapeHtml, type ComponentController } from './component';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'destructive';

export type ButtonIcon = 'filter' | 'search' | 'sparkles' | 'loader' | 'chevron';

export interface ButtonProps {
  label: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  icon?: ButtonIcon;
  disabled?: boolean;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaBusy?: boolean;
  dataAction?: string;
  onClick: () => void;
}

export function iconHtml(icon: ButtonIcon, className = 'ui-button__icon'): string {
  const classAttribute = escapeHtml(className);
  switch (icon) {
    case 'filter':
      return `<svg aria-hidden="true" class="${classAttribute}" data-icon="filter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10m-7 6h4"/></svg>`;
    case 'search':
      return `<svg aria-hidden="true" class="${classAttribute}" data-icon="search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;
    case 'sparkles':
      return `<svg aria-hidden="true" class="${classAttribute}" data-icon="sparkles" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg>`;
    case 'loader':
      return `<svg aria-hidden="true" class="${classAttribute} ui-button__icon--spin" data-icon="loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64"/></svg>`;
    case 'chevron':
      return `<svg aria-hidden="true" class="${classAttribute}" data-icon="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
  }
}

export function buttonHtml(props: ButtonProps, className = ''): string {
  const classes = ['ui-button', className].filter(Boolean).join(' ');
  const icon = props.icon ? iconHtml(props.icon) : '';
  return `<button type="${props.type ?? 'button'}" class="${escapeHtml(classes)}" data-variant="${props.variant ?? 'outline'}"${props.disabled ? ' disabled' : ''}${props.ariaLabel ? ` aria-label="${escapeHtml(props.ariaLabel)}"` : ''}${props.ariaExpanded !== undefined ? ` aria-expanded="${props.ariaExpanded}"` : ''}${props.ariaControls ? ` aria-controls="${escapeHtml(props.ariaControls)}"` : ''}${props.ariaBusy !== undefined ? ` aria-busy="${props.ariaBusy}"` : ''}${props.dataAction ? ` data-ui-action="${escapeHtml(props.dataAction)}"` : ''}>${icon}<span data-button-label>${escapeHtml(props.label)}</span></button>`;
}

export function mountButton(
  button: HTMLButtonElement,
  initialProps: ButtonProps
): ComponentController<ButtonProps> {
  const label = button.querySelector<HTMLElement>('[data-button-label]');
  if (!label) throw new Error('Button markup is missing its label');

  let current = initialProps;
  const update = (next: ButtonProps) => {
    current = next;
    button.type = next.type ?? 'button';
    button.dataset.variant = next.variant ?? 'outline';
    button.disabled = Boolean(next.disabled);
    if (next.ariaLabel) button.setAttribute('aria-label', next.ariaLabel);
    else button.removeAttribute('aria-label');
    setOptionalAttribute(button, 'aria-expanded', next.ariaExpanded);
    if (next.ariaControls) button.setAttribute('aria-controls', next.ariaControls);
    else button.removeAttribute('aria-controls');
    setOptionalAttribute(button, 'aria-busy', next.ariaBusy);
    if (next.dataAction) button.dataset.uiAction = next.dataAction;
    else delete button.dataset.uiAction;
    if (label.textContent !== next.label) label.textContent = next.label;
    updateIcon(button, next.icon);
  };
  const onClick = () => current.onClick();

  update(initialProps);
  button.addEventListener('click', onClick);
  return {
    update,
    destroy() {
      button.removeEventListener('click', onClick);
    },
  };
}

function setOptionalAttribute(
  element: HTMLElement,
  name: string,
  value: boolean | undefined
): void {
  if (value === undefined) element.removeAttribute(name);
  else element.setAttribute(name, String(value));
}

function updateIcon(button: HTMLButtonElement, nextIcon: ButtonIcon | undefined): void {
  const currentIcon = button.querySelector<SVGElement>(':scope > svg[data-icon]');
  if (!nextIcon) {
    currentIcon?.remove();
    return;
  }
  if (currentIcon?.dataset.icon === nextIcon) return;

  const fragment = button.ownerDocument
    .createRange()
    .createContextualFragment(iconHtml(nextIcon));
  if (currentIcon) currentIcon.replaceWith(fragment);
  else button.insertBefore(fragment, button.firstChild);
}
