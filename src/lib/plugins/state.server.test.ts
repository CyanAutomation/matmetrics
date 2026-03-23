import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPluginEnabledOverrides,
  loadPluginEnabledOverrides,
  persistPluginEnabledOverride,
  resetPluginEnabledOverridesForTests,
} from '@/lib/plugins/state.server';

test.afterEach(() => {
  resetPluginEnabledOverridesForTests();
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
});

test('persistPluginEnabledOverride stores and loads overrides in auth test mode', async () => {
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

  await persistPluginEnabledOverride('tag-manager', false);

  const overrides = await loadPluginEnabledOverrides();
  assert.deepEqual(overrides, { 'tag-manager': false });
});

test('persistPluginEnabledOverride rejects when firebase admin is unavailable outside test mode', async () => {
  const previous = process.env.MATMETRICS_AUTH_TEST_MODE;
  delete process.env.MATMETRICS_AUTH_TEST_MODE;

  try {
    await assert.rejects(
      () => persistPluginEnabledOverride('tag-manager', false),
      /Firebase admin is not configured|Plugin state persistence is unavailable/
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = previous;
    }
  }
});

test('applyPluginEnabledOverrides changes enabled state only when an override exists', () => {
  const manifest = {
    id: 'tag-manager',
    name: 'Tag Manager Plugin',
    version: '1.0.0',
    description: 'Provides a dashboard tab for managing tags.',
    enabled: true,
    uiExtensions: [],
  };

  assert.deepEqual(applyPluginEnabledOverrides(manifest, {}), manifest);
  assert.deepEqual(applyPluginEnabledOverrides(manifest, { 'tag-manager': false }), {
    ...manifest,
    enabled: false,
  });
});
