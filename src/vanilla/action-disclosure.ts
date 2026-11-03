import { escapeHtml, type ComponentController } from './component';

export interface ActionDisclosureProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  onAction: (value: string) => void;
}

/** Native disclosure for a small group of related actions. */
export function actionDisclosureHtml(props: ActionDisclosureProps): string {
  return `<details class="ui-action-disclosure" aria-label="${escapeHtml(props.label)}"><summary class="ui-action-disclosure__summary"><span data-disclosure-label>${escapeHtml(props.label)}</span><svg aria-hidden="true" class="ui-action-disclosure__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="ui-action-disclosure__actions">${props.options.map(option => `<button type="button" class="ui-action-disclosure__button" data-action-value="${escapeHtml(option.value)}"${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</button>`).join('')}</div></details>`;
}

export function mountActionDisclosure(element: HTMLDetailsElement, props: ActionDisclosureProps): ComponentController<ActionDisclosureProps> {
  const label = element.querySelector<HTMLElement>('[data-disclosure-label]');
  const actions = element.querySelector<HTMLElement>('.ui-action-disclosure__actions');
  if (!label || !actions) throw new Error('Action disclosure markup is incomplete');
  let current = props;
  const update = (next: ActionDisclosureProps) => {
    current = next;
    if (element.getAttribute('aria-label') !== next.label) element.setAttribute('aria-label', next.label);
    if (label.textContent !== next.label) label.textContent = next.label;
    const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>(':scope > button'));
    const same = buttons.length === next.options.length && next.options.every((option, index) => buttons[index].dataset.actionValue === option.value && buttons[index].textContent === option.label);
    if (!same) {
      const fragment = element.ownerDocument.createDocumentFragment();
      for (const option of next.options) {
        const button = element.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'ui-action-disclosure__button';
        button.dataset.actionValue = option.value;
        button.textContent = option.label;
        fragment.append(button);
      }
      actions.replaceChildren(fragment);
    }
    actions.querySelectorAll<HTMLButtonElement>(':scope > button').forEach((button, index) => { button.disabled = Boolean(next.options[index].disabled); });
  };
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>('button[data-action-value]');
    if (button?.parentElement === actions && !button.disabled) current.onAction(button.dataset.actionValue!);
  };
  update(props);
  actions.addEventListener('click', onClick);
  return { update, destroy() { actions.removeEventListener('click', onClick); } };
}
