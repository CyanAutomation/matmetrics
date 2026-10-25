import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://matmetrics.example.test/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const { cleanup, renderHook } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { useDashboardNavigation } =
  require('./use-dashboard-navigation') as typeof import('./use-dashboard-navigation');

afterEach(() => {
  cleanup();
  dom.reconfigure({ url: 'https://matmetrics.example.test/' });
});

test('captures a successful callback result before removing it from the URL', () => {
  dom.reconfigure({
    url: 'https://matmetrics.example.test/?githubBackup=connected&tab=history#sessions',
  });

  const { result } = renderHook(() => useDashboardNavigation());

  assert.equal(result.current.activeTab, 'github-sync');
  assert.equal(result.current.githubBackupResult, 'connected');
  assert.equal(dom.window.location.search, '?tab=history');
  assert.equal(dom.window.location.hash, '#sessions');
});

test('captures a failed callback result and removes the callback parameter', () => {
  dom.reconfigure({
    url: 'https://matmetrics.example.test/?githubBackup=failed',
  });

  const { result } = renderHook(() => useDashboardNavigation());

  assert.equal(result.current.activeTab, 'github-sync');
  assert.equal(result.current.githubBackupResult, 'failed');
  assert.equal(dom.window.location.search, '');
});
