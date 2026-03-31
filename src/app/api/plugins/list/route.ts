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
import * as pluginContractGate from '@/lib/plugins/plugin-contract-gate';
import {
  applyPluginEnabledOverrides,
  loadPluginEnabledOverrides,
} from '@/lib/plugins/state.server';
import type { PluginManifest } from '@/lib/plugins/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const INTERNAL_PROCESSING_FAILURE_PATH = 'processing.internal';

const asGateManifest = (
  value: unknown
): Pick<PluginManifest, 'uiExtensions'> => {
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

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      ...(init?.headers ?? {}),
    },
  });

const asErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const throwForConfiguredPlugin = (directoryName: string): void => {
  if (process.env.NODE_ENV !== 'production') {
    const configuredDirectory =
      process.env.MATMETRICS_PLUGIN_GATE_THROW_FOR_DIR;
    if (configuredDirectory && configuredDirectory === directoryName) {
      throw new Error('Simulated plugin contract gate failure');
    }
  }
};

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

    const pluginProcessingErrors: string[] = [];
    const pluginRows = await Promise.all(
      manifests.map(async (entry) => {
        try {
          const effectiveManifest = applyPluginEnabledOverrides(
            entry.manifest,
            enabledOverrides
          );
          const { manifest: processedManifest, autoDisabledWithWarnings } =
            autoDisablePluginIfNeeded(effectiveManifest);
          const validation = toValidationTable(processedManifest, {
            validateDeclaredComponentsAtRuntime: false,
          });

          throwForConfiguredPlugin(entry.directoryName);
          const gateResult = await pluginContractGate.runPluginContractGate({
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
        } catch (error) {
          const errMsg = asErrorMessage(error);
          console.error(
            `Error processing plugin "${entry.directoryName}" in /api/plugins/list:`,
            errMsg
          );
          pluginProcessingErrors.push(
            `Failed to process plugin "${entry.directoryName}": ${errMsg}`
          );
          return {
            manifest: entry.manifest,
            validation: {
              isValid: false,
              rows: [
                {
                  severity: 'error' as const,
                  path: INTERNAL_PROCESSING_FAILURE_PATH,
                  message: `Internal processing failure for plugin "${entry.directoryName}": ${errMsg}`,
                },
              ],
            },
            autoDisabledWithWarnings: undefined,
            maturity: undefined,
          };
        }
      })
    );

    const response = {
      plugins: pluginRows,
      maturityDebug: {
        routeGeneratedAt: new Date().toISOString(),
        responseCachePolicy: 'no-store',
      },
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
        unresolvedInputs: [...discoveryErrors, ...pluginProcessingErrors],
      }),
    };

    return jsonNoStore(response, {
      status:
        discoveryErrors.length > 0 || pluginProcessingErrors.length > 0
          ? 206
          : 200, // 206 Partial Content if there were discovery or plugin-processing errors
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error listing plugins:', errMsg);
    return jsonNoStore(
      {
        error: 'Failed to list plugins',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
