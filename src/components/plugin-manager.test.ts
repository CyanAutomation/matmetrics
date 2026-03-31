import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { InstalledPluginManifestRow } from '@/lib/plugins/plugin-manager-client';
import type { PluginValidationIssue } from '@/lib/plugins/types';
import {
  deriveInstalledPlugins,
  derivePluginManagerInstalledViewState,
  isActiveRefreshRequest,
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
  assert.match(loadingMarkup, /plugins-loading-state/);
  assert.match(loadingMarkup, /Loading installed plugins/);

  const errorMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'error',
    loadErrorMessage: 'network unavailable',
  });
  assert.match(errorMarkup, /plugins-error-state/);
  assert.match(errorMarkup, /Failed to load installed plugins/);
  assert.match(errorMarkup, /network unavailable/);
  assert.match(errorMarkup, /Retry loading installed plugins/);

  const emptyMarkup = renderInstalledContentMarkup({
    installedPluginsViewState: 'empty',
  });
  assert.match(emptyMarkup, /plugins-empty-state/);
  assert.match(emptyMarkup, /No installed plugins found/);
  assert.match(emptyMarkup, /plugins\/\*\/plugin\.json/);

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

test('deriveInstalledPlugins keeps tag-manager priority and does not mutate source rows across repeated calls', () => {
  const installedManifestRows: InstalledPluginManifestRow[] = [
    {
      manifest: {
        id: 'zeta-tool',
        name: 'Zeta Tool',
        version: '1.0.0',
        description: 'Zeta plugin',
        enabled: true,
      },
      issues: [],
    },
    {
      manifest: {
        id: 'tag-manager',
        name: 'Tag Manager',
        version: '1.0.0',
        description: 'Tag plugin',
        enabled: true,
      },
      issues: [],
    },
    {
      manifest: {
        id: 'alpha-tool',
        name: 'Alpha Tool',
        version: '1.0.0',
        description: 'Alpha plugin',
        enabled: true,
      },
      issues: [],
    },
  ];
  const originalOrder = installedManifestRows.map((row) => row.manifest.id);
  const rowStatuses = {
    'alpha-tool': {
      status: 'success' as const,
      statusMessage: 'Saved',
    },
  };

  const firstRenderRows = deriveInstalledPlugins({
    installedManifestRows,
    rowStatuses,
  });
  const secondRenderRows = deriveInstalledPlugins({
    installedManifestRows,
    rowStatuses,
  });

  assert.deepEqual(
    installedManifestRows.map((row) => row.manifest.id),
    originalOrder
  );
  assert.deepEqual(
    firstRenderRows.map((row) => row.id),
    ['tag-manager', 'alpha-tool', 'zeta-tool']
  );
  assert.deepEqual(
    secondRenderRows.map((row) => row.id),
    ['tag-manager', 'alpha-tool', 'zeta-tool']
  );
  assert.equal(firstRenderRows[1]?.status, 'success');
});

test('isActiveRefreshRequest only applies responses for the latest mounted refresh', () => {
  const firstRequestId = 1;
  const secondRequestId = 2;

  assert.equal(
    isActiveRefreshRequest({
      requestId: firstRequestId,
      latestRequestId: secondRequestId,
      isMounted: true,
    }),
    false
  );
  assert.equal(
    isActiveRefreshRequest({
      requestId: secondRequestId,
      latestRequestId: secondRequestId,
      isMounted: true,
    }),
    true
  );
  assert.equal(
    isActiveRefreshRequest({
      requestId: secondRequestId,
      latestRequestId: secondRequestId,
      isMounted: false,
    }),
    false
  );
});

test('isActiveRefreshRequest prevents out-of-order completion from regressing current UI state', () => {
  const latestRequestId = 2;
  const uiState = {
    fetchState: 'loading' as const,
    lastUpdatedAt: null as Date | null,
  };

  const maybeApplyRefreshResult = (requestId: number) => {
    if (
      !isActiveRefreshRequest({
        requestId,
        latestRequestId,
        isMounted: true,
      })
    ) {
      return;
    }

    uiState.fetchState = 'success';
    uiState.lastUpdatedAt = new Date('2026-03-31T00:00:00.000Z');
  };

  maybeApplyRefreshResult(1);
  assert.equal(uiState.fetchState, 'loading');
  assert.equal(uiState.lastUpdatedAt, null);

  maybeApplyRefreshResult(2);
  assert.equal(uiState.fetchState, 'success');
  assert.equal(
    uiState.lastUpdatedAt?.toISOString(),
    '2026-03-31T00:00:00.000Z'
  );
});
