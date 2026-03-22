import { NextRequest, NextResponse } from 'next/server';

import {
  autoDisablePluginIfNeeded,
  createContractPayload,
  listStoredPluginManifests,
  toValidationTable,
  type StoredPluginManifest,
} from '@/lib/plugins/api-contract';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const manifests: StoredPluginManifest[] = [];
    const discoveryErrors: string[] = [];

    try {
      const loadedManifests = await listStoredPluginManifests();
      manifests.push(...loadedManifests);
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : String(error);
      console.error('Error discovering plugins:', errMsg);
      discoveryErrors.push(
        `Failed to discover plugins: ${errMsg}`
      );
      // Continue with empty plugins list instead of failing completely
    }

    const pluginRows = manifests.map((entry) => {
      const { manifest: processedManifest, autoDisabledWithWarnings } =
        autoDisablePluginIfNeeded(entry.manifest);
      const validation = toValidationTable(processedManifest);

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

      return {
        manifest: processedManifest,
        validation,
        autoDisabledWithWarnings,
      };
    });

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
        ],
        unresolvedInputs: discoveryErrors,
      }),
    };

    return NextResponse.json(response, {
      status: discoveryErrors.length > 0 ? 206 : 200, // 206 Partial Content if there were discovery errors
    });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : String(error);
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
