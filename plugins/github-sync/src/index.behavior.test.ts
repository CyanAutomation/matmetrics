import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubSettings } from '@/components/github-settings';

import { initPlugin } from './index';

test('initPlugin registers github settings renderer', () => {
  let renderer: (() => unknown) | undefined;

  initPlugin({
    registerPluginComponent: (componentId, registerRenderer) => {
      assert.equal(componentId, 'github_settings');
      renderer = registerRenderer;
    },
  });

  assert.ok(renderer, 'initPlugin should provide a renderer callback');

  const element = renderer();

  assert.ok(element && typeof element === 'object');
  assert.equal((element as { type?: unknown }).type, GitHubSettings);
});
