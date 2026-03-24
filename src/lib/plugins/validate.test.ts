import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePluginManifest } from '@/lib/plugins/validate';

test('valid manifest passes with no issues', () => {
  const result = validatePluginManifest({
    id: 'tags-plugin',
    name: 'Tag Manager Plugin',
    version: '1.2.3',
    description: 'Adds tag management extensions.',
    capabilities: ['tag_mutation'],
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tags-dashboard-tab',
        title: 'Tag Manager',
        config: {
          tabId: 'tags',
          headerTitle: 'Manage Tags',
          component: 'tag_manager',
        },
      },
      {
        type: 'menu_item',
        id: 'tags-menu-item',
        title: 'Tags',
        config: {
          route: '/tags',
          location: 'sidebar',
        },
      },
      {
        type: 'session_action',
        id: 'tags-session-action',
        title: 'Tag Session',
        config: {
          actionId: 'tag-session',
          component: 'session_tagger',
        },
      },
      {
        type: 'settings_panel',
        id: 'tags-settings-panel',
        title: 'Tag Settings',
        config: {
          section: 'tags',
          component: 'tag_settings',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.issues.length, 0);
    assert.equal(result.manifest.enabled, true);
  }
});

test('invalid manifest reports normalized errors with paths and severity', () => {
  const result = validatePluginManifest({
    id: 'broken-plugin',
    name: 'Broken Plugin',
    version: '1.0.0',
    description: 'Broken config',
    uiExtensions: [
      {
        type: 'menu_item',
        id: 'duplicate-id',
        title: 'Broken Menu Item',
        config: {
          route: '',
          location: '',
        },
      },
      {
        type: 'menu_item',
        id: 'duplicate-id',
        title: 'Broken Menu Item Copy',
        config: {
          route: '/tags',
          location: 'sidebar',
        },
      },
    ],
  });

  assert.equal(result.isValid, false);
  if (!result.isValid) {
    assert.deepEqual(
      result.issues.map((issue) => ({
        severity: issue.severity,
        path: issue.path,
      })),
      [
        { severity: 'error', path: 'uiExtensions[0].config.route' },
        { severity: 'error', path: 'uiExtensions[0].config.location' },
        { severity: 'error', path: 'uiExtensions[1].id' },
      ]
    );
  }
});

test('unknown extension type is warning by default', () => {
  const result = validatePluginManifest({
    id: 'experimental-plugin',
    name: 'Experimental Plugin',
    version: '1.0.0',
    description: 'Contains an unknown type.',
    uiExtensions: [
      {
        type: 'future_extension',
        id: 'future-extension',
        title: 'Future Extension',
        config: {
          route: '/future',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.deepEqual(result.issues, [
      {
        severity: 'warning',
        path: 'uiExtensions[0].type',
        message: 'Unknown extension type "future_extension".',
      },
    ]);
  }
});

test('unknown extension type can be explicitly accepted as experimental', () => {
  const result = validatePluginManifest(
    {
      id: 'experimental-plugin',
      name: 'Experimental Plugin',
      version: '1.0.0',
      description: 'Contains an unknown type.',
      uiExtensions: [
        {
          type: 'future_extension',
          id: 'future-extension',
          title: 'Future Extension',
          config: {
            route: '/future',
          },
        },
      ],
    },
    { allowExperimentalTypes: true }
  );

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.deepEqual(result.issues, [
      {
        severity: 'info',
        path: 'uiExtensions[0].type',
        message: 'Experimental extension type "future_extension" accepted.',
      },
    ]);
  }
});

test('sensitive extension without required capability returns warning', () => {
  const result = validatePluginManifest({
    id: 'missing-capability-plugin',
    name: 'Missing Capability Plugin',
    version: '1.0.0',
    description: 'Contains sensitive extension without capability.',
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tag-manager-dashboard-tab',
        title: 'Tag Manager',
        config: {
          tabId: 'tag-manager',
          headerTitle: 'Manage Tags',
          component: 'tag_manager',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.deepEqual(result.issues, [
      {
        severity: 'warning',
        path: 'uiExtensions[0].capabilities',
        message:
          'Extension "tag-manager-dashboard-tab" requires capability "tag_mutation". Add it to manifest.capabilities to enable execution.',
      },
    ]);
  }
});

test('unknown capability returns warning', () => {
  const result = validatePluginManifest({
    id: 'unknown-capability-plugin',
    name: 'Unknown Capability Plugin',
    version: '1.0.0',
    description: 'Contains unknown capability declaration.',
    capabilities: ['future_capability'],
    uiExtensions: [
      {
        type: 'menu_item',
        id: 'known-menu-item',
        title: 'Known Menu Item',
        config: {
          route: '/future',
          location: 'sidebar',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.deepEqual(result.issues, [
      {
        severity: 'warning',
        path: 'capabilities[0]',
        message: 'Unknown capability "future_capability".',
      },
    ]);
  }
});

test('known capability declaration passes without warnings', () => {
  const result = validatePluginManifest({
    id: 'known-capability-plugin',
    name: 'Known Capability Plugin',
    version: '1.0.0',
    description: 'Contains known capability declaration.',
    capabilities: ['tag_mutation'],
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'tag-manager-dashboard-tab',
        title: 'Tag Manager',
        config: {
          tabId: 'tag-manager',
          headerTitle: 'Manage Tags',
          component: 'tag_manager',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.issues.length, 0);
  }
});

test('manifest accepts optional first-party metadata and maturity metadata', () => {
  const result = validatePluginManifest({
    id: 'mature-plugin',
    name: 'Mature Plugin',
    version: '1.0.0',
    description: 'Includes maturity metadata.',
    owner: 'Matmetrics',
    homepage: 'https://example.com/plugins/mature-plugin',
    maturity: {
      tier: 'bronze',
      notes: 'Initial baseline.',
      lastReviewedAt: '2026-03-24',
    },
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'mature-plugin-dashboard-tab',
        title: 'Mature Plugin',
        config: {
          tabId: 'mature-plugin',
          headerTitle: 'Mature Plugin',
          component: 'mature_plugin',
        },
      },
    ],
  });

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.manifest.owner, 'Matmetrics');
    assert.equal(result.manifest.maturity?.tier, 'bronze');
  }
});

test('plugin with acceptable minVersion passes', () => {
  const result = validatePluginManifest(
    {
      id: 'version-compatible-plugin',
      name: 'Version Compatible Plugin',
      version: '1.0.0',
      description: 'Plugin with compatible version requirement.',
      minVersion: '0.1.0', // Same as current version in app-version.ts
      uiExtensions: [
        {
          type: 'menu_item',
          id: 'menu-item',
          title: 'Menu Item',
          config: {
            route: '/test',
            location: 'sidebar',
          },
        },
      ],
    },
    { currentVersion: '0.1.0' }
  );

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.issues.length, 0);
  }
});

test('plugin with too-high minVersion returns warning', () => {
  const result = validatePluginManifest(
    {
      id: 'version-incompatible-plugin',
      name: 'Version Incompatible Plugin',
      version: '1.0.0',
      description: 'Plugin with incompatible version requirement.',
      minVersion: '1.0.0', // Higher than current version 0.1.0
      uiExtensions: [
        {
          type: 'menu_item',
          id: 'menu-item',
          title: 'Menu Item',
          config: {
            route: '/test',
            location: 'sidebar',
          },
        },
      ],
    },
    { currentVersion: '0.1.0' }
  );

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.deepEqual(result.issues, [
      {
        severity: 'warning',
        path: 'minVersion',
        message:
          'Plugin requires matmetrics version 1.0.0 or higher, but current version is 0.1.0.',
      },
    ]);
  }
});

test('plugin without explicit minVersion passes regardless of version', () => {
  const result = validatePluginManifest(
    {
      id: 'no-version-plugin',
      name: 'No Version Plugin',
      version: '1.0.0',
      description: 'Plugin without version requirement.',
      // No minVersion specified
      uiExtensions: [
        {
          type: 'menu_item',
          id: 'menu-item',
          title: 'Menu Item',
          config: {
            route: '/test',
            location: 'sidebar',
          },
        },
      ],
    },
    { currentVersion: '0.1.0' }
  );

  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.issues.length, 0);
  }
});
