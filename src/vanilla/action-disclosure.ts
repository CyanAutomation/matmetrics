import { escapeHtml, type ComponentController } from './component';

export type ActionDisclosureTone = 'default' | 'destructive';

export interface ActionDisclosureOption {
  value: string;
  label: string;
  disabled?: boolean;
  tone?: ActionDisclosureTone;
}

export interface ActionDisclosureProps {
  label: string;
  ariaLabel?: string;
  triggerText?: string;
  triggerIcon?: 'chevron' | 'more';
  className?: string;
  closeOnAction?: boolean;
  options: ReadonlyArray<ActionDisclosureOption>;
  onAction: (value: string) => void;
}

function triggerIconHtml(icon: ActionDisclosureProps['triggerIcon'] = 'chevron'): string {
  if (icon === 'more') {
    return '<svg aria-hidden="true" class="ui-action-disclosure__icon" data-icon="more" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
  }

  return '<svg aria-hidden="true" class="ui-action-disclosure__icon ui-action-disclosure__chevron" data-icon="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
}

function triggerLabelHtml(props: ActionDisclosureProps): string {
  const triggerText = props.triggerText ?? props.label;
  const className = triggerText ? '' : ' ui-action-disclosure__visually-hidden';
  return `<span class="ui-action-disclosure__label${className}" data-disclosure-label>${escapeHtml(triggerText || props.label)}</span>`;
}

/** Native disclosure for a small group of related actions. */
export function actionDisclosureHtml(props: ActionDisclosureProps): string {
  const className = props.className ? ` ${escapeHtml(props.className)}` : '';
  const optionsHtml = props.options.map((option) =>
    `<button type="button" class="ui-action-disclosure__button" data-action-value="${escapeHtml(option.value)}" data-tone="${option.tone ?? 'default'}"${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</button>`
  ).join('');

  return `<details class="ui-action-disclosure${className}" aria-label="${escapeHtml(props.label)}"><summary class="ui-action-disclosure__summary" aria-label="${escapeHtml(props.ariaLabel ?? props.label)}">${triggerLabelHtml(props)}${triggerIconHtml(props.triggerIcon)}</summary><div class="ui-action-disclosure__actions">${optionsHtml}</div></details>`;
}

export function mountActionDisclosure(element: HTMLDetailsElement, props: ActionDisclosureProps): ComponentController<ActionDisclosureProps> {
  const summary = element.querySelector<HTMLElement>(':scope > summary');
  const label = element.querySelector<HTMLElement>('[data-disclosure-label]');
  const actions = element.querySelector<HTMLElement>('.ui-action-disclosure__actions');
  if (!summary || !label || !actions) throw new Error('Action disclosure markup is incomplete');
  let current = props;
  const update = (next: ActionDisclosureProps) => {
    current = next;
    if (element.getAttribute('aria-label') !== next.label) element.setAttribute('aria-label', next.label);
    summary.setAttribute('aria-label', next.ariaLabel ?? next.label);
    const nextTriggerText = next.triggerText ?? next.label;
    label.textContent = nextTriggerText || next.label;
    label.classList.toggle('ui-action-disclosure__visually-hidden', !nextTriggerText);
    element.className = `ui-action-disclosure${next.className ? ` ${next.className}` : ''}`;
    const icon = summary.querySelector<SVGElement>('[data-icon]');
    const nextIcon = next.triggerIcon ?? 'chevron';
    if (!icon || icon.dataset.icon !== nextIcon) {
      icon?.replaceWith(summary.ownerDocument.createRange().createContextualFragment(triggerIconHtml(nextIcon)));
    }
    const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>(':scope > button'));
    const sameOrder = buttons.length === next.options.length && next.options.every((option, index) => buttons[index].dataset.actionValue === option.value);
    if (!sameOrder) {
      const fragment = element.ownerDocument.createDocumentFragment();
      for (const option of next.options) {
        const button = element.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'ui-action-disclosure__button';
        button.dataset.actionValue = option.value;
        button.dataset.tone = option.tone ?? 'default';
        button.textContent = option.label;
        fragment.append(button);
      }
      actions.replaceChildren(fragment);
    }
    actions.querySelectorAll<HTMLButtonElement>(':scope > button').forEach((button, index) => {
      const option = next.options[index];
      if (button.textContent !== option.label) button.textContent = option.label;
      button.dataset.tone = option.tone ?? 'default';
      button.disabled = Boolean(option.disabled);
    });
  };
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>('button[data-action-value]');
    if (button?.parentElement === actions && !button.disabled) {
      if (current.closeOnAction) element.open = false;
      current.onAction(button.dataset.actionValue!);
    }
  };
  update(props);
  actions.addEventListener('click', onClick);
  return { update, destroy() { actions.removeEventListener('click', onClick); } };
}
