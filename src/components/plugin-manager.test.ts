import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PluginValidationIssue } from '@/lib/plugins/types';
import {
  derivePluginManagerInstalledViewState,
  PluginManagerInstalledContent,
  type InstalledPluginRow,
  type PluginManagerInstalledViewState,
} from './plugin-manager';

function renderInstalledContentMarkup(params: {
  installedPluginsViewState: PluginManagerInstalledViewState;
  loadErrorMessage?: string | null;
  accessState?: 'ready' | 'sign-in-required' | 'auth-unavailable';
  installedPlugins?: InstalledPluginRow[];
}) {
  const markup = renderToStaticMarkup(
    React.createElement(PluginManagerInstalledContent, {
      installedPluginsViewState: params.installedPluginsViewState,
      accessState: params.accessState ?? 'ready',
      loadErrorMessage: params.loadErrorMessage ?? null,
      installedPlugins: params.installedPlugins ?? [],
      fetchState: 'success',
      onRetry: () => undefined,
      onTogglePluginEnabled: () => undefined,
    })
  );

  const root = parse(markup);
  return root.toString();
}

function createInstalledPluginRow(
  overrides: Partial<InstalledPluginRow> = {}
): InstalledPluginRow {
  return {
    id: 'tag-manager',
    name: 'Tag Manager',
    version: '1.0.0',
    description: 'Tag editing plugin',
    enabled: true,
    status: 'idle',
    issues: [] as PluginValidationIssue[],
    ...overrides,
  };
}

test('derivePluginManagerInstalledViewState maps lifecycle scenarios to visible UI states', () => {
  const scenarios: Array<{
    input: Parameters<typeof derivePluginManagerInstalledViewState>[0];
    expectedState: PluginManagerInstalledViewState;
    expectedUiIndicator: RegExp;
  }> = [
    {
      input: {
        canManagePlugins: true,
        fetchState: 'idle',
        installedPluginCount: 0,
      },
      expectedState: 'loading',
      expectedUiIndicator: /plugins-loading-state/,
    },
    {
      input: {
        canManagePlugins: true,
        fetchState: 'error',
        installedPluginCount: 0,
      },
      expectedState: 'error',
      expectedUiIndicator: /plugins-error-state/,
    },
    {
      input: {
        canManagePlugins: true,
        fetchState: 'success',
        installedPluginCount: 0,
      },
      expectedState: 'empty',
      expectedUiIndicator: /plugins-empty-state/,
    },
    {
      input: {
        canManagePlugins: true,
        fetchState: 'success',
        installedPluginCount: 2,
      },
      expectedState: 'table',
      expectedUiIndicator: /plugins-table-state/,
    },
    {
      input: {
        canManagePlugins: false,
        fetchState: 'success',
        installedPluginCount: 2,
      },
      expectedState: 'access-blocked',
      expectedUiIndicator: /plugins-access-blocked-state/,
    },
  ];

  for (const scenario of scenarios) {
    const derivedState = derivePluginManagerInstalledViewState(scenario.input);
    assert.equal(derivedState, scenario.expectedState);
    const markup = renderInstalledContentMarkup({
      installedPluginsViewState: derivedState,
      accessState: scenario.input.canManagePlugins
        ? 'ready'
        : 'sign-in-required',
      installedPlugins:
        derivedState === 'table' ? [createInstalledPluginRow()] : [],
    });
    assert.match(markup, scenario.expectedUiIndicator);
  }
});

test('installed content renders behavior-defining UI surfaces for each scenario state', () => {
  const loadingMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'loading',
  });
  assert.match(loadingMarkup, /Loading installed plugins/);

  const errorMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'error',
    loadErrorMessage: 'network unavailable',
  });
  assert.match(errorMarkup, /Failed to load installed plugins/);
  assert.match(errorMarkup, /network unavailable/);

  const emptyMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'empty',
  });
  assert.match(emptyMarkup, /No installed plugins found/);

  const tableMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'table',
    installedPlugins: [createInstalledPluginRow()],
  });
  assert.match(tableMarkup, /<table/);
  assert.match(tableMarkup, /Tag Manager/);

  const accessBlockedMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'access-blocked',
    accessState: 'sign-in-required',
  });
  assert.match(accessBlockedMarkup, /Sign in with a configured account/);
});
