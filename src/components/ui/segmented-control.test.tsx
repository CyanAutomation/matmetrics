import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';
import React from 'react';

import { SegmentedControl } from './segmented-control';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
});

const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');

afterEach(cleanup);

test('SegmentedControl preserves the labelled, mutually exclusive selection required by the design system', () => {
  const changes: string[] = [];

  function Harness() {
    const [value, setValue] = React.useState('30');

    return (
      <SegmentedControl
        aria-label="Training distribution timeframe"
        value={value}
        onValueChange={(nextValue) => {
          changes.push(nextValue);
          setValue(nextValue);
        }}
      >
        <SegmentedControl.Item value="30">30 days</SegmentedControl.Item>
        <SegmentedControl.Item value="90">90 days</SegmentedControl.Item>
      </SegmentedControl>
    );
  }

  render(<Harness />);

  assert.equal(
    screen
      .getByRole('group', { name: 'Training distribution timeframe' })
      .getAttribute('aria-label'),
    'Training distribution timeframe'
  );
  assert.deepEqual(
    screen.getAllByRole('button', { pressed: true }).map((item) => item.textContent),
    ['30 days']
  );

  fireEvent.click(screen.getByRole('button', { name: '90 days' }));

  assert.deepEqual(changes, ['90']);
  assert.deepEqual(
    screen.getAllByRole('button', { pressed: true }).map((item) => item.textContent),
    ['90 days']
  );
});
