import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const React = require('react') as typeof import('react');
const { act, cleanup, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { useToast } = require('./use-toast') as typeof import('./use-toast');

afterEach(cleanup);

test('useToast preserves callback identity across rerenders', async () => {
  const observedCallbacks: Array<ReturnType<typeof useToast>['toast']> = [];

  function Harness() {
    const [count, setCount] = React.useState(0);
    const { toast } = useToast();

    React.useEffect(() => {
      observedCallbacks.push(toast);
    }, [toast]);

    return React.createElement(
      'button',
      { onClick: () => setCount((current) => current + 1) },
      String(count)
    );
  }

  const view = render(React.createElement(Harness));
  const initialToast = observedCallbacks.at(-1);

  await act(async () => {
    view.getByRole('button').click();
  });

  assert.equal(observedCallbacks.length, 1);
  assert.equal(observedCallbacks.at(-1), initialToast);
});
