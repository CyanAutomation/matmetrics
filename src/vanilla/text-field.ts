import { escapeHtml, type ComponentController } from './component';

export interface TextFieldProps {
  /** Unique and stable for the lifetime of a mounted field. */
  id: string;
  label: string;
  value: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel';
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  hint?: string;
  onInput: (value: string) => void;
}

/** Render a labeled text input with an optional accessible description. */
export function textFieldHtml(props: TextFieldProps): string {
  const id = escapeHtml(props.id);
  return `<div class="ui-text-field"><label class="ui-text-field__label" for="${id}" data-field-label>${escapeHtml(props.label)}</label><input class="ui-text-field__input" id="${id}" type="${props.type ?? 'text'}" value="${escapeHtml(props.value)}"${props.autoComplete ? ` autocomplete="${escapeHtml(props.autoComplete)}"` : ''}${props.minLength !== undefined ? ` minlength="${props.minLength}"` : ''}${props.maxLength !== undefined ? ` maxlength="${props.maxLength}"` : ''}${props.required ? ' required' : ''}${props.disabled ? ' disabled' : ''}${props.invalid ? ' aria-invalid="true"' : ''}${props.hint ? ` aria-describedby="${id}-hint"` : ''}><p class="ui-text-field__hint" id="${id}-hint" data-field-hint${props.hint ? '' : ' hidden'}>${escapeHtml(props.hint ?? '')}</p></div>`;
}

export function mountTextField(host: HTMLElement, props: TextFieldProps): ComponentController<TextFieldProps> {
  const input = host.querySelector<HTMLInputElement>('.ui-text-field__input');
  const label = host.querySelector<HTMLLabelElement>('[data-field-label]');
  const hint = host.querySelector<HTMLElement>('[data-field-hint]');
  if (!input || !label || !hint) throw new Error('Text field markup is incomplete');
  let current = props;
  const update = (next: TextFieldProps) => {
    if (next.id !== props.id) throw new Error('Text field id must remain stable');
    current = next;
    label.textContent = next.label;
    if (input.value !== next.value) input.value = next.value;
    input.type = next.type ?? 'text';
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
