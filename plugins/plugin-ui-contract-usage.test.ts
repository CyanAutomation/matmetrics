import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

import {
  PluginEmptyState,
  PluginErrorState,
  PluginLoadingState,
  PluginSuccessState,
} from '@/components/plugins/plugin-state';
import {
  derivePromptSettingsViewState,
  PROMPT_SETTINGS_LOADING_TEXT,
  PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT,
} from './prompt-settings/src/components/prompt-settings';
import {
  deriveTagManagerEmptyState,
  TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL,
} from './tag-manager/src/components/tag-manager';
import { deriveVideoLibraryEmptyState } from './video-library/src/components/video-library';
import {
  deriveGitHubSettingsControlState,
  getGitHubSettingsValidationError,
} from './github-sync/src/components/github-settings-view-model';
import { resolveResetDiagnosticsSnapshot } from './log-doctor/src/components/log-doctor-state';

const repoRoot = process.cwd();

type NarrowImportSmoke = {
  pluginId: string;
  sourcePath: string;
  expectedImports: string[];
};

const smokeContracts: NarrowImportSmoke[] = [
  {
    pluginId: 'github-sync',
    sourcePath: 'plugins/github-sync/src/components/github-settings.tsx',
    expectedImports: ['PluginLoadingState', 'PluginErrorState'],
  },
];

for (const contract of smokeContracts) {
  test(`${contract.pluginId} keeps plugin-state imports wired`, () => {
    const source = readFileSync(
      path.join(repoRoot, contract.sourcePath),
      'utf8'
    );

    for (const symbol of contract.expectedImports) {
      assert.match(
        source,
        new RegExp(`\\b${symbol}\\b`),
        `[${contract.pluginId}] expected import or JSX symbol ${symbol}`
      );
    }
  });
}

test('prompt-settings loading state path is reachable and renders plugin loading primitive', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: false,
    preferencesError: null,
    prompt: '',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(state.loading, true);

  const html = renderToStaticMarkup(
    React.createElement(PluginLoadingState, {
      title: 'Loading prompt settings',
      description: PROMPT_SETTINGS_LOADING_TEXT,
    })
  );

  assert.match(html, /Loading prompt settings/);
  assert.match(html, new RegExp(PROMPT_SETTINGS_LOADING_TEXT));
});

test('tag-manager empty-history state path is reachable and renders plugin empty-state primitive', () => {
  const emptyState = deriveTagManagerEmptyState('');
  assert.equal(emptyState.action, 'refreshTags');
  assert.equal(emptyState.ctaLabel, TAG_MANAGER_EMPTY_HISTORY_CTA_LABEL);

  const html = renderToStaticMarkup(
    React.createElement(PluginEmptyState, {
      title: 'No tags yet',
      description: emptyState.message,
      ctaLabel: emptyState.ctaLabel,
      onCta: () => undefined,
    })
  );

  assert.match(html, /No tags yet/);
  assert.match(html, /No technique tags found in your history\./);
});

test('video-library lounge empty path is reachable and renders plugin empty-state primitive', () => {
  const emptyState = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: '',
    hasAdvancedFiltersApplied: false,
  });

  assert.equal(emptyState.title, 'No saved videos yet');

  const html = renderToStaticMarkup(
    React.createElement(PluginEmptyState, {
      title: emptyState.title,
      description: emptyState.description,
    })
  );

  assert.match(html, /No saved videos yet/);
});

test('github-settings invalid input path is reachable and renders plugin error-state primitive', () => {
  const validationError = getGitHubSettingsValidationError('', '');
  assert.equal(typeof validationError, 'string');

  const controlState = deriveGitHubSettingsControlState({
    canUseGitHubSync: true,
    owner: '',
    repo: '',
    isEnabled: false,
    isTesting: false,
    isSyncing: false,
    isSyncHistoryLoading: false,
    isDisabling: false,
    isClearing: false,
    isClearDialogOpen: false,
  });
  assert.equal(controlState.canTestConnection, false);

  const html = renderToStaticMarkup(
    React.createElement(PluginErrorState, {
      title: 'Configuration invalid',
      message: validationError ?? 'Missing settings',
    })
  );

  assert.match(html, /Configuration invalid/);
});

test('log-doctor reset path is reachable and renders plugin success-state primitive', () => {
  const snapshot = resolveResetDiagnosticsSnapshot(
    {
      scanResult: null,
      fixResult: null,
      selectedPaths: ['data/2026/01/20260101-matmetrics.md'],
      uiState: { phase: 'error', operation: 'scan', message: 'failed' },
      errorMessage: 'failed',
      auditResult: null,
    },
    true
  );

  assert.equal(snapshot.next.uiState.phase, 'idle');
  assert.equal(snapshot.previous?.selectedPaths.length, 1);

  const html = renderToStaticMarkup(
    React.createElement(PluginSuccessState, {
      title: 'Diagnostics reset',
      description: 'All diagnostics markers were cleared for a clean rerun.',
    })
  );

  assert.match(html, /Diagnostics reset/);
});

test('prompt-settings default-profile path can surface an empty-state message payload', () => {
  const state = derivePromptSettingsViewState({
    canSavePreferences: true,
    preferencesReady: true,
    preferencesError: null,
    prompt: 'You are a training assistant.',
    isSaving: false,
    isResetting: false,
    saveStatus: 'idle',
  });

  assert.equal(state.isEmptyStateCtaAvailable, true);

  const html = renderToStaticMarkup(
    React.createElement(PluginEmptyState, {
      title: 'No custom profile yet',
      description: PROMPT_SETTINGS_EMPTY_STATE_CTA_TEXT,
    })
  );

  assert.match(html, /No custom profile yet/);
});
