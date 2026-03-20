import assert from 'node:assert/strict';
import test from 'node:test';

import { mapDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';

test('resolves Tag Manager sidebar tab from plugin manifest extensions', () => {
  const extensions = loadEnabledDashboardTabExtensions();
  const tabs = mapDashboardExtensionsToTabs(extensions);

  const tagManagerTab = tabs.find((tab) => tab.id === 'tag-manager');

  assert.ok(tagManagerTab);
  assert.equal(tagManagerTab?.title, 'Tag Manager');
  assert.equal(tagManagerTab?.section, 'plugins');
});
