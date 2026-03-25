import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  getPluginsRoot,
  listStoredPluginManifests,
  toValidationTable,
} from '@/lib/plugins/api-contract';
import { runPluginContractGate } from '@/lib/plugins/plugin-contract-gate';
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

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const manifests = await listStoredPluginManifests();
    const pluginsRoot = getPluginsRoot();

    const pluginRows = await Promise.all(
      manifests.map(async (entry) => {
        const validation = toValidationTable(entry.manifest);
        const gateResult = await runPluginContractGate({
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
      })
    );

    const validationRows = pluginRows.flatMap((row) => row.validation.rows);

    return NextResponse.json({
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
      }),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error validating plugins:', errMsg);
    return NextResponse.json(
      {
        error: 'Failed to validate plugins',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
