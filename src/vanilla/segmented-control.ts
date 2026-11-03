import { escapeHtml, type ComponentController } from './component';

export interface SegmentedControlProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function optionHtml(option: SegmentedControlProps['options'][number], props: SegmentedControlProps): string {
  return `<button type="button" class="ui-segmented-control__item" data-segment-value="${escapeHtml(option.value)}" aria-pressed="${option.value === props.value}"${props.disabled || option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</button>`;
}

/** A labelled group of mutually exclusive buttons, controlled by its caller. */
export function segmentedControlHtml(props: SegmentedControlProps): string {
  return `<div class="ui-segmented-control" role="group" aria-label="${escapeHtml(props.label)}">${props.options.map((option) => optionHtml(option, props)).join('')}</div>`;
}

export function mountSegmentedControl(element: HTMLElement, props: SegmentedControlProps): ComponentController<SegmentedControlProps> {
  let current = props;
  const update = (next: SegmentedControlProps) => {
    current = next;
    if (element.getAttribute('aria-label') !== next.label) element.setAttribute('aria-label', next.label);
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>(':scope > button[data-segment-value]'));
    const sameOptions = buttons.length === next.options.length && next.options.every((option, index) => buttons[index].dataset.segmentValue === option.value && buttons[index].textContent === option.label);
    if (!sameOptions) {
      const fragment = element.ownerDocument.createDocumentFragment();
      for (const option of next.options) {
        const button = element.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'ui-segmented-control__item';
        button.dataset.segmentValue = option.value;
        button.textContent = option.label;
        fragment.append(button);
      }
      element.replaceChildren(fragment);
    }
    element.querySelectorAll<HTMLButtonElement>(':scope > button[data-segment-value]').forEach((button, index) => {
      const selected = String(next.options[index].value === next.value);
      if (button.getAttribute('aria-pressed') !== selected) button.setAttribute('aria-pressed', selected);
      const disabled = Boolean(next.disabled || next.options[index].disabled);
      if (button.disabled !== disabled) button.disabled = disabled;
    });
  };
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>('button[data-segment-value]');
    if (button?.parentElement === element && !button.disabled) current.onChange(button.dataset.segmentValue!);
  };
  update(props);
  element.addEventListener('click', onClick);
  return { update, destroy() { element.removeEventListener('click', onClick); } };
}
