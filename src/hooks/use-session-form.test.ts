import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import type { JudoSession } from '@/lib/types';

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
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { act, cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');
let saveSession: () => Promise<unknown>;
let useFormSubmit: typeof import('./use-session-form').useFormSubmit;
let useSessionFormState: typeof import('./use-session-form').useSessionFormState;
let hook!: ReturnType<typeof useFormSubmit>;
const toastMessages: unknown[] = [];
let errorCount = 0;
let successCount = 0;

before(async () => {
  mock.module('@/lib/storage', {
    namedExports: {
      saveSession: () => saveSession(),
      updateSession: () => saveSession(),
    },
  });
  ({ useFormSubmit, useSessionFormState } = await import('./use-session-form'));
});

afterEach(cleanup);
after(() => dom.window.close());

function Harness({ videoUrl = '' }: { videoUrl?: string }) {
  const currentHook = useFormSubmit(
    {
      date: '2026-10-31',
      duration: '',
      description: '',
      techniques: [],
      effort: 3,
      category: 'Technical',
      notes: '',
      videoUrl,
    },
    undefined,
    {
      onSuccess: () => successCount++,
      onError: () => errorCount++,
      onStart: () => undefined,
      showToast: (message) => toastMessages.push(message),
    }
  );
  React.useEffect(() => {
    hook = currentHook;
  }, [currentHook]);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('output', { 'data-testid': 'error' }, currentHook.errorMessage ?? ''),
    React.createElement('button', { onClick: () => void currentHook.submit() }, 'Save')
  );
}

function FormStateHarness({ sessionToEdit }: { sessionToEdit?: JudoSession }) {
  const state = useSessionFormState(sessionToEdit);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('output', { 'data-testid': 'form-date' }, state.date),
    React.createElement('output', { 'data-testid': 'form-description' }, state.description),
    React.createElement('output', { 'data-testid': 'form-techniques' }, state.techniques.join(',')),
    React.createElement('output', { 'data-testid': 'form-editing' }, String(state.isEditing)),
    React.createElement('button', {
      onClick: () => state.setTechniques((techniques) => [...techniques, 'Newaza']),
    }, 'Add technique')
  );
}

beforeEach(() => {
  toastMessages.length = 0;
  errorCount = 0;
  successCount = 0;
  saveSession = async () => ({ status: 'synced' });
});

test('invalid session URLs stay inline and do not create a snackbar', async () => {
  render(React.createElement(Harness, { videoUrl: 'javascript:alert(1)' }));
  await act(async () => {
    await hook.submit();
  });

  assert.match(screen.getByTestId('error').textContent ?? '', /valid absolute http\(s\) URL/i);
  assert.equal(toastMessages.length, 0);
});

test('save failures remain visible in the form while successful saves use a snackbar', async () => {
  saveSession = async () => {
    throw new Error('storage unavailable');
  };
  render(React.createElement(Harness));
  await act(async () => {
    await hook.submit();
  });

  assert.match(screen.getByTestId('error').textContent ?? '', /could not be saved/i);
  assert.equal(errorCount, 1);
  assert.equal(toastMessages.length, 0);

  cleanup();
  saveSession = async () => ({ status: 'synced' });
  render(React.createElement(Harness));
  await act(async () => {
    await hook.submit();
  });
  assert.equal(successCount, 1);
  assert.deepEqual(toastMessages, [{ title: 'Session Saved!', description: undefined }]);
});

test('session form hook subscribes to vanilla state and resets when its edit target changes', () => {
  const firstSession: JudoSession = {
    id: 'session-1',
    date: '2026-11-01',
    category: 'Randori',
    effort: 4,
    techniques: ['Uchi-mata'],
    description: 'First description',
  };
  const secondSession: JudoSession = {
    id: 'session-2',
    date: '2026-11-08',
    category: 'Cardio',
    effort: 2,
    techniques: ['Ukemi'],
    description: 'Second description',
  };

  const view = render(
    React.createElement(FormStateHarness, { sessionToEdit: firstSession })
  );
  assert.equal(screen.getByTestId('form-date').textContent, firstSession.date);
  assert.equal(screen.getByTestId('form-description').textContent, 'First description');
  assert.equal(screen.getByTestId('form-techniques').textContent, 'Uchi-mata');
  assert.equal(screen.getByTestId('form-editing').textContent, 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Add technique' }));
  assert.equal(screen.getByTestId('form-techniques').textContent, 'Uchi-mata,Newaza');

  view.rerender(
    React.createElement(FormStateHarness, { sessionToEdit: secondSession })
  );
  assert.equal(screen.getByTestId('form-date').textContent, secondSession.date);
  assert.equal(screen.getByTestId('form-description').textContent, 'Second description');
  assert.equal(screen.getByTestId('form-techniques').textContent, 'Ukemi');
});
