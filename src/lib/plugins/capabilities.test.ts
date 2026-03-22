import assert from 'node:assert/strict';
import test from 'node:test';

import { getRequiredCapabilityForExtension } from '@/lib/plugins/capabilities';
import type { UIExtension } from '@/lib/plugins/types';

test('returns required capability for extension types covered by policy', () => {
  // Authoritative contract reference: docs/plugin-capability-policy.md
  const cases: Array<{
    name: string;
    rationale: string;
    extension: UIExtension;
    expectedCapability: 'tag_mutation';
  }> = [
    {
      name: 'dashboard_tab',
      rationale:
        'Dashboard tabs that render tag-manager UI can mutate tag data and must require tag_mutation.',
      extension: {
        type: 'dashboard_tab',
        id: 'dashboard-tab',
        title: 'Dashboard',
        config: {
          tabId: 'tags',
          headerTitle: 'Tag Manager',
          component: 'tag_manager',
        },
      },
      expectedCapability: 'tag_mutation',
    },
    {
      name: 'session_action',
      rationale:
        'Session actions that trigger tag-session workflows can change session tags and must require tag_mutation.',
      extension: {
        type: 'session_action',
        id: 'session-action',
        title: 'Session Action',
        config: {
          actionId: 'tag-session',
          component: 'session_tagger',
        },
      },
      expectedCapability: 'tag_mutation',
    },
    {
      name: 'settings_panel',
      rationale:
        'Settings panels that manage tag settings can update tag configuration and must require tag_mutation.',
      extension: {
        type: 'settings_panel',
        id: 'settings-panel',
        title: 'Settings',
        config: {
          section: 'tags',
          component: 'tag_settings',
        },
      },
      expectedCapability: 'tag_mutation',
    },
  ];

  cases.forEach(({ name, rationale, extension, expectedCapability }) => {
    assert.equal(
      getRequiredCapabilityForExtension(extension),
      expectedCapability,
      `Capability policy regression for ${name}: ${rationale}`
    );
  });
});

test('returns null for malformed extension config shape', () => {
  const malformedDashboard = {
    type: 'dashboard_tab',
    id: 'dashboard-tab',
    title: 'Dashboard',
    config: {
      tabId: 'tags',
      headerTitle: 'Tag Manager',
      component: 123,
    },
  } as unknown as UIExtension;

  const malformedSessionAction = {
    type: 'session_action',
    id: 'session-action',
    title: 'Session Action',
    config: {
      actionId: null,
      component: 'session_tagger',
    },
  } as unknown as UIExtension;

  const missingSettingsComponent = {
    type: 'settings_panel',
    id: 'settings-panel',
    title: 'Settings',
    config: {
      section: 'tags',
    },
  } as unknown as UIExtension;

  assert.equal(getRequiredCapabilityForExtension(malformedDashboard), null);
  assert.equal(getRequiredCapabilityForExtension(malformedSessionAction), null);
  assert.equal(
    getRequiredCapabilityForExtension(missingSettingsComponent),
    null
  );
});

test('returns null for unknown ids and unknown extension types', () => {
  assert.equal(
    getRequiredCapabilityForExtension({
      type: 'dashboard_tab',
      id: 'dashboard-tab-unknown',
      title: 'Dashboard',
      config: {
        tabId: 'unknown',
        headerTitle: 'Unknown',
        component: 'unknown_component',
      },
    }),
    null
  );

  assert.equal(
    getRequiredCapabilityForExtension({
      type: 'future_extension',
      id: 'future-ext',
      title: 'Future extension',
      config: {},
    }),
    null
  );
});
