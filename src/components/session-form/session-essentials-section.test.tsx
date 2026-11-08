import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionEssentialsSection } from './session-essentials-section';

function renderEssentials(showAvatar: boolean) {
  return parse(
    renderToStaticMarkup(
      React.createElement(SessionEssentialsSection, {
        date: '2026-09-28',
        duration: '',
        category: 'Technical',
        availableCategories: ['Technical'],
        effort: 3,
        showAvatar,
        shouldHideHeader: false,
        fid: (suffix: string) => suffix,
        setDate: () => undefined,
        setDuration: () => undefined,
        setCategory: () => undefined,
        setEffort: () => undefined,
      })
    )
  );
}

test('session essentials includes the coach illustration only when avatar mode is enabled', () => {
  const enabled = renderEssentials(true);
  const disabled = renderEssentials(false);

  assert.ok(
    enabled.querySelector(
      'img[alt="Ressa in coach mode, ready to help log your training session"]'
    )
  );
  assert.equal(
    disabled.querySelector(
      'img[alt="Ressa in coach mode, ready to help log your training session"]'
    ),
    null
  );
});

test('effort options expose which level is selected to assistive technology', () => {
  const document = renderEssentials(false);
  const options = document.querySelectorAll('input[type="radio"][name="effort"]');
  const selected = document.querySelector('input[type="radio"][value="3"]');
  const unselected = document.querySelector('input[type="radio"][value="1"]');

  assert.equal(options.length, 5);
  assert.equal(selected?.hasAttribute('checked'), true);
  assert.equal(unselected?.hasAttribute('checked'), false);
  assert.equal(document.querySelector('[data-radio-label]')?.textContent, 'Effort level');
  assert.equal(document.querySelector('[data-radio-required]')?.textContent, '*');
  assert.equal(document.querySelector('[data-radio-required]')?.getAttribute('aria-hidden'), 'true');
  assert.equal(document.querySelector('[data-radio-summary]')?.textContent, 'Normal');
});

test('session type uses a labeled required native select', () => {
  const document = renderEssentials(false);
  const select = document.querySelector('select#category');
  assert.ok(select);
  assert.ok(select.hasAttribute('required'));
  assert.equal(document.querySelector('label[for="category"]')?.textContent, 'Session type');
  assert.equal(select.querySelector('option[selected]')?.getAttribute('value'), 'Technical');
});

test('session date and duration use shared vanilla field primitives', () => {
  const document = renderEssentials(false);
  const date = document.querySelector<HTMLInputElement>('#date');
  const duration = document.querySelector<HTMLInputElement>('#duration');

  assert.equal(date?.getAttribute('type'), 'date');
  assert.equal(date?.getAttribute('name'), 'sessionDate');
  assert.equal(date?.hasAttribute('required'), true);
  assert.equal(date?.getAttribute('value'), '2026-09-28');
  assert.equal(document.querySelector('label[for="date"] [data-field-label-text]')?.textContent, 'Session date');

  assert.equal(duration?.getAttribute('type'), 'number');
  assert.equal(duration?.getAttribute('name'), 'sessionDuration');
  assert.equal(duration?.getAttribute('min'), '1');
  assert.equal(duration?.getAttribute('max'), '999');
  assert.equal(duration?.getAttribute('step'), '1');
  assert.equal(duration?.getAttribute('aria-label'), 'Session duration in minutes');
  assert.equal(document.querySelector('label[for="duration"] [data-field-label-text]')?.textContent, 'Duration (minutes)');
  assert.equal(document.querySelector('label[for="duration"] [data-field-optional]')?.textContent, 'optional');
});
