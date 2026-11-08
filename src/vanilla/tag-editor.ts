import { escapeHtml, type ComponentController } from './component';

export interface TagEditorProps {
  /** Unique and stable id used to associate the entry field with its label. */
  id: string;
  label: string;
  inputLabel: string;
  name?: string;
  values: readonly string[];
  newValue: string;
  placeholder: string;
  emptyMessage?: string;
  addLabel?: string;
  disabled?: boolean;
  addDisabled?: boolean;
  onInput: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}

function tagListHtml(props: TagEditorProps): string {
  if (props.values.length === 0) {
    return '<li class="ui-tag-editor__empty" role="status">' +
      escapeHtml(props.emptyMessage ?? 'No tags added yet.') + '</li>';
  }
  return props.values.map((value, index) =>
    '<li class="ui-tag-editor__tag" data-tag-value data-tag-index="' + index +
    '"><span class="ui-tag-editor__text" data-tag-text>' +
    escapeHtml(value) + '</span><button class="ui-tag-editor__remove" type="button" data-tag-remove="' +
    index + '"' + (props.disabled ? ' disabled' : '') +
    ' aria-label="Remove ' + escapeHtml(value) +
    ' technique tag" title="Remove ' + escapeHtml(value) +
    '">×</button></li>'
  ).join('');
}

/** Render a controlled tag list with a reusable text entry and removal actions. */
export function tagEditorHtml(props: TagEditorProps): string {
  const id = escapeHtml(props.id);
  return '<div class="ui-tag-editor" data-ui-tag-editor role="group" aria-label="' +
    escapeHtml(props.label) + '"><ul class="ui-tag-editor__list" data-tag-list>' +
    tagListHtml(props) + '</ul><div class="ui-tag-editor__entry"><label class="ui-tag-editor__input-label" for="' +
    id + '-input">' + escapeHtml(props.inputLabel) +
    '</label><input class="ui-text-field__input ui-tag-editor__input" id="' +
    id + '-input" data-tag-input type="text" value="' +
    escapeHtml(props.newValue) + '" placeholder="' +
    escapeHtml(props.placeholder) + '"' +
    (props.name ? ' name="' + escapeHtml(props.name) + '"' : '') +
    ' data-size="default" data-surface="background"' +
    (props.disabled ? ' disabled' : '') + '><button class="ui-tag-editor__add" type="button" data-tag-add' +
    (props.disabled || props.addDisabled ? ' disabled' : '') + '>' +
    escapeHtml(props.addLabel ?? 'Add') + '</button></div></div>';
}

export function mountTagEditor(
  root: HTMLElement,
  props: TagEditorProps
): ComponentController<TagEditorProps> {
  const list = root.querySelector<HTMLElement>('[data-tag-list]');
  const inputLabel = root.querySelector<HTMLElement>('.ui-tag-editor__input-label');
  const input = root.querySelector<HTMLInputElement>('[data-tag-input]');
  const addButton = root.querySelector<HTMLButtonElement>('[data-tag-add]');
  if (!list || !inputLabel || !input || !addButton) {
    throw new Error('Tag editor markup is incomplete');
  }

  let current = props;
  const update = (next: TagEditorProps) => {
    if (next.id !== props.id) throw new Error('Tag editor id must remain stable');
    const valuesChanged = current.values.length !== next.values.length ||
      current.values.some((value, index) => value !== next.values[index]) ||
      current.emptyMessage !== next.emptyMessage;
    current = next;
    root.setAttribute('aria-label', next.label);
    if (valuesChanged) list.innerHTML = tagListHtml(next);
    inputLabel.textContent = next.inputLabel;
    if (input.value !== next.newValue) input.value = next.newValue;
    input.placeholder = next.placeholder;
    input.name = next.name ?? '';
    input.disabled = Boolean(next.disabled);
    addButton.textContent = next.addLabel ?? 'Add';
    addButton.disabled = Boolean(next.disabled || next.addDisabled);
    list.querySelectorAll<HTMLButtonElement>('[data-tag-remove]').forEach((button) => {
      button.disabled = Boolean(next.disabled);
    });
  };
  const onInput = () => current.onInput(input.value);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!addButton.disabled) current.onAdd();
  };
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const add = target?.closest<HTMLButtonElement>('[data-tag-add]');
    if (add === addButton && !add.disabled) {
      current.onAdd();
      return;
    }
    const remove = target?.closest<HTMLButtonElement>('[data-tag-remove]');
    if (!remove || !root.contains(remove) || remove.disabled) return;
    const value = current.values[Number(remove.dataset.tagRemove)];
    if (value !== undefined) current.onRemove(value);
  };

  update(props);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  root.addEventListener('click', onClick);
  return {
    update,
    destroy() {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('click', onClick);
    },
  };
}
