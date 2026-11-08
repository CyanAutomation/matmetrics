import { escapeHtml, type ComponentController } from './component';

export interface RadioGroupOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Unique and stable id used as the native radio name. */
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<RadioGroupOption>;
  summary?: string;
  layout?: 'vertical' | 'horizontal' | 'responsive';
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function validateOptions(options: ReadonlyArray<RadioGroupOption>): void {
  const values = new Set<string>();
  for (const option of options) {
    if (values.has(option.value)) {
      throw new Error('Radio group option values must be unique');
    }
    values.add(option.value);
  }
}

function radioOptionHtml(
  id: string,
  option: RadioGroupOption,
  index: number,
  props: RadioGroupProps
): string {
  const optionId = escapeHtml(id + '-' + index);
  const value = escapeHtml(option.value);
  return '<div class="ui-radio-group__option"><input class="ui-radio-group__input" id="' +
    optionId + '" type="radio" name="' + escapeHtml(props.id) +
    '" value="' + value + '" data-radio-value="' + value + '"' +
    (option.value === props.value ? ' checked' : '') +
    (props.required ? ' required' : '') +
    (props.disabled || option.disabled ? ' disabled' : '') +
    '><label class="ui-radio-group__label" for="' + optionId +
    '" data-radio-option-label>' + escapeHtml(option.label) + '</label></div>';
}

function optionsHtml(props: RadioGroupProps): string {
  return props.options
    .map((option, index) => radioOptionHtml(props.id, option, index, props))
    .join('');
}

/** Render a native, labeled radio group with a controlled selection. */
export function radioGroupHtml(props: RadioGroupProps): string {
  validateOptions(props.options);
  const id = escapeHtml(props.id);
  const layout = escapeHtml(props.layout ?? 'vertical');
  const requiredMarker = '<span class="ui-radio-group__required" data-radio-required aria-hidden="true"' +
    (props.required ? '' : ' hidden') + '>*</span>';
  return '<fieldset class="ui-radio-group" id="' + id +
    '" data-ui-radio-group data-layout="' + layout +
    '"><legend class="ui-radio-group__legend"><span class="ui-radio-group__title"><span data-radio-label>' +
    escapeHtml(props.label) + '</span>' + requiredMarker +
    '</span><span class="ui-radio-group__summary" data-radio-summary' +
    (props.summary ? ' aria-live="polite"' : ' hidden') + '>' +
    escapeHtml(props.summary ?? '') + '</span></legend><div class="ui-radio-group__options" data-radio-options>' +
    optionsHtml(props) + '</div></fieldset>';
}

export function mountRadioGroup(
  root: HTMLElement,
  props: RadioGroupProps
): ComponentController<RadioGroupProps> {
  const group = root.matches('[data-ui-radio-group]')
    ? root as HTMLFieldSetElement
    : root.querySelector<HTMLFieldSetElement>('[data-ui-radio-group]');
  const label = group?.querySelector<HTMLElement>('[data-radio-label]');
  const requiredMarker = group?.querySelector<HTMLElement>('[data-radio-required]');
  const summary = group?.querySelector<HTMLElement>('[data-radio-summary]');
  const optionsRoot = group?.querySelector<HTMLElement>('[data-radio-options]');
  if (!group || !label || !requiredMarker || !summary || !optionsRoot) {
    throw new Error('Radio group markup is incomplete');
  }

  let current = props;
  const update = (next: RadioGroupProps) => {
    if (next.id !== props.id) throw new Error('Radio group id must remain stable');
    validateOptions(next.options);
    current = next;
    group.dataset.layout = next.layout ?? 'vertical';
    group.disabled = Boolean(next.disabled);
    label.textContent = next.label;
    requiredMarker.hidden = !next.required;
    summary.textContent = next.summary ?? '';
    summary.hidden = !next.summary;
    if (next.summary) summary.setAttribute('aria-live', 'polite');
    else summary.removeAttribute('aria-live');

    const inputs = Array.from(
      optionsRoot.querySelectorAll<HTMLInputElement>(':scope > .ui-radio-group__option > input')
    );
    const sameValues = inputs.length === next.options.length &&
      next.options.every((option, index) => inputs[index].dataset.radioValue === option.value);
    if (!sameValues) {
      optionsRoot.innerHTML = optionsHtml(next);
    } else {
      optionsRoot.querySelectorAll<HTMLElement>('[data-radio-option-label]').forEach((optionLabel, index) => {
        optionLabel.textContent = next.options[index].label;
      });
    }
    optionsRoot.querySelectorAll<HTMLInputElement>(':scope > .ui-radio-group__option > input').forEach((input, index) => {
      const option = next.options[index];
      input.name = next.id;
      input.checked = option.value === next.value;
      input.required = Boolean(next.required);
      input.disabled = Boolean(next.disabled || option.disabled);
    });
  };
  const onChange = (event: Event) => {
    const target = event.target as Element | null;
    const input = target?.closest<HTMLInputElement>('input[type="radio"][data-radio-value]');
    if (!input || input.closest('[data-ui-radio-group]') !== group || input.disabled) return;
    const option = current.options.find(({ value }) => value === input.dataset.radioValue);
    if (option) current.onChange(option.value);
  };
  update(props);
  group.addEventListener('change', onChange);
  return {
    update,
    destroy() {
      group.removeEventListener('change', onChange);
    },
  };
}
