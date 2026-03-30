import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubSettings } from './components/github-settings';
import type { DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';
import type { TabRenderContext } from '@/lib/navigation/tab-definitions';

import { initPlugin } from './index';

test('initPlugin registers github settings renderer', () => {
  let renderer: DashboardTabRenderer | undefined;

  initPlugin({
    registerPluginComponent: (componentId, registerRenderer) => {
      assert.equal(componentId, 'github_settings');
      renderer = registerRenderer;
    },
  });

  assert.ok(renderer, 'initPlugin should provide a renderer callback');

  const element = renderer({
    sessions: [],
    refreshSessions: () => undefined,
    refreshPluginExtensions: () => undefined,
  } satisfies TabRenderContext);

  assert.ok(element && typeof element === 'object');
  assert.equal((element as { type?: unknown }).type, GitHubSettings);
});
