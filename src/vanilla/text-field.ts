import { escapeHtml, type ComponentController } from './component';

export interface TextFieldProps {
  /** Unique and stable for the lifetime of a mounted field. */
  id: string;
  label: string;
  value: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel' | 'date' | 'number';
  name?: string;
  ariaLabel?: string;
  placeholder?: string;
  title?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  /** Render a visual required asterisk beside the label. */
  showRequiredIndicator?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  optional?: boolean;
  size?: 'default' | 'comfortable';
  surface?: 'card' | 'background';
  hint?: string;
  onInput: (value: string) => void;
}

/** Render a labeled text input with an optional accessible description. */
export function textFieldHtml(props: TextFieldProps): string {
  const id = escapeHtml(props.id);
  const optional = '<span class="ui-text-field__optional" data-field-optional' +
    (props.optional ? '' : ' hidden') + '>' + (props.optional ? 'optional' : '') + '</span>';
  const requiredMarker = '<span aria-hidden="true" data-field-required' +
    (props.showRequiredIndicator ? '' : ' hidden') + '>' +
    (props.showRequiredIndicator ? ' *' : '') + '</span>';
  const attributes = [
    'class="ui-text-field__input"',
    'id="' + id + '"',
    'type="' + escapeHtml(props.type ?? 'text') + '"',
    'value="' + escapeHtml(props.value) + '"',
    'data-size="' + escapeHtml(props.size ?? 'default') + '"',
    'data-surface="' + escapeHtml(props.surface ?? 'card') + '"',
    props.name ? 'name="' + escapeHtml(props.name) + '"' : '',
    props.ariaLabel ? 'aria-label="' + escapeHtml(props.ariaLabel) + '"' : '',
    props.placeholder ? 'placeholder="' + escapeHtml(props.placeholder) + '"' : '',
    props.title ? 'title="' + escapeHtml(props.title) + '"' : '',
    props.autoComplete ? 'autocomplete="' + escapeHtml(props.autoComplete) + '"' : '',
    props.min !== undefined ? 'min="' + escapeHtml(String(props.min)) + '"' : '',
    props.max !== undefined ? 'max="' + escapeHtml(String(props.max)) + '"' : '',
    props.step !== undefined ? 'step="' + escapeHtml(String(props.step)) + '"' : '',
    props.minLength !== undefined ? 'minlength="' + props.minLength + '"' : '',
    props.maxLength !== undefined ? 'maxlength="' + props.maxLength + '"' : '',
    props.required ? 'required' : '',
    props.disabled ? 'disabled' : '',
    props.invalid ? 'aria-invalid="true"' : '',
    props.hint ? 'aria-describedby="' + id + '-hint"' : '',
  ].filter(Boolean).join(' ');
  return '<div class="ui-text-field"><label class="ui-text-field__label" for="' +
    id + '" data-field-label><span data-field-label-text>' +
    escapeHtml(props.label) + '</span>' + requiredMarker + optional +
    '</label><input ' + attributes + '><p class="ui-text-field__hint" id="' +
    id + '-hint" data-field-hint' + (props.hint ? '' : ' hidden') + '>' +
    escapeHtml(props.hint ?? '') + '</p></div>';
}

export function mountTextField(host: HTMLElement, props: TextFieldProps): ComponentController<TextFieldProps> {
  const input = host.querySelector<HTMLInputElement>('.ui-text-field__input');
  const label = host.querySelector<HTMLLabelElement>('[data-field-label]');
  const labelText = host.querySelector<HTMLElement>('[data-field-label-text]');
  const requiredMarker = host.querySelector<HTMLElement>('[data-field-required]');
  const optional = host.querySelector<HTMLElement>('[data-field-optional]');
  const hint = host.querySelector<HTMLElement>('[data-field-hint]');
  if (!input || !label || !labelText || !requiredMarker || !optional || !hint) {
    throw new Error('Text field markup is incomplete');
  }
  let current = props;
  const update = (next: TextFieldProps) => {
    if (next.id !== props.id) throw new Error('Text field id must remain stable');
    current = next;
    labelText.textContent = next.label;
    requiredMarker.textContent = next.showRequiredIndicator ? ' *' : '';
    requiredMarker.hidden = !next.showRequiredIndicator;
    optional.textContent = next.optional ? 'optional' : '';
    optional.hidden = !next.optional;
    if (input.value !== next.value) input.value = next.value;
    input.type = next.type ?? 'text';
    input.name = next.name ?? '';
    input.placeholder = next.placeholder ?? '';
    input.title = next.title ?? '';
    if (next.ariaLabel) input.setAttribute('aria-label', next.ariaLabel);
    else input.removeAttribute('aria-label');
    for (const [name, value] of [['min', next.min], ['max', next.max], ['step', next.step]] as const) {
      if (value === undefined) input.removeAttribute(name);
      else input.setAttribute(name, String(value));
    }
    input.dataset.size = next.size ?? 'default';
    input.dataset.surface = next.surface ?? 'card';
    if (next.autoComplete) input.setAttribute('autocomplete', next.autoComplete);
    else input.removeAttribute('autocomplete');
    for (const [name, value] of [['minlength', next.minLength], ['maxlength', next.maxLength]] as const) {
      if (value === undefined) input.removeAttribute(name);
      else input.setAttribute(name, String(value));
    }
    input.required = Boolean(next.required);
    input.disabled = Boolean(next.disabled);
    if (next.invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    hint.textContent = next.hint ?? '';
    hint.hidden = !next.hint;
    if (next.hint) input.setAttribute('aria-describedby', hint.id);
    else input.removeAttribute('aria-describedby');
  };
  const onInput = () => current.onInput(input.value);
  update(props);
  input.addEventListener('input', onInput);
  return { update, destroy() { input.removeEventListener('input', onInput); } };
}
