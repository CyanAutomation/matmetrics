import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Surface } from './surface';

test('React Surface shares the vanilla primitive classes and keeps custom classes', () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      Surface,
      { variant: 'subtle', padding: 'sm', className: 'history-surface' },
      'Training history'
    )
  );

  assert.match(
    markup,
    /class="ui-surface ui-surface--subtle ui-surface--padding-sm history-surface"/
  );
  assert.match(markup, />Training history<\/div>/);
});

test('React Surface defaults match the vanilla primitive defaults', () => {
  const markup = renderToStaticMarkup(
    React.createElement(Surface, null, 'Default surface')
  );

  assert.match(
    markup,
    /class="ui-surface ui-surface--default ui-surface--padding-default"/
  );
});
