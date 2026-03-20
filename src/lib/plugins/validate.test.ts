import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePluginManifest } from '@/lib/plugins/validate';

test('valid manifest passes with no issues', () => {
  const result = validatePluginManifest({
    id: 'tags-plugin',
    name: 'Tag Manager Plugin',
    version: '1.2.3',
    description: 'Adds tag management extensions.',
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
