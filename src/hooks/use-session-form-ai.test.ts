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
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const React = require('react') as typeof import('react');
const { act, cleanup, render, waitFor } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { AuthProvider } =
  require('@/components/auth-provider') as typeof import('@/components/auth-provider');
const { useSessionFormAi } =
  require('./use-session-form-ai') as typeof import('./use-session-form-ai');
const { useToast } = require('./use-toast') as typeof import('./use-toast');

afterEach(cleanup);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response;
}

type RequestCall = { signal: AbortSignal; result: Deferred<Response> };

function setup() {
  const calls: RequestCall[] = [];
  const successes: unknown[] = [];
  const request = ((_url: string | URL | Request, init?: RequestInit) => {
    const result = deferred<Response>();
    calls.push({ signal: init?.signal as AbortSignal, result });
    return result.promise;
  }) as typeof fetch;
  let currentHook!: ReturnType<typeof useSessionFormAi>;

  function Harness() {
    const hook = useSessionFormAi({
      canUseAi: true,
      authAvailable: true,
      fetch: request,
      getAuthHeaders: async (headers) => headers ?? {},
      getTransformerPrompt: () => '',
    });
    React.useEffect(() => {
      currentHook = hook;
    }, [hook]);
    const { toasts } = useToast();
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'output',
        { 'data-testid': 'state' },
        JSON.stringify({
          transform: hook.isLoadingTransform,
          suggest: hook.isLoadingSuggest,
          techniques: hook.suggestedTechniques,
          description: hook.transformedDescription,
        })
      ),
      React.createElement(
        'output',
        { 'data-testid': 'toast' },
        String(toasts[0]?.title ?? toasts[0]?.description ?? '')
      )
    );
  }

  const view = render(
    React.createElement(AuthProvider, null, React.createElement(Harness))
  );
  const state = () => JSON.parse(view.getByTestId('state').textContent ?? '{}');
  return {
    calls,
    successes,
    get hook() {
      return currentHook;
    },
    state,
    view,
  };
}

test('transform and suggest expose loading state while requests are pending', async () => {
  const harness = setup();

  let transformPromise!: Promise<void>;
  await act(async () => {
    transformPromise = harness.hook.transform('draft', (value) =>
      harness.successes.push(value)
    );
  });
  assert.equal(harness.state().transform, true);
  assert.equal(harness.state().suggest, false);

  await act(async () => {
    harness.calls[0].result.resolve(
      response({ transformedDescription: 'polished' })
    );
    await transformPromise;
  });
  assert.equal(harness.state().transform, false);

  let suggestPromise!: Promise<void>;
  await act(async () => {
    suggestPromise = harness.hook.suggest('throws', [], (value) =>
      harness.successes.push(value)
    );
  });
  assert.equal(harness.state().suggest, true);

  await act(async () => {
    harness.calls[1].result.resolve(response({ suggestions: ['Uchi mata'] }));
    await suggestPromise;
  });
  assert.equal(harness.state().suggest, false);
});

test('a replacement request aborts and ignores the prior request late result', async () => {
  const harness = setup();
  let first!: Promise<void>;
  let second!: Promise<void>;

  await act(async () => {
    first = harness.hook.transform('first', (value) =>
      harness.successes.push(value)
    );
  });
  await act(async () => {
    second = harness.hook.transform('second', (value) =>
      harness.successes.push(value)
    );
  });

  assert.equal(harness.calls[0].signal.aborted, true);
  assert.equal(harness.calls[1].signal.aborted, false);
  await act(async () => {
    harness.calls[0].result.resolve(
      response({ transformedDescription: 'stale' })
    );
    await first;
  });
  assert.equal(harness.state().transform, true);
  assert.equal(harness.state().description, null);

  await act(async () => {
    harness.calls[1].result.resolve(
      response({ transformedDescription: 'fresh' })
    );
    await second;
  });
  assert.equal(harness.state().description, 'fresh');
  assert.deepEqual(harness.successes, ['fresh']);
});

test('reset aborts pending work and clears derived values', async () => {
  const harness = setup();
  let completed!: Promise<void>;
  await act(async () => {
    completed = harness.hook.suggest('throw', [], () => undefined);
  });
  await act(async () => {
    harness.calls[0].result.resolve(response({ suggestions: ['Seoi nage'] }));
    await completed;
  });
  assert.deepEqual(harness.state().techniques, ['Seoi nage']);

  await act(async () => {
    void harness.hook.transform('pending', () => undefined);
  });
  const pending = harness.calls[1];
  await act(async () => harness.hook.reset());

  assert.equal(pending.signal.aborted, true);
  assert.deepEqual(harness.state(), {
    transform: false,
    suggest: false,
    techniques: [],
    description: null,
  });
  await act(async () => {
    pending.result.resolve(response({ transformedDescription: 'late' }));
  });
  await waitFor(() => assert.equal(harness.state().description, null));
});

test('AbortError is hidden while genuine request failures are shown', async () => {
  const harness = setup();
  const initialToast = harness.view.getByTestId('toast').textContent;
  let aborted!: Promise<void>;
  await act(async () => {
    aborted = harness.hook.transform('draft', () => undefined);
  });
  await act(async () => {
    harness.calls[0].result.reject(new DOMException('Aborted', 'AbortError'));
    await aborted;
  });
  assert.equal(harness.view.getByTestId('toast').textContent, initialToast);

  let failed!: Promise<void>;
  await act(async () => {
    failed = harness.hook.suggest('draft', [], () => undefined);
  });
  await act(async () => {
    harness.calls[1].result.reject(new Error('network down'));
    await failed;
  });
  assert.equal(
    harness.view.getByTestId('toast').textContent,
    'AI Suggestion Failed'
  );
});

test('unmounting aborts outstanding requests', async () => {
  const harness = setup();
  await act(async () => {
    void harness.hook.transform('draft', () => undefined);
    void harness.hook.suggest('draft', [], () => undefined);
  });

  harness.view.unmount();
  assert.equal(harness.calls[0].signal.aborted, true);
  assert.equal(harness.calls[1].signal.aborted, true);
});
