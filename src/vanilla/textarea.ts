import { escapeHtml, type ComponentController } from './component';

export interface TextareaProps {
  /** Unique and stable for the lifetime of a mounted field. */
  id: string;
  value: string;
  label?: string;
  ariaLabel?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  hint?: string;
  size?: 'default' | 'large';
  surface?: 'card' | 'background';
  onInput: (value: string) => void;
}

/** Render a labeled, controlled textarea with an optional accessible hint. */
export function textareaHtml(props: TextareaProps): string {
  const id = escapeHtml(props.id);
  const label = props.label ?? '';
  const attributes = [
    'class="ui-textarea__input"',
    'id="' + id + '"',
    'data-size="' + escapeHtml(props.size ?? 'default') + '"',
    'data-surface="' + escapeHtml(props.surface ?? 'card') + '"',
    props.name ? 'name="' + escapeHtml(props.name) + '"' : '',
    props.ariaLabel ? 'aria-label="' + escapeHtml(props.ariaLabel) + '"' : '',
    props.placeholder ? 'placeholder="' + escapeHtml(props.placeholder) + '"' : '',
    props.rows !== undefined ? 'rows="' + props.rows + '"' : '',
    props.minLength !== undefined ? 'minlength="' + props.minLength + '"' : '',
    props.maxLength !== undefined ? 'maxlength="' + props.maxLength + '"' : '',
    props.required ? 'required' : '',
    props.disabled ? 'disabled' : '',
    props.invalid ? 'aria-invalid="true"' : '',
    props.hint ? 'aria-describedby="' + id + '-hint"' : '',
  ].filter(Boolean).join(' ');

  return '<div class="ui-textarea"><label class="ui-textarea__label" for="' +
    id + '" data-textarea-label' + (label ? '' : ' hidden') +
    '><span data-textarea-label-text>' + escapeHtml(label) +
    '</span></label><textarea ' + attributes + '>' +
    escapeHtml(props.value) + '</textarea><p class="ui-textarea__hint" id="' +
    id + '-hint" data-textarea-hint' + (props.hint ? '' : ' hidden') + '>' +
    escapeHtml(props.hint ?? '') + '</p></div>';
}

export function mountTextarea(
  host: HTMLElement,
  props: TextareaProps
): ComponentController<TextareaProps> {
  const textarea = host.querySelector<HTMLTextAreaElement>('.ui-textarea__input');
  const label = host.querySelector<HTMLLabelElement>('[data-textarea-label]');
  const labelText = host.querySelector<HTMLElement>('[data-textarea-label-text]');
  const hint = host.querySelector<HTMLElement>('[data-textarea-hint]');
  if (!textarea || !label || !labelText || !hint) {
    throw new Error('Textarea markup is incomplete');
  }

  let current = props;
  const update = (next: TextareaProps) => {
    if (next.id !== props.id) throw new Error('Textarea id must remain stable');
    current = next;
    const nextLabel = next.label ?? '';
    label.hidden = !nextLabel;
    labelText.textContent = nextLabel;
    if (textarea.value !== next.value) textarea.value = next.value;
    textarea.name = next.name ?? '';
    textarea.placeholder = next.placeholder ?? '';
    if (next.ariaLabel) textarea.setAttribute('aria-label', next.ariaLabel);
    else textarea.removeAttribute('aria-label');
    if (next.rows === undefined) textarea.removeAttribute('rows');
    else textarea.rows = next.rows;
    for (const [name, value] of [['minlength', next.minLength], ['maxlength', next.maxLength]] as const) {
      if (value === undefined) textarea.removeAttribute(name);
      else textarea.setAttribute(name, String(value));
    }
    textarea.dataset.size = next.size ?? 'default';
    textarea.dataset.surface = next.surface ?? 'card';
    textarea.required = Boolean(next.required);
    textarea.disabled = Boolean(next.disabled);
    if (next.invalid) textarea.setAttribute('aria-invalid', 'true');
    else textarea.removeAttribute('aria-invalid');
    hint.textContent = next.hint ?? '';
    hint.hidden = !next.hint;
    if (next.hint) textarea.setAttribute('aria-describedby', hint.id);
    else textarea.removeAttribute('aria-describedby');
  };
  const onInput = () => current.onInput(textarea.value);
  update(props);
  textarea.addEventListener('input', onInput);
  return {
    update,
    destroy() {
      textarea.removeEventListener('input', onInput);
    },
  };
}
