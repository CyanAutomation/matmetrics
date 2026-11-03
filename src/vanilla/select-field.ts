import { escapeHtml, type ComponentController } from './component';

export interface SelectFieldProps {
  /** Unique and stable for the lifetime of the field. */
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
}

export function selectFieldHtml(props: SelectFieldProps): string {
  const id = escapeHtml(props.id);
  const options = props.options.map(option => `<option value="${escapeHtml(option.value)}"${option.value === props.value ? ' selected' : ''}${option.disabled ? ' disabled' : ''}>${escapeHtml(option.label)}</option>`).join('');
  return `<div class="ui-select-field"><label class="ui-select-field__label" for="${id}" data-select-label>${escapeHtml(props.label)}</label><select class="ui-select-field__select" id="${id}"${props.required ? ' required' : ''}${props.disabled ? ' disabled' : ''}${props.hint ? ` aria-describedby="${id}-hint"` : ''}>${options}</select><p class="ui-select-field__hint" id="${id}-hint" data-select-hint${props.hint ? '' : ' hidden'}>${escapeHtml(props.hint ?? '')}</p></div>`;
}

export function mountSelectField(host: HTMLElement, props: SelectFieldProps): ComponentController<SelectFieldProps> {
  const select = host.querySelector<HTMLSelectElement>('.ui-select-field__select');
  const label = host.querySelector<HTMLLabelElement>('[data-select-label]');
  const hint = host.querySelector<HTMLElement>('[data-select-hint]');
  if (!select || !label || !hint) throw new Error('Select field markup is incomplete');
  let current = props;
  const update = (next: SelectFieldProps) => {
    if (next.id !== props.id) throw new Error('Select field id must remain stable');
    current = next;
    label.textContent = next.label;
    const matches = select.options.length === next.options.length && next.options.every((option, index) => {
      const existing = select.options[index];
      return existing.value === option.value && existing.textContent === option.label && existing.disabled === Boolean(option.disabled);
    });
    if (!matches) {
      const fragment = select.ownerDocument.createDocumentFragment();
      for (const option of next.options) {
        const element = select.ownerDocument.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        element.disabled = Boolean(option.disabled);
        fragment.append(element);
      }
      select.replaceChildren(fragment);
    }
    if (select.value !== next.value) select.value = next.value;
    select.required = Boolean(next.required);
    select.disabled = Boolean(next.disabled);
    hint.textContent = next.hint ?? '';
    hint.hidden = !next.hint;
    if (next.hint) select.setAttribute('aria-describedby', hint.id);
    else select.removeAttribute('aria-describedby');
  };
  const onChange = () => current.onChange(select.value);
  update(props);
  select.addEventListener('change', onChange);
  return { update, destroy() { select.removeEventListener('change', onChange); } };
}
