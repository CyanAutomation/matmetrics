import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from './button';

function renderElement(jsx: ReactElement) {
  const markup = renderToStaticMarkup(jsx);
  const parsed = parse(markup);
  const root =
    parsed.tagName
      ? parsed
      : parsed.childNodes.find(
          (node: { nodeType?: number }) => node.nodeType === 1
        );

  assert.ok(root, 'expected a root element in rendered markup');

  return root as NonNullable<typeof root>;
}

test('button maps interaction props to data attributes and preserves accessibility props', () => {
  const element = renderElement(
    <Button
      interaction="primary-action"
      feedbackState="loading"
      feedbackPulse
      aria-busy="true"
    >
      Save
    </Button>
  );

  assert.equal(element.tagName.toLowerCase(), 'button');
  assert.equal(element.textContent.trim(), 'Save');
  assert.equal(element.getAttribute('aria-busy'), 'true');
  assert.equal(element.getAttribute('data-feedback'), 'loading');
  assert.equal(element.getAttribute('data-interaction'), 'primary-action');
  assert.equal(element.getAttribute('data-pulse'), 'true');
});

test('button public API defaults align with design-system/button expectations', () => {
  const element = renderElement(<Button>Default</Button>);

  // design-system/button expects a plain Button to render as a <button> with neutral, idle interaction state.
  assert.equal(element.tagName.toLowerCase(), 'button');
  assert.equal(element.textContent.trim(), 'Default');
  assert.equal(element.getAttribute('data-feedback'), 'idle');
  assert.equal(element.getAttribute('data-interaction'), 'default');
  assert.equal(element.hasAttribute('data-pulse'), false);
});

test('button forwards data attributes when rendered as child element', () => {
  const element = renderElement(
    <Button asChild interaction="subtle" feedbackState="success" feedbackPulse>
      <a href="/sessions" aria-label="View sessions">
        Sessions
      </a>
    </Button>
  );

  assert.equal(element.tagName.toLowerCase(), 'a');
  assert.equal(element.textContent.trim(), 'Sessions');
  assert.equal(element.getAttribute('href'), '/sessions');
  assert.equal(element.getAttribute('aria-label'), 'View sessions');
  assert.equal(element.getAttribute('data-feedback'), 'success');
  assert.equal(element.getAttribute('data-interaction'), 'subtle');
  assert.equal(element.getAttribute('data-pulse'), 'true');
});
