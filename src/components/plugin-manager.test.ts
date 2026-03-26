import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePluginManagerInstalledViewState } from './plugin-manager';

test('derivePluginManagerInstalledViewState resolves loading for initial and loading fetch states', () => {
  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: true,
      fetchState: 'idle',
      installedPluginCount: 0,
    }),
    'loading'
  );

  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: true,
      fetchState: 'loading',
      installedPluginCount: 0,
    }),
    'loading'
  );
});

test('derivePluginManagerInstalledViewState resolves error when fetch fails', () => {
  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: true,
      fetchState: 'error',
      installedPluginCount: 0,
    }),
    'error'
  );
});

test('derivePluginManagerInstalledViewState resolves empty after successful load with zero plugins', () => {
  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: true,
      fetchState: 'success',
      installedPluginCount: 0,
    }),
    'empty'
  );
});

test('derivePluginManagerInstalledViewState resolves table when successful load returns plugins', () => {
  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: true,
      fetchState: 'success',
      installedPluginCount: 2,
    }),
    'table'
  );
});

test('derivePluginManagerInstalledViewState resolves access-blocked when auth is unavailable', () => {
  assert.equal(
    derivePluginManagerInstalledViewState({
      canManagePlugins: false,
      fetchState: 'success',
      installedPluginCount: 3,
    }),
    'access-blocked'
  );
});
