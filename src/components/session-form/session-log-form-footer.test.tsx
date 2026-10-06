import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionLogFormFooter } from './session-log-form-footer';

test(
  'session form footer keeps the Cancel label on its button without hide utilities',
  () => {
    const document = parse(
      renderToStaticMarkup(
        React.createElement(SessionLogFormFooter, {
          isSubmitting: false,
          isEditing: false,
          shouldHideHeader: true,
          feedbackState: 'idle',
          currentStep: 1,
          totalSteps: 4,
          onPrevious: () => undefined,
          onNext: () => undefined,
          onFinish: () => undefined,
          onCancel: () => undefined,
        })
      )
    );
    const cancelButton = document.querySelector('button[aria-label="Cancel"]');

    assert.ok(cancelButton, 'Cancel action should render a labelled button');
    assert.equal(cancelButton.textContent.trim(), 'Cancel');
    assert.doesNotMatch(
      cancelButton.getAttribute('class') ?? '',
      /(?:^|\s)(?:[\w-]+:)*hidden(?:\s|$)/
    );
  }
);
