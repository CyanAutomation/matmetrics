import { escapeHtml, type ComponentController } from './component';
import { iconHtml } from './button';

export interface SearchFieldProps {
  /** Unique and stable for the lifetime of a mounted field. */
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onInput: (value: string) => void;
}

/** Render a search input with a visible icon and an accessible name. */
export function searchFieldHtml(props: SearchFieldProps): string {
  return `<label class="ui-search-field" for="${escapeHtml(props.id)}">${iconHtml('search', 'ui-search-field__icon')}<input class="ui-search-field__input" id="${escapeHtml(props.id)}" type="search" aria-label="${escapeHtml(props.label)}" value="${escapeHtml(props.value)}"${props.placeholder ? ` placeholder="${escapeHtml(props.placeholder)}"` : ''}${props.disabled ? ' disabled' : ''}></label>`;
}

export function mountSearchField(
  host: HTMLElement,
  initialProps: SearchFieldProps
): ComponentController<SearchFieldProps> {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('Search field markup is missing its input');

  let current = initialProps;
  const update = (next: SearchFieldProps) => {
    if (next.id !== initialProps.id) {
      throw new Error('Search field id must remain stable while mounted');
    }
    current = next;
    input.setAttribute('aria-label', next.label);
    if (input.value !== next.value) input.value = next.value;
    if (next.placeholder) input.setAttribute('placeholder', next.placeholder);
    else input.removeAttribute('placeholder');
    input.disabled = Boolean(next.disabled);
  };
  const onInput = () => current.onInput(input.value);

  update(initialProps);
  input.addEventListener('input', onInput);
  return {
    update,
    destroy() {
      input.removeEventListener('input', onInput);
    },
  };
}
