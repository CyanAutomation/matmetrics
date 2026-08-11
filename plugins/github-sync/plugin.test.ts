import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Github } from 'lucide-react';
import React from 'react';

import githubSyncManifest from './plugin.json';
import { GitHubSettings } from './src/components/github-settings';
import { initPlugin } from './src/index';
import { resolveDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import type { DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';
import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('github-sync is discovered and mapped to its dashboard settings tab', async () => {
  let registeredComponentId: string | undefined;
  let registeredRenderer: DashboardTabRenderer | undefined;

  initPlugin({
    registerPluginComponent: (componentId, renderer) => {
      registeredComponentId = componentId;
      registeredRenderer = renderer;
    },
  });

  assert.equal(registeredComponentId, 'github_settings');
  assert.ok(registeredRenderer, 'expected the settings renderer to register');

  const renderedSettings = registeredRenderer({
    sessions: [
      {
        id: 'distinctive-github-settings-session',
        date: '2026-08-11',
        techniques: ['Uchi mata'],
        effort: 4,
        category: 'Technical',
        description:
          'Context that the standalone settings surface does not use',
        notes: 'GitHub renderer contract test',
        duration: 73,
      },
    ],
    refreshSessions: () => {
      throw new Error(
        'the settings surface must not refresh sessions on render'
      );
    },
    refreshPluginExtensions: () => {
      throw new Error(
        'the settings surface must not refresh plugins on render'
      );
    },
  });

  assert.ok(
    React.isValidElement(renderedSettings),
    'expected the renderer to produce a React settings surface'
  );
  assert.equal(renderedSettings.type, GitHubSettings);
  assert.deepEqual(
    renderedSettings.props,
    {},
    'GitHubSettings is a standalone surface with no dashboard-context props'
  );

  const discoveredExtensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot: path.resolve(process.cwd(), 'plugins'),
    enabledOverrides: {},
  });
  const githubSyncExtensions = discoveredExtensions.filter(
    ({ pluginId }) => pluginId === 'github-sync'
  );

  assert.equal(githubSyncExtensions.length, 1);
  assert.equal(
    githubSyncExtensions[0]?.extension.id,
    'github-sync-dashboard-tab'
  );
  assert.equal(githubSyncExtensions[0]?.extension.config.tabId, 'github-sync');
  assert.equal(
    githubSyncExtensions[0]?.extension.config.component,
    registeredComponentId
  );

  const { tabs, warnings } =
    await resolveDashboardExtensionsToTabs(githubSyncExtensions);

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1, 'expected the registered renderer to resolve');
  assert.equal(tabs[0]?.id, 'github-sync');
  assert.ok(tabs[0]?.title.trim(), 'navigation item needs an accessible label');
  assert.equal(
    tabs[0]?.icon,
    Github,
    'navigation item should use a supported icon'
  );
  assert.equal(typeof tabs[0]?.render, 'function');
});

test('github-sync invalid extension configuration fails generic validation', () => {
  const invalidManifest = structuredClone(githubSyncManifest);
  if (!invalidManifest.uiExtensions[0]) {
    throw new Error('Test setup failed: uiExtensions[0] not found');
  }
  invalidManifest.uiExtensions[0].config.component = '';

  const validation = validatePluginManifest(invalidManifest);

  assert.equal(validation.isValid, false);
  assert.ok(
    validation.issues.some(
      ({ severity, path }) =>
        severity === 'error' && path === 'uiExtensions[0].config.component'
    )
  );
});
