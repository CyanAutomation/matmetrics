import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from './button';

test('button renders interaction data attributes and shared motion class', () => {
  const markup = renderToStaticMarkup(
    <Button
      interaction="primary-action"
      feedbackState="loading"
      feedbackPulse
    >
      Save
    </Button>
  );

  assert.match(markup, /class="[^"]*ui-button[^"]*"/);
  assert.match(markup, /data-feedback="loading"/);
  assert.match(markup, /data-interaction="primary-action"/);
  assert.match(markup, /data-pulse="true"/);
});

test('button defaults to idle feedback and default interaction tone', () => {
  const markup = renderToStaticMarkup(<Button>Default</Button>);

  assert.match(markup, /data-feedback="idle"/);
  assert.match(markup, /data-interaction="default"/);
});
