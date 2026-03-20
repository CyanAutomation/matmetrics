import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  findStoredPluginManifestById,
  mergePreserveUnknownKeys,
  toValidationTable,
  writePluginManifest,
} from '@/lib/plugins/api-contract';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const pluginId = typeof body?.id === 'string' ? body.id.trim() : '';
    const updates = body?.manifest;
    const confirm = body?.confirm === true;
    const confirmOverwrite = body?.confirmOverwrite === true;

    if (!pluginId) {
      return NextResponse.json(
        {
          error: 'Missing required field: id',
          ...createContractPayload({ unresolvedInputs: ['id'] }),
        },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        {
          error: 'Missing required field: manifest',
          ...createContractPayload({ unresolvedInputs: ['manifest'] }),
        },
        { status: 400 }
      );
    }

    const existing = await findStoredPluginManifestById(pluginId);
    if (!existing) {
      return NextResponse.json(
        {
          error: 'Plugin not found',
          ...createContractPayload({ unresolvedInputs: ['id'] }),
        },
        { status: 404 }
      );
    }

    if (confirm && !confirmOverwrite) {
      return NextResponse.json(
        {
          error:
            'Update would overwrite existing plugin data. Set confirmOverwrite=true to apply changes.',
          ...createContractPayload({
            unresolvedInputs: ['confirmOverwrite'],
            fileTreeDiffSummary: {
              mode: 'dry-run',
              files: [{ path: existing.relativePath, changeType: 'modified' }],
            },
          }),
        },
        { status: 409 }
      );
    }

    const mergedManifest = mergePreserveUnknownKeys(existing.manifest, {
      ...updates,
      id: pluginId,
    });

    const validationTable = toValidationTable(mergedManifest);
    if (!validationTable.isValid) {
      return NextResponse.json(
        {
          error: 'Plugin manifest validation failed',
          ...createContractPayload({ validationTable }),
        },
        { status: 400 }
      );
    }

    if (confirm) {
      await writePluginManifest(existing.absolutePath, mergedManifest);
    }

    return NextResponse.json(
      {
        persisted: confirm,
        manifest: mergedManifest,
        ...createContractPayload({
          validationTable,
          fileTreeDiffSummary: {
            mode: confirm ? 'applied' : 'dry-run',
            files: [{ path: existing.relativePath, changeType: 'modified' }],
          },
          assumptions: ['Updates use merge-preserve semantics for unknown keys.'],
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating plugin', error);
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 });
  }
}
