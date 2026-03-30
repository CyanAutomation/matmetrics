import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubSettings } from '../../../plugins/github-sync/src/components/github-settings';
import { type TabRenderContext } from '@/lib/navigation/tab-definitions';
import { initPlugin } from '../../../plugins/github-sync/src/index';

test('github-sync initPlugin tolerates missing runtime registration hooks', () => {
  assert.doesNotThrow(() => {
    initPlugin({});
  });
});

test('github-sync runtime wiring registers a renderer that returns GitHubSettings', () => {
  let capturedRenderer: ((context: TabRenderContext) => unknown) | null = null;

  initPlugin({
    register: () => undefined,
    registerPluginComponent: (_componentId, renderer) => {
      capturedRenderer = renderer;
    },
  });

  assert.ok(capturedRenderer, 'Expected github-sync to register a renderer.');

  const renderer = capturedRenderer as (context: TabRenderContext) => unknown;
  const rendered = renderer({
    sessions: [],
    refreshSessions: () => undefined,
    refreshPluginExtensions: () => undefined,
  });

  assert.equal(
    typeof rendered,
    'object',
    'Expected renderer to return a React element-like object.'
  );

  const element = rendered as {
    type?: unknown;
  };
  assert.equal(element.type, GitHubSettings);
});
