import assert from 'node:assert/strict';
import test from 'node:test';

import { getRequiredCapabilityForExtension } from '@/lib/plugins/capabilities';
import type { UIExtension } from '@/lib/plugins/types';

test('returns required capability for known extension ids', () => {
  assert.equal(
    getRequiredCapabilityForExtension({
      type: 'dashboard_tab',
      id: 'dashboard-tab',
      title: 'Dashboard',
      config: {
        tabId: 'tags',
        headerTitle: 'Tag Manager',
        component: 'tag_manager',
      },
    }),
    'tag_mutation'
  );

  assert.equal(
    getRequiredCapabilityForExtension({
      type: 'session_action',
      id: 'session-action',
      title: 'Session Action',
      config: {
        actionId: 'tag-session',
        component: 'session_tagger',
      },
    }),
    'tag_mutation'
  );

  assert.equal(
    getRequiredCapabilityForExtension({
      type: 'settings_panel',
      id: 'settings-panel',
      title: 'Settings',
      config: {
        section: 'tags',
        component: 'tag_settings',
      },
    }),
    'tag_mutation'
  );
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
  assert.equal(getRequiredCapabilityForExtension(missingSettingsComponent), null);
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
