import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const loadApiContract = async () => import('@/lib/plugins/api-contract');

test('autoDisablePluginIfNeeded - returns manifest unchanged if no issues', async () => {
  const { autoDisablePluginIfNeeded } = await loadApiContract();
  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    enabled: true,
    capabilities: ['tag_mutation'],
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'test-tab',
        title: 'Test',
        config: {
          tabId: 'test',
          headerTitle: 'Test',
          component: 'test_component',
        },
      },
    ],
  };

  const result = autoDisablePluginIfNeeded(manifest);
  assert.equal((result.manifest as typeof manifest).enabled, true);
  assert.equal(result.autoDisabledWithWarnings, undefined);
});

test('autoDisablePluginIfNeeded - disables plugin with missing capabilities', async () => {
  const { autoDisablePluginIfNeeded } = await loadApiContract();
  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    enabled: true,
    // Missing capabilities that are required
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tag-manager',
        title: 'Tag Manager',
        config: {
          tabId: 'tags',
          headerTitle: 'Manage Tags',
          component: 'tag_manager', // Requires 'tag_mutation' capability
        },
      },
    ],
  };

  const result = autoDisablePluginIfNeeded(manifest);
  assert.equal((result.manifest as typeof manifest).enabled, false);
  assert.ok(result.autoDisabledWithWarnings);
  assert.ok(
    result.autoDisabledWithWarnings.some((w) =>
      w.includes('requires capability')
    )
  );
});

test('autoDisablePluginIfNeeded - disables plugin with version mismatch', async () => {
  const { autoDisablePluginIfNeeded } = await loadApiContract();
  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    enabled: true,
    minVersion: '1.3.0',
    capabilities: [],
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'test-tab',
        title: 'Test',
        config: {
          tabId: 'test',
          headerTitle: 'Test',
          component: 'test_component',
        },
      },
    ],
  };

  const result = autoDisablePluginIfNeeded(manifest);
  assert.equal((result.manifest as typeof manifest).enabled, false);
  assert.ok(result.autoDisabledWithWarnings);
  assert.ok(
    result.autoDisabledWithWarnings.some((w) =>
      w.includes('requires matmetrics version')
    )
  );
});

test('autoDisablePluginIfNeeded - respects already disabled plugins', async () => {
  const { autoDisablePluginIfNeeded } = await loadApiContract();
  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    enabled: false, // Already disabled
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tag-manager',
        title: 'Tag Manager',
        config: {
          tabId: 'tags',
          headerTitle: 'Manage Tags',
          component: 'tag_manager', // Would normally require capability
        },
      },
    ],
  };

  const result = autoDisablePluginIfNeeded(manifest);
  // Should not add auto-disable warnings if already disabled
  assert.equal(result.autoDisabledWithWarnings, undefined);
});

test('autoDisablePluginIfNeeded - handles non-object manifests gracefully', async () => {
  const { autoDisablePluginIfNeeded } = await loadApiContract();
  const result1 = autoDisablePluginIfNeeded(null);
  assert.equal(result1.manifest, null);

  const result2 = autoDisablePluginIfNeeded('not-an-object');
  assert.equal(result2.manifest, 'not-an-object');

  const result3 = autoDisablePluginIfNeeded(undefined);
  assert.equal(result3.manifest, undefined);
});

test('toValidationTable skips runtime renderer checks by default (server-safe)', async () => {
  const { toValidationTable } = await loadApiContract();
  const result = toValidationTable({
    id: 'server-safe-validation-plugin',
    name: 'Server Safe Validation Plugin',
    version: '1.0.0',
    description: 'Used for API validation',
    capabilities: ['tag_mutation'],
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'server-safe-tab',
        title: 'Server Safe',
        config: {
          tabId: 'server-safe',
          headerTitle: 'Server Safe',
          component: 'non_registered_component',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.rows, []);
});

test('server-side API validation preserves the client bootstrap boundary', () => {
  const blockedModules = [
    'runtime-component-validation',
    'plugin-component-bootstrap',
    'dashboard-tab-adapters',
  ];
  const loaderSource = `
    const blockedModules = ${JSON.stringify(blockedModules)};
    export async function resolve(specifier, context, nextResolve) {
      if (blockedModules.some((moduleName) => specifier.endsWith(moduleName) || specifier.includes(`/${moduleName}`))) {
        throw new Error(\`Server validation crossed into blocked client/runtime module: \${specifier}\`);
      }
      return nextResolve(specifier, context);
    }
  `;
  const registerLoaderSource = `
    import { register } from 'node:module';
    register(${JSON.stringify(
      `data:text/javascript,${encodeURIComponent(loaderSource)}`
    )}, import.meta.url);
  `;
  const registerLoaderUrl = `data:text/javascript,${encodeURIComponent(
    registerLoaderSource
  )}`;
  const validationScript = `
    const apiContractModule = await import('@/lib/plugins/api-contract');
    const { toValidationTable } = apiContractModule.default ?? apiContractModule;
    const result = toValidationTable({
      id: 'isolated-server-validation-plugin',
      name: 'Isolated Server Validation Plugin',
      version: '1.0.0',
      description: 'Exercises the server-only validation dependency boundary',
      capabilities: ['tag_mutation'],
      uiExtensions: [{
        type: 'dashboard_tab',
        id: 'isolated-server-tab',
        title: 'Server Safe',
        config: {
          tabId: 'server-safe',
          headerTitle: 'Server Safe',
          component: 'intentionally_not_bootstrapped',
        },
      }],
    });
    if (!result.isValid || result.rows.length !== 0) {
      throw new Error(\`Unexpected validation result: \${JSON.stringify(result)}\`);
    }
  `;

  const isolatedValidation = spawnSync(
    process.execPath,
    ['--import', registerLoaderUrl, '--import', 'tsx', '--input-type=module'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: validationScript,
    }
  );

  assert.equal(
    isolatedValidation.status,
    0,
    `Server-side API validation must remain isolated from runtime component validation and client bootstrap modules.\n${isolatedValidation.stderr}`
  );
});
