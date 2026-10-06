import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
const domGlobalNames = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'NodeFilter',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'getComputedStyle',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const originalDomGlobals = new Map(
  domGlobalNames.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ])
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { useToast } = require('./use-toast') as typeof import('./use-toast');
const { Toaster } =
  require('../components/ui/toaster') as typeof import('../components/ui/toaster');

afterEach(cleanup);
after(() => {
  cleanup();
  dom.window.close();
  for (const name of domGlobalNames) {
    const descriptor = originalDomGlobals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('useToast displays a toast after a user action', async () => {
  function Harness() {
    const { toast } = useToast();

    return React.createElement(
      'button',
      {
        onClick: () =>
          toast({
            title: 'Session saved',
            description: 'Your training session is ready.',
          }),
      },
      'Save session'
    );
  }

  render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Harness),
      React.createElement(Toaster)
    )
  );

  fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

  assert.equal(
    (await screen.findByText('Session saved')).textContent,
    'Session saved'
  );
  assert.equal(
    (await screen.findByText('Your training session is ready.')).textContent,
    'Your training session is ready.'
  );
});
