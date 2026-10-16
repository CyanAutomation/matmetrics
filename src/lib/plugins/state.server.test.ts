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

  await persistPluginEnabledOverride('user-a', 'tag-manager', false);

  const overrides = await loadPluginEnabledOverrides('user-a');
  assert.deepEqual(overrides, { 'tag-manager': false });
  assert.deepEqual(await loadPluginEnabledOverrides('user-b'), {});
});

test('plugin override writes reject when the D1 data Worker is not configured', async () => {
  const previous = process.env.MATMETRICS_AUTH_TEST_MODE;
  const previousUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const previousSecret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  delete process.env.MATMETRICS_AUTH_TEST_MODE;
  delete process.env.CLOUDFLARE_DATA_WORKER_URL;
  delete process.env.MATMETRICS_INTERNAL_API_SECRET;

  try {
    await assert.rejects(
      () => loadPluginEnabledOverrides('user-a'),
      /background data service is not configured/
    );
    await assert.rejects(
      () => persistPluginEnabledOverride('user-a', 'tag-manager', false),
      /background data service is not configured/
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = previous;
    }
    if (previousUrl === undefined) delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    else process.env.CLOUDFLARE_DATA_WORKER_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    else process.env.MATMETRICS_INTERNAL_API_SECRET = previousSecret;
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
  assert.deepEqual(
    applyPluginEnabledOverrides(manifest, { 'tag-manager': false }),
    {
      ...manifest,
      enabled: false,
    }
  );
});
