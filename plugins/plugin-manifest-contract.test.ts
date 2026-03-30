import assert from 'node:assert/strict';
import test from 'node:test';

import githubSyncManifest from './github-sync/plugin.json';
import logDoctorManifest from './log-doctor/plugin.json';
import promptSettingsManifest from './prompt-settings/plugin.json';
import tagManagerManifest from './tag-manager/plugin.json';
import videoLibraryManifest from './video-library/plugin.json';
import {
  isSupportedPluginSurfaceLayoutVariant,
  SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS,
} from '@/lib/plugins/plugin-surface';
import { validatePluginManifest } from '@/lib/plugins/validate';
import type {
  DashboardTabExtension,
  PluginManifest,
} from '@/lib/plugins/types';

type ManifestExpectations = {
  pluginId: string;
  dashboardExtensionId: string;
  dashboardComponentId: string;
};

type ManifestFixture = {
  manifest: PluginManifest;
  expectations: ManifestExpectations;
};

const pluginManifestFixtures: ManifestFixture[] = [
  {
    manifest: githubSyncManifest,
    expectations: {
      pluginId: 'github-sync',
      dashboardExtensionId: 'github-sync-dashboard-tab',
      dashboardComponentId: 'github_settings',
    },
  },
  {
    manifest: logDoctorManifest,
    expectations: {
      pluginId: 'log-doctor',
      dashboardExtensionId: 'log-doctor-dashboard-tab',
      dashboardComponentId: 'log_doctor',
    },
  },
  {
    manifest: promptSettingsManifest,
    expectations: {
      pluginId: 'prompt-settings',
      dashboardExtensionId: 'prompt-settings-dashboard-tab',
      dashboardComponentId: 'prompt_settings',
    },
  },
  {
    manifest: tagManagerManifest,
    expectations: {
      pluginId: 'tag-manager',
      dashboardExtensionId: 'tag-manager-dashboard-tab',
      dashboardComponentId: 'tag_manager',
    },
  },
  {
    manifest: videoLibraryManifest,
    expectations: {
      pluginId: 'video-library',
      dashboardExtensionId: 'video-library-dashboard-tab',
      dashboardComponentId: 'video_library',
    },
  },
];

const getDashboardTabExtension = (
  manifest: PluginManifest,
  pluginId: string
): DashboardTabExtension => {
  const dashboardTab = manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(
    dashboardTab,
    `[${pluginId}] expected a dashboard_tab extension in the manifest`
  );

  return dashboardTab as DashboardTabExtension;
};

for (const { manifest, expectations } of pluginManifestFixtures) {
  test(`${expectations.pluginId} manifest contract`, () => {
    const validation = validatePluginManifest(manifest);

    if (!validation.isValid) {
      assert.fail('Expected valid plugin manifest');
    }

    assert.equal(validation.manifest.id, expectations.pluginId);

    const dashboardTab = getDashboardTabExtension(
      validation.manifest,
      expectations.pluginId
    );

    assert.equal(dashboardTab.id, expectations.dashboardExtensionId);
    assert.equal(dashboardTab.config.tabId, expectations.pluginId);
    assert.equal(
      dashboardTab.id,
      `${dashboardTab.config.tabId}-dashboard-tab`,
      `[${expectations.pluginId}] dashboard tab id must align with tabId`
    );
    assert.equal(
      dashboardTab.config.component,
      expectations.dashboardComponentId,
      `[${expectations.pluginId}] dashboard component id mismatch`
    );
    assert.ok(
      validation.manifest.uiContract,
      `[${expectations.pluginId}] expected uiContract metadata`
    );
    assert.ok(
      validation.manifest.uiContract?.layoutVariant,
      `[${expectations.pluginId}] uiContract.layoutVariant must be set`
    );
    assert.equal(
      isSupportedPluginSurfaceLayoutVariant(
        validation.manifest.uiContract?.layoutVariant ?? ''
      ),
      true,
      `[${expectations.pluginId}] uiContract.layoutVariant must map to supported runtime variants: ${SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS.join(', ')}`
    );
    assert.ok(
      validation.manifest.uiContract?.requiredUxStates.includes('loading'),
      `[${expectations.pluginId}] uiContract.requiredUxStates should include loading`
    );
  });
}
