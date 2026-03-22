import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  listStoredPluginManifests,
  toValidationTable,
} from '@/lib/plugins/api-contract';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const manifests = await listStoredPluginManifests();
    const pluginRows = manifests.map((entry) => {
      const validation = toValidationTable(entry.manifest);
      return {
        manifest: entry.manifest,
        validation,
      };
    });

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
            isValid: pluginRows.every((entry) => entry.validation.isValid),
            rows: pluginRows.flatMap((entry) => entry.validation.rows),
          },
          assumptions: ['Local plugin manifests are sourced from plugins/*/plugin.json.'],
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error listing plugins', error);
    return NextResponse.json({ error: 'Failed to list plugins' }, { status: 500 });
  }
}
