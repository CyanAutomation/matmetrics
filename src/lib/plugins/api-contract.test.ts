import assert from 'node:assert/strict';
import test from 'node:test';

import { autoDisablePluginIfNeeded } from '@/lib/plugins/api-contract';

test('autoDisablePluginIfNeeded - returns manifest unchanged if no issues', () => {
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
  assert.equal(
    (result.manifest as typeof manifest).enabled,
    true
  );
  assert.equal(result.autoDisabledWithWarnings, undefined);
});

test('autoDisablePluginIfNeeded - disables plugin with missing capabilities', () => {
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
  assert.equal(
    (result.manifest as typeof manifest).enabled,
    false
  );
  assert.ok(result.autoDisabledWithWarnings);
  assert.ok(
    result.autoDisabledWithWarnings.some((w) =>
      w.includes('requires capability')
    )
  );
});

test('autoDisablePluginIfNeeded - disables plugin with version mismatch', () => {
  const manifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    enabled: true,
    minVersion: '1.0.0', // Higher than current version 0.1.0
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
  assert.equal(
    (result.manifest as typeof manifest).enabled,
    false
  );
  assert.ok(result.autoDisabledWithWarnings);
  assert.ok(
    result.autoDisabledWithWarnings.some((w) =>
      w.includes('requires matmetrics version')
    )
  );
});

test('autoDisablePluginIfNeeded - respects already disabled plugins', () => {
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

test('autoDisablePluginIfNeeded - handles non-object manifests gracefully', () => {
  const result1 = autoDisablePluginIfNeeded(null);
  assert.equal(result1.manifest, null);

  const result2 = autoDisablePluginIfNeeded('not-an-object');
  assert.equal(result2.manifest, 'not-an-object');

  const result3 = autoDisablePluginIfNeeded(undefined);
  assert.equal(result3.manifest, undefined);
});
