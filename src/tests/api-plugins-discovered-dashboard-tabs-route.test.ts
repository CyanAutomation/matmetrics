import assert from 'node:assert/strict';
import test from 'node:test';

// biome-ignore lint/security/noCommonJs: Test runtime exposes Next route modules through CommonJS interop.
const routeModule = require('@/app/api/plugins/discovered-dashboard-tabs/route') as typeof import('@/app/api/plugins/discovered-dashboard-tabs/route');
// biome-ignore lint/security/noCommonJs: Test runtime exposes server-only modules through CommonJS interop.
const stateModule = require('@/lib/plugins/state.server') as typeof import('@/lib/plugins/state.server');
const {
  GET: DISCOVER_DASHBOARD_TABS,
  dynamic,
} = routeModule;
const { persistPluginEnabledOverride, resetPluginEnabledOverridesForTests } =
  stateModule;

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test.afterEach(() => {
  resetPluginEnabledOverridesForTests();
});

test('discovered dashboard tabs route is force-dynamic and no-store', async () => {
  const response = await DISCOVER_DASHBOARD_TABS();

  assert.equal(dynamic, 'force-dynamic');
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('Cache-Control'),
    'no-store, no-cache, max-age=0, must-revalidate'
  );
});

test('discovered dashboard tabs route reflects enabled overrides', async () => {
  const enabledResponse = await DISCOVER_DASHBOARD_TABS();
  assert.equal(enabledResponse.status, 200);
  const enabledPayload = await enabledResponse.json();
  assert.equal(
    enabledPayload.extensions.some(
      (extension: { pluginId: string }) => extension.pluginId === 'tag-manager'
    ),
    true
  );

  await persistPluginEnabledOverride('tag-manager', false);

  const disabledResponse = await DISCOVER_DASHBOARD_TABS();
  assert.equal(disabledResponse.status, 200);
  const disabledPayload = await disabledResponse.json();
  assert.equal(
    disabledPayload.extensions.some(
      (extension: { pluginId: string }) => extension.pluginId === 'tag-manager'
    ),
    false
  );
});
