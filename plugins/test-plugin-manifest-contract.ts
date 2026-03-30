import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSupportedPluginSurfaceLayoutVariant,
  SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS,
} from '@/lib/plugins/plugin-surface';
import { validatePluginManifest } from '@/lib/plugins/validate';
import type {
  DashboardTabExtension,
  PluginManifest,
} from '@/lib/plugins/types';

type PluginManifestContractParams = {
  pluginId: string;
  dashboardExtensionId: string;
  componentId: string;
  manifest: PluginManifest;
};

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

export const testPluginManifestContract = ({
  pluginId,
  dashboardExtensionId,
  componentId,
  manifest,
}: PluginManifestContractParams): void => {
  test(`${pluginId} manifest contract`, () => {
    const validation = validatePluginManifest(manifest);

    if (!validation.isValid) {
      assert.fail('Expected valid plugin manifest');
    }

    assert.equal(validation.manifest.id, pluginId);

    const dashboardTab = getDashboardTabExtension(
      validation.manifest,
      pluginId
    );

    assert.equal(dashboardTab.id, dashboardExtensionId);
    assert.equal(dashboardTab.config.tabId, pluginId);
    assert.equal(
      dashboardTab.id,
      `${dashboardTab.config.tabId}-dashboard-tab`,
      `[${pluginId}] dashboard tab id must align with tabId`
    );
    assert.equal(
      dashboardTab.config.component,
      componentId,
      `[${pluginId}] dashboard component id mismatch`
    );
    assert.ok(
      validation.manifest.uiContract,
      `[${pluginId}] expected uiContract metadata`
    );
    assert.ok(
      validation.manifest.uiContract?.layoutVariant,
      `[${pluginId}] uiContract.layoutVariant must be set`
    );
    assert.equal(
      isSupportedPluginSurfaceLayoutVariant(
        validation.manifest.uiContract?.layoutVariant ?? ''
      ),
      true,
      `[${pluginId}] uiContract.layoutVariant must map to supported runtime variants: ${SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS.join(', ')}`
    );
    assert.ok(
      validation.manifest.uiContract?.requiredUxStates.includes('loading'),
      `[${pluginId}] uiContract.requiredUxStates should include loading`
    );
  });
};
