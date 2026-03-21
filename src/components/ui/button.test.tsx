import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from './button';

test('button maps interaction props to data attributes and preserves accessibility props', () => {
  const markup = renderToStaticMarkup(
    <Button
      interaction="primary-action"
      feedbackState="loading"
      feedbackPulse
      aria-busy="true"
    >
      Save
    </Button>
  );

  assert.match(markup, /^<button[^>]*>Save<\/button>$/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /data-feedback="loading"/);
  assert.match(markup, /data-interaction="primary-action"/);
  assert.match(markup, /data-pulse="true"/);
});

test('button public API defaults align with design-system/button expectations', () => {
  const markup = renderToStaticMarkup(<Button>Default</Button>);

  // design-system/button expects a plain Button to render as a <button> with neutral, idle interaction state.
  assert.match(markup, /^<button[^>]*>Default<\/button>$/);
  assert.match(markup, /data-feedback="idle"/);
  assert.match(markup, /data-interaction="default"/);
  assert.doesNotMatch(markup, /data-pulse=/);
});

test('button forwards data attributes when rendered as child element', () => {
  const markup = renderToStaticMarkup(
    <Button asChild interaction="subtle" feedbackState="success" feedbackPulse>
      <a href="/sessions" aria-label="View sessions">
        Sessions
      </a>
    </Button>
  );

  assert.match(markup, /^<a[^>]*>Sessions<\/a>$/);
  assert.match(markup, /href="\/sessions"/);
  assert.match(markup, /aria-label="View sessions"/);
  assert.match(markup, /data-feedback="success"/);
  assert.match(markup, /data-interaction="subtle"/);
  assert.match(markup, /data-pulse="true"/);
});
