import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  getPluginsRoot,
  listStoredPluginManifests,
  toValidationTable,
} from '@/lib/plugins/api-contract';
import * as pluginContractGate from '@/lib/plugins/plugin-contract-gate';
import type { PluginManifest } from '@/lib/plugins/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';
const INTERNAL_PROCESSING_FAILURE_PATH = 'processing.internal';
const throwForConfiguredPlugin = (directoryName: string): void => {
  const configuredDirectory = process.env.MATMETRICS_PLUGIN_GATE_THROW_FOR_DIR;
  if (configuredDirectory && configuredDirectory === directoryName) {
    throw new Error('Simulated plugin contract gate failure');
  }
};

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

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const manifests = await listStoredPluginManifests();
    const pluginsRoot = getPluginsRoot();
    const pluginProcessingErrors: string[] = [];

    const pluginRows = await Promise.all(
      manifests.map(async (entry) => {
        try {
          const validation = toValidationTable(entry.manifest, {
            validateDeclaredComponentsAtRuntime: false,
          });
          throwForConfiguredPlugin(entry.directoryName);
          const gateResult = await pluginContractGate.runPluginContractGate({
            pluginsRoot,
            directoryName: entry.directoryName,
            manifest: asGateManifest(entry.manifest),
          });

          validation.rows.push(...gateResult.issues);
          validation.isValid = validation.isValid && gateResult.isValid;

          return {
            pluginId:
              typeof entry.manifest.id === 'string' ? entry.manifest.id : null,
            directoryName: entry.directoryName,
            validation,
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(
            `Error processing plugin "${entry.directoryName}" in /api/plugins/validate:`,
            errMsg
          );
          pluginProcessingErrors.push(
            `Failed to process plugin "${entry.directoryName}": ${errMsg}`
          );
          return {
            pluginId:
              typeof entry.manifest.id === 'string' ? entry.manifest.id : null,
            directoryName: entry.directoryName,
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
          };
        }
      })
    );

    const validationRows = pluginRows.flatMap((row) => row.validation.rows);

    return NextResponse.json(
      {
        plugins: pluginRows,
        ...createContractPayload({
          fileTreeDiffSummary: {
            mode: 'dry-run',
            files: manifests.map((entry) => ({
              path: entry.relativePath,
              changeType: 'unchanged',
            })),
          },
          validationTable: {
            isValid: pluginRows.every((row) => row.validation.isValid),
            rows: validationRows,
          },
          assumptions: [
            'Validation includes manifest schema checks and plugin contract gate checks.',
          ],
          unresolvedInputs: pluginProcessingErrors,
        }),
      },
      { status: pluginProcessingErrors.length > 0 ? 206 : 200 }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error validating plugins:', errMsg);
    return NextResponse.json(
      {
        error: 'Failed to validate plugins',
        details:
          process.env.NODE_ENV === 'production'
            ? 'An internal error occurred'
            : errMsg,
      },
      { status: 500 }
    );
  }
}
