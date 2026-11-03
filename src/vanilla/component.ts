/** A mounted component owns its event listeners, but not its host element. */
export interface ComponentController<Props> {
  update(props: Props): void;
  destroy(): void;
}

/** Escape untrusted text before inserting it into an HTML template. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}
