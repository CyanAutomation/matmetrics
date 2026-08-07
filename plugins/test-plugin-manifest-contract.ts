import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
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
const UX_STATE_EVIDENCE_CRITERIA = {
  loading: 'loadingStatePresent',
  error: 'errorStateWithRecovery',
  empty: 'emptyStateWithCta',
  destructive: 'destructiveActionSafety',
} as const;
const ACCEPTED_EVIDENCE_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
] as const;

const getEvidenceContractDiagnostics = async (
  manifest: PluginManifest,
  repoRoot: string
): Promise<string[]> => {
  const diagnostics: string[] = [];
  const evidence = manifest.maturity?.evidence;
  const referencedPaths = new Set(evidence?.testFiles ?? []);

  for (const state of manifest.uiContract?.requiredUxStates ?? []) {
    const criterion = UX_STATE_EVIDENCE_CRITERIA[state];
    const criterionPath = `maturity.evidence.uxCriteria.${criterion}`;
    const criterionEvidence = evidence?.uxCriteria?.[criterion];

    if (!criterionEvidence?.length) {
      diagnostics.push(
        `${criterionPath} must contain evidence for required UX state "${state}"`
      );
      continue;
    }

    for (const evidencePath of criterionEvidence) {
      if (!evidencePath.trim()) {
        diagnostics.push(`${criterionPath} must not contain an empty path`);
      } else {
        referencedPaths.add(evidencePath);
      }
    }
  }

  for (const evidencePath of referencedPaths) {
    const resolvedPath = path.resolve(repoRoot, evidencePath);
    const isInsideRepository =
      resolvedPath === repoRoot ||
      resolvedPath.startsWith(`${repoRoot}${path.sep}`);

    if (!isInsideRepository) {
      diagnostics.push(
        `evidence path "${evidencePath}" must remain inside the repository`
      );
      continue;
    }

    if (
      !ACCEPTED_EVIDENCE_SUFFIXES.some((suffix) =>
        evidencePath.endsWith(suffix)
      )
    ) {
      diagnostics.push(
        `evidence path "${evidencePath}" must use an accepted test suffix (${ACCEPTED_EVIDENCE_SUFFIXES.join(', ')})`
      );
      continue;
    }

    try {
      await access(resolvedPath);
    } catch {
      diagnostics.push(`evidence file "${evidencePath}" does not exist`);
    }
  }

  return diagnostics;
};

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

    assert.equal(
      validation.manifest.id,
      pluginId,
      `${reqPrefix}manifest id must match plugin id`
    );

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
      uiExtensions: [
        ...validation.manifest.uiExtensions,
        { ...firstExtension },
      ],
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

  test(`${pluginId} manifest evidence contract`, async () => {
    const reqPrefix = requirementSource ? `[req:${requirementSource}] ` : '';
    const validation = validatePluginManifest(manifest);
    assert.equal(
      validation.isValid,
      true,
      `${reqPrefix}[${pluginId}] manifest must be valid before checking evidence`
    );
    if (!validation.isValid) return;

    const diagnostics = await getEvidenceContractDiagnostics(
      validation.manifest,
      process.cwd()
    );
    assert.deepEqual(
      diagnostics,
      [],
      `${reqPrefix}[${pluginId}] maturity evidence contract failed: ${diagnostics.join('; ')}`
    );

    const firstRequiredState =
      validation.manifest.uiContract?.requiredUxStates[0];
    assert.ok(firstRequiredState);
    const firstCriterion = UX_STATE_EVIDENCE_CRITERIA[firstRequiredState];
    const invalidFixture = structuredClone(validation.manifest);
    invalidFixture.maturity = {
      ...invalidFixture.maturity,
      evidence: {
        ...invalidFixture.maturity?.evidence,
        testFiles: [
          '../outside-repository.test.ts',
          'README.md',
          'plugins/missing-evidence.test.ts',
        ],
        uxCriteria: {
          ...invalidFixture.maturity?.evidence?.uxCriteria,
          [firstCriterion]: [],
        },
      },
    };

    const invalidDiagnostics = await getEvidenceContractDiagnostics(
      invalidFixture,
      process.cwd()
    );
    assert.ok(
      invalidDiagnostics.includes(
        `maturity.evidence.uxCriteria.${firstCriterion} must contain evidence for required UX state "${firstRequiredState}"`
      ),
      `${reqPrefix}[${pluginId}] invalid fixture must receive a clear missing-evidence contract diagnostic`
    );
    assert.ok(
      invalidDiagnostics.some((diagnostic) =>
        diagnostic.includes('must remain inside the repository')
      ),
      `${reqPrefix}[${pluginId}] invalid fixture must receive a clear repository-boundary diagnostic`
    );
    assert.ok(
      invalidDiagnostics.some((diagnostic) =>
        diagnostic.includes('must use an accepted test suffix')
      ),
      `${reqPrefix}[${pluginId}] invalid fixture must receive a clear test-suffix diagnostic`
    );
    assert.ok(
      invalidDiagnostics.includes(
        'evidence file "plugins/missing-evidence.test.ts" does not exist'
      ),
      `${reqPrefix}[${pluginId}] invalid fixture must receive a clear missing-file diagnostic`
    );
  });
};
