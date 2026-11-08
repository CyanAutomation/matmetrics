import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PracticeDescriptionSection } from './practice-description-section';

test('practice description uses the shared vanilla textarea primitive', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(PracticeDescriptionSection, {
        description: 'Uchi mata entries from grip breaks.',
        setDescription: () => undefined,
        canUseAi: false,
        isSubmitting: false,
        transformLoading: false,
        transformMessage: null,
        fid: (suffix: string) => 'session-' + suffix,
        onTransform: () => undefined,
      })
    )
  );
  const textarea = document.querySelector('textarea#session-description');
  assert.ok(textarea);
  assert.equal(textarea.getAttribute('name'), 'practiceDescription');
  assert.equal(textarea.getAttribute('aria-label'), 'What did you practise?');
  assert.equal(textarea.textContent, 'Uchi mata entries from grip breaks.');
  assert.equal(
    textarea.getAttribute('placeholder'),
    'A few notes about drills, throws, or focus...'
  );
});
