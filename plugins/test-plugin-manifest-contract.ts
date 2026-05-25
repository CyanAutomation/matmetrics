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
  requirementSource?: string;
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
  pluginId: string,
  reqPrefix: string
): DashboardTabExtension => {
  const dashboardTab = manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(
    dashboardTab,
    `${reqPrefix}[${pluginId}] [PM-UI-003] expected exactly one dashboard_tab extension for dashboard surface wiring`
  );

  return dashboardTab as DashboardTabExtension;
};

const assertRequiredUxStates = (
  pluginId: string,
  requiredUxStates: readonly string[],
  reqPrefix: string
): void => {
  const requiredSet = new Set(requiredUxStates);

  for (const requiredState of REQUIRED_UX_STATES) {
    assert.ok(
      requiredSet.has(requiredState),
      `${reqPrefix}[${pluginId}] [PM-UI-002] missing required UX state "${requiredState}" in uiContract.requiredUxStates`
    );
  }

  assert.equal(
    requiredSet.size,
    requiredUxStates.length,
    `${reqPrefix}[${pluginId}] [PM-UI-002] uiContract.requiredUxStates must not contain duplicates`
  );
};

export const testPluginManifestContract = ({
  pluginId,
  dashboardExtensionId,
  componentId,
  manifest,
  requirementSource,
}: PluginManifestContractParams): void => {
  test(`${pluginId} manifest contract`, () => {
    const reqPrefix = requirementSource ? `[req:${requirementSource}] ` : '';
    const validation = validatePluginManifest(manifest);

    if (!validation.isValid) {
      assert.fail(
        `${reqPrefix}Expected valid plugin manifest: ${validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join('; ')}`
      );
    }

    assert.equal(validation.manifest.id, pluginId, `${reqPrefix}manifest id must match plugin id`);

    const dashboardTab = getDashboardTabExtension(
      validation.manifest,
      pluginId,
      reqPrefix
    );

    assert.equal(
      dashboardTab.id,
      dashboardExtensionId,
      `${reqPrefix}[${pluginId}] [PM-UI-003] dashboard tab extension id mismatch`
    );
    assert.equal(
      dashboardTab.config.tabId,
      pluginId,
      `${reqPrefix}[${pluginId}] [PM-UI-003] dashboard tab config.tabId must equal plugin id`
    );
    assert.equal(
      dashboardTab.id,
      `${dashboardTab.config.tabId}-dashboard-tab`,
      `${reqPrefix}[${pluginId}] [PM-UI-003] dashboard tab id must align with tabId + "-dashboard-tab"`
    );
    assert.equal(
      dashboardTab.config.component,
      componentId,
      `${reqPrefix}[${pluginId}] [PM-UI-003] dashboard component id mismatch`
    );

    const uiContract = validation.manifest.uiContract;
    assert.ok(
      uiContract,
      `${reqPrefix}[${pluginId}] [PM-UI-001] expected uiContract metadata on the plugin manifest`
    );
    assert.ok(
      uiContract.layoutVariant,
      `${reqPrefix}[${pluginId}] [PM-UI-001] uiContract.layoutVariant must be set`
    );
    assert.equal(
      isSupportedPluginSurfaceLayoutVariant(uiContract.layoutVariant),
      true,
      `${reqPrefix}[${pluginId}] [PM-UI-001] uiContract.layoutVariant must map to supported runtime variants: ${SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS.join(', ')}`
    );

    assert.ok(
      uiContract.requiredUxStates,
      `${reqPrefix}[${pluginId}] [PM-UI-002] expected uiContract.requiredUxStates to be defined`
    );
    assertRequiredUxStates(pluginId, uiContract.requiredUxStates, reqPrefix);

    const manifestWithoutRequiredUxStates = {
      ...validation.manifest,
      uiContract: {
        ...validation.manifest.uiContract,
        requiredUxStates: undefined,
      },
    };

    const missingUxStatesValidation = validatePluginManifest(
      manifestWithoutRequiredUxStates
    );
    assert.equal(missingUxStatesValidation.isValid, false);
    assert.ok(
      missingUxStatesValidation.issues.some(
        (issue) =>
          issue.path.includes('uiContract.requiredUxStates') &&
          issue.severity === 'error'
      ),
      `${reqPrefix}[${pluginId}] expected structured issue for missing uiContract.requiredUxStates`
    );

    const firstExtension = validation.manifest.uiExtensions[0];
    const manifestWithDuplicateExtensionIds = {
      ...validation.manifest,
      uiExtensions: [...validation.manifest.uiExtensions, { ...firstExtension }],
    };

    const duplicateExtensionValidation = validatePluginManifest(
      manifestWithDuplicateExtensionIds
    );
    assert.equal(duplicateExtensionValidation.isValid, false);
    assert.ok(
      duplicateExtensionValidation.issues.some(
        (issue) =>
          issue.path.includes('.id') &&
          issue.message.includes('Duplicate extension id') &&
          issue.severity === 'error'
      ),
      `${reqPrefix}[${pluginId}] expected duplicate extension id structured error`
    );
  });
};
