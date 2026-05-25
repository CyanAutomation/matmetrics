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
  manifest: unknown;
};

/**
 * Requirement mapping:
 * - PM-UI-001 (plugin manifest spec): uiContract.layoutVariant must be non-empty
 *   and runtime-supported.
 * - PM-UI-002 (plugin manifest spec): uiContract.requiredUxStates must enumerate
 *   UX states required for the plugin surface.
 * - PM-UI-003 (plugin manifest spec): dashboard_tab extension id and config.tabId
 *   must follow the stable tab naming contract.
 */
const REQUIRED_UX_STATES = ['loading', 'error', 'empty'] as const;

const getDashboardTabExtension = (
  manifest: PluginManifest,
  pluginId: string
): DashboardTabExtension => {
  const dashboardTab = manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(
    dashboardTab,
    `[${pluginId}] [PM-UI-003] expected exactly one dashboard_tab extension for dashboard surface wiring`
  );

  return dashboardTab as DashboardTabExtension;
};

const assertRequiredUxStates = (
  pluginId: string,
  requiredUxStates: readonly string[]
): void => {
  const requiredSet = new Set(requiredUxStates);

  for (const requiredState of REQUIRED_UX_STATES) {
    assert.ok(
      requiredSet.has(requiredState),
      `[${pluginId}] [PM-UI-002] missing required UX state "${requiredState}" in uiContract.requiredUxStates`
    );
  }

  assert.equal(
    requiredSet.size,
    requiredUxStates.length,
    `[${pluginId}] [PM-UI-002] uiContract.requiredUxStates must not contain duplicates`
  );
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
      assert.fail(
        `Expected valid plugin manifest: ${validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join('; ')}`
      );
    }

    assert.equal(validation.manifest.id, pluginId);

    const dashboardTab = getDashboardTabExtension(
      validation.manifest,
      pluginId
    );

    assert.equal(
      dashboardTab.id,
      dashboardExtensionId,
      `[${pluginId}] [PM-UI-003] dashboard tab extension id mismatch`
    );
    assert.equal(
      dashboardTab.config.tabId,
      pluginId,
      `[${pluginId}] [PM-UI-003] dashboard tab config.tabId must equal plugin id`
    );
    assert.equal(
      dashboardTab.id,
      `${dashboardTab.config.tabId}-dashboard-tab`,
      `[${pluginId}] [PM-UI-003] dashboard tab id must align with tabId + "-dashboard-tab"`
    );
    assert.equal(
      dashboardTab.config.component,
      componentId,
      `[${pluginId}] [PM-UI-003] dashboard component id mismatch`
    );

    const uiContract = validation.manifest.uiContract;
    assert.ok(
      uiContract,
      `[${pluginId}] [PM-UI-001] expected uiContract metadata on the plugin manifest`
    );
    assert.ok(
      uiContract.layoutVariant,
      `[${pluginId}] [PM-UI-001] uiContract.layoutVariant must be set`
    );
    assert.equal(
      isSupportedPluginSurfaceLayoutVariant(uiContract.layoutVariant),
      true,
      `[${pluginId}] [PM-UI-001] uiContract.layoutVariant must map to supported runtime variants: ${SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS.join(', ')}`
    );

    assert.ok(
      uiContract.requiredUxStates,
      `[${pluginId}] [PM-UI-002] expected uiContract.requiredUxStates to be defined`
    );
    assertRequiredUxStates(pluginId, uiContract.requiredUxStates);
  });
};
