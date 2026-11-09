import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  emptyStateHtml,
  mountEmptyState,
  type EmptyStateProps,
} from './empty-state';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

function makeProps(overrides: Partial<EmptyStateProps> = {}): EmptyStateProps {
  return {
    title: 'No sessions yet',
    description: 'Log your first training session and it will appear here.',
    illustration: {
      src: '/images/ressa/ressa-pose-2.webp',
      alt: 'Ressa encouraging you to log your first session',
      size: 'medium',
    },
    action: {
      label: 'Log your first session',
      onActivate: () => undefined,
    },
    ...overrides,
  };
}

test('empty state renders accessible, escaped content and optional illustration and action', () => {
  const markup = emptyStateHtml(makeProps({
    title: '<No sessions>',
    description: '<script>unsafe</script>',
    illustration: {
      src: '/images/ressa/ressa-pose-2.webp?caption="safe"',
      alt: 'Ressa & friends',
      size: 'large',
    },
  }));
  const dom = new JSDOM(markup);
  const state = dom.window.document.querySelector('[data-ui-empty-state]')!;

  assert.equal(state.getAttribute('aria-label'), '<No sessions>');
  assert.equal(state.querySelector('h2')?.textContent, '<No sessions>');
  assert.equal(state.querySelector('script'), null);
  assert.equal(state.querySelector('p')?.textContent, '<script>unsafe</script>');
  assert.equal(state.querySelector('img')?.getAttribute('alt'), 'Ressa & friends');
  assert.equal(state.querySelector('img')?.dataset.size, 'large');
  assert.equal(state.querySelector('button')?.textContent, 'Log your first session');

  const withoutOptionalContent = new JSDOM(emptyStateHtml(makeProps({
    illustration: undefined,
    action: undefined,
  })));
  assert.equal(withoutOptionalContent.window.document.querySelector('img'), null);
  assert.equal(withoutOptionalContent.window.document.querySelector('button'), null);
  dom.window.close();
  withoutOptionalContent.window.close();
});

test('empty state rejects non-local illustration URLs', () => {
  assert.throws(
    () => emptyStateHtml(makeProps({
      illustration: {
        src: 'javascript:alert(1)',
        alt: 'Unsafe image',
      },
    })),
    /same-origin path/
  );
  assert.throws(
    () => emptyStateHtml(makeProps({
      illustration: {
        src: '//example.com/image.png',
        alt: 'External image',
      },
    })),
    /same-origin path/
  );
});

test('empty state updates content, retains action focus and calls the latest callback', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  host.innerHTML = emptyStateHtml(makeProps());
  const state = host.querySelector('[data-ui-empty-state]') as HTMLElement;
  const button = state.querySelector('button') as HTMLButtonElement;
  let firstCalls = 0;
  let nextCalls = 0;
  const initial = makeProps({
    action: { label: 'Log a session', onActivate: () => firstCalls++ },
  });
  const controller = mountEmptyState(host, initial);

  button.focus();
  controller.update(makeProps({
    title: 'Welcome back',
    description: 'Your new sessions will appear here.',
    illustration: undefined,
    action: { label: 'Create session', onActivate: () => nextCalls++ },
  }));

  const updatedButton = host.querySelector('button') as HTMLButtonElement;
  assert.equal(host.querySelector('h2')?.textContent, 'Welcome back');
  assert.equal(host.querySelector('p')?.textContent, 'Your new sessions will appear here.');
  assert.equal(host.querySelector('img'), null);
  assert.equal(dom.window.document.activeElement, updatedButton);
  updatedButton.click();
  assert.equal(firstCalls, 0);
  assert.equal(nextCalls, 1);

  controller.destroy();
  updatedButton.click();
  assert.equal(nextCalls, 1);
  dom.window.close();
});
