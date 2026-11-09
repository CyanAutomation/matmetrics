import { buttonHtml } from './button';
import { escapeHtml, type ComponentController } from './component';

export type EmptyStateIllustrationSize = 'compact' | 'medium' | 'large';

export interface EmptyStateIllustration {
  /** A root-relative path to an image served by this application. */
  src: string;
  alt: string;
  size?: EmptyStateIllustrationSize;
}

export interface EmptyStateAction {
  label: string;
  onActivate: () => void;
}

export interface EmptyStateProps {
  title: string;
  description: string;
  illustration?: EmptyStateIllustration;
  action?: EmptyStateAction;
}

function validateIllustrationSrc(src: string): void {
  if (!src.startsWith('/') || src.startsWith('//') || /[\\\u0000-\u001f]/.test(src)) {
    throw new Error('Empty state illustrations must use a same-origin path');
  }
}

function illustrationHtml(illustration: EmptyStateIllustration): string {
  validateIllustrationSrc(illustration.src);
  const size = illustration.size ?? 'medium';
  if (!['compact', 'medium', 'large'].includes(size)) {
    throw new Error('Empty state illustration size is invalid');
  }

  return `<div class="ui-empty-state__illustration-wrap"><img class="ui-empty-state__illustration" src="${escapeHtml(illustration.src)}" alt="${escapeHtml(illustration.alt)}" width="180" height="180" loading="lazy" data-size="${size}"></div>`;
}

export function emptyStateHtml(props: EmptyStateProps): string {
  const illustration = props.illustration
    ? illustrationHtml(props.illustration)
    : '';
  const action = props.action
    ? buttonHtml({
        label: props.action.label,
        variant: 'primary',
        dataAction: 'empty-state-action',
        onClick: () => undefined,
      }, 'ui-empty-state__action')
    : '';

  return `<section class="ui-empty-state" data-ui-empty-state role="region" aria-label="${escapeHtml(props.title)}">
    ${illustration}
    <h2 class="ui-empty-state__title">${escapeHtml(props.title)}</h2>
    <p class="ui-empty-state__description">${escapeHtml(props.description)}</p>
    ${action}
  </section>`;
}

export function mountEmptyState(
  host: HTMLElement,
  initialProps: EmptyStateProps
): ComponentController<EmptyStateProps> {
  if (!host.querySelector('[data-ui-empty-state]')) {
    throw new Error('Empty state markup is missing');
  }

  let current = initialProps;

  const render = (props: EmptyStateProps) => {
    const activeElement = host.ownerDocument.activeElement;
    const actionWasFocused =
      !!activeElement &&
      host.contains(activeElement) &&
      activeElement.matches('[data-ui-action="empty-state-action"]');

    host.innerHTML = emptyStateHtml(props);

    if (actionWasFocused) {
      host
        .querySelector<HTMLButtonElement>(
          '[data-ui-action="empty-state-action"]'
        )
        ?.focus();
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    const activeWindow = host.ownerDocument.defaultView;
    if (!activeWindow || !(target instanceof activeWindow.Element)) return;
    if (!target.closest('[data-ui-action="empty-state-action"]')) return;
    current.action?.onActivate();
  };

  host.addEventListener('click', onClick);

  return {
    update(next) {
      current = next;
      render(next);
    },
    destroy() {
      host.removeEventListener('click', onClick);
    },
  };
}
