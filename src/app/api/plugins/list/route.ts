import { NextRequest, NextResponse } from 'next/server';

import {
  autoDisablePluginIfNeeded,
  createContractPayload,
  getPluginsRoot,
  listStoredPluginManifests,
  toValidationTable,
  type StoredPluginManifest,
} from '@/lib/plugins/api-contract';
import { scorePluginMaturity } from '@/lib/plugins/maturity';
import { runPluginContractGate } from '@/lib/plugins/plugin-contract-gate';
import {
  applyPluginEnabledOverrides,
  loadPluginEnabledOverrides,
} from '@/lib/plugins/state.server';
import type { PluginManifest } from '@/lib/plugins/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';

const asGateManifest = (value: unknown): Pick<PluginManifest, 'uiExtensions'> => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as PluginManifest).uiExtensions)
  ) {
    return value as PluginManifest;
  }

  return { uiExtensions: [] };
};

const hasScorableManifestShape = (
  value: unknown
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const manifests: StoredPluginManifest[] = [];
    const discoveryErrors: string[] = [];
    let enabledOverrides = {};

    try {
      const loadedManifests = await listStoredPluginManifests();
      manifests.push(...loadedManifests);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('Error discovering plugins:', errMsg);
      discoveryErrors.push(`Failed to discover plugins: ${errMsg}`);
      // Continue with empty plugins list instead of failing completely
    }

    try {
      enabledOverrides = await loadPluginEnabledOverrides();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('Error loading plugin enabled overrides:', errMsg);
      discoveryErrors.push(
        `Failed to load plugin enabled overrides: ${errMsg}`
      );
    }

    const pluginsRoot = getPluginsRoot();

    const pluginRows = await Promise.all(
      manifests.map(async (entry) => {
        const effectiveManifest = applyPluginEnabledOverrides(
          entry.manifest,
          enabledOverrides
        );
        const { manifest: processedManifest, autoDisabledWithWarnings } =
          autoDisablePluginIfNeeded(effectiveManifest);
        const validation = toValidationTable(processedManifest);

        const gateResult = await runPluginContractGate({
          pluginsRoot,
          directoryName: entry.directoryName,
          manifest: asGateManifest(processedManifest),
        });

        validation.rows.push(...gateResult.issues);
        validation.isValid = validation.isValid && gateResult.isValid;

        // Add auto-disable warnings to validation issues
        if (autoDisabledWithWarnings) {
          validation.rows.push(
            ...autoDisabledWithWarnings.map((msg) => ({
              severity: 'warning' as const,
              path: 'enabled',
              message: `Auto-disabled: ${msg}`,
            }))
          );
        }

        const maturity = hasScorableManifestShape(processedManifest)
          ? await scorePluginMaturity({
              manifest: processedManifest as PluginManifest,
              validationIssues: validation.rows,
              pluginDirectoryName: entry.directoryName,
              autoDisabledWithWarnings,
            })
          : undefined;

        return {
          manifest: processedManifest,
          validation,
          autoDisabledWithWarnings,
          maturity,
        };
      })
    );

    const response = {
      plugins: pluginRows,
      ...createContractPayload({
        fileTreeDiffSummary: {
          mode: 'dry-run' as const,
          files: manifests.map((entry) => ({
            path: entry.relativePath,
            changeType: 'unchanged' as const,
          })),
        },
        validationTable: {
          isValid:
            discoveryErrors.length === 0 &&
            pluginRows.every((entry) => entry.validation.isValid),
          rows: pluginRows.flatMap((entry) => entry.validation.rows),
        },
        assumptions: [
          'Local plugin manifests are sourced from plugins/*/plugin.json.',
          'Plugins with capability mismatches or version conflicts are auto-disabled.',
          'Plugin contract gate requires src/index.ts, component mapping coverage, and README Usage/Verification sections.',
        ],
        unresolvedInputs: discoveryErrors,
      }),
    };

    return NextResponse.json(response, {
      status: discoveryErrors.length > 0 ? 206 : 200, // 206 Partial Content if there were discovery errors
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error listing plugins:', errMsg);
    return NextResponse.json(
      {
        error: 'Failed to list plugins',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
