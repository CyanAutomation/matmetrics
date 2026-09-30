import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, beforeEach } from 'node:test';
import React from 'react';

import { SegmentedControl } from './segmented-control';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { cleanup, fireEvent, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const originalGlobalDescriptors = Object.fromEntries(
  domGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);
let dom: InstanceType<typeof JSDOM> | undefined;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
  });
});

afterEach(() => {
  cleanup();
  dom?.window.close();
  dom = undefined;

  for (const name of domGlobals) {
    const descriptor = originalGlobalDescriptors[name];
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  }
});

test('SegmentedControl preserves the labelled, mutually exclusive selection required by the design system', (t) => {
  const onValueChange = t.mock.fn<(value: string) => void>();

  function Harness() {
    const [value, setValue] = React.useState('30');

    return (
      <SegmentedControl
        aria-label="Training distribution timeframe"
        value={value}
        onValueChange={(nextValue) => {
          onValueChange(nextValue);
          setValue(nextValue);
        }}
      >
        <SegmentedControl.Item value="30">30 days</SegmentedControl.Item>
        <SegmentedControl.Item value="90">90 days</SegmentedControl.Item>
      </SegmentedControl>
    );
  }

  const { getAllByRole, getByRole } = render(<Harness />);

  assert.equal(
    getByRole('group', { name: 'Training distribution timeframe' })
      .getAttribute('aria-label'),
    'Training distribution timeframe'
  );
  assert.deepEqual(
    getAllByRole('button', { pressed: true }).map((item) => item.textContent),
    ['30 days']
  );

  fireEvent.click(getByRole('button', { name: '90 days' }));

  assert.deepEqual(
    onValueChange.mock.calls.map((call) => call.arguments),
    [['90']]
  );
  assert.deepEqual(
    getAllByRole('button', { pressed: true }).map((item) => item.textContent),
    ['90 days']
  );
});
