import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TechniqueTagsSection } from './technique-tags-section';

test('technique tags use the shared vanilla tag editor', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(TechniqueTagsSection, {
        techniques: ['Uchi mata'],
        newTech: '',
        setNewTech: () => undefined,
        canUseAi: false,
        isSubmitting: false,
        suggestLoading: false,
        suggestMessage: null,
        description: '',
        fid: (suffix: string) => 'session-' + suffix,
        onSuggest: () => undefined,
        onAddTech: () => undefined,
        onRemoveTech: () => undefined,
      })
    )
  );
  assert.equal(document.querySelector('[data-ui-tag-editor]')?.getAttribute('aria-label'), 'Technique tags');
  assert.equal(document.querySelector('[data-tag-text]')?.textContent, 'Uchi mata');
  assert.equal(
    document.querySelector('input#session-manual-tag-input')?.getAttribute('name'),
    'manualTagEntry'
  );
  assert.ok(document.querySelector('button[data-tag-add]'));
});
