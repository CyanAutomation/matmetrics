import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, beforeEach } from 'node:test';
import React from 'react';

import { Toggle } from './toggle';

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

test('Toggle exposes controlled pressed state and reports the next state on click', () => {
  function Harness() {
    const [pressed, setPressed] = React.useState(false);

    return (
      <Toggle pressed={pressed} onPressedChange={setPressed}>
        Randori
      </Toggle>
    );
  }

  const { getByRole } = render(<Harness />);
  const toggle = getByRole('button', { name: 'Randori' });

  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  fireEvent.click(toggle);
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
});

test('Toggle does not change state when a click handler prevents the default action', () => {
  const onPressedChange = test.mock.fn<(pressed: boolean) => void>();
  const { getByRole } = render(
    <Toggle
      pressed={false}
      onPressedChange={onPressedChange}
      onClick={(event) => event.preventDefault()}
    >
      Technical
    </Toggle>
  );

  fireEvent.click(getByRole('button', { name: 'Technical' }));
  assert.equal(onPressedChange.mock.callCount(), 0);
});
