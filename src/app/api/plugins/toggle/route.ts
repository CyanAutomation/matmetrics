import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  findStoredPluginManifestById,
  mergePreserveUnknownKeys,
  toValidationTable,
  writePluginManifest,
} from '@/lib/plugins/api-contract';
import { MAX_PLUGIN_ID_LENGTH } from '@/lib/plugins/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const body = await request.json();
    const pluginId = typeof body?.id === 'string' ? body.id.trim() : '';
    const enabled = body?.enabled;
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

    if (pluginId.length > MAX_PLUGIN_ID_LENGTH) {
      return NextResponse.json(
        {
          error: `Plugin id must be at most ${MAX_PLUGIN_ID_LENGTH} characters`,
          ...createContractPayload({ unresolvedInputs: ['id'] }),
        },
        { status: 400 }
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        {
          error: 'Missing required field: enabled',
          ...createContractPayload({ unresolvedInputs: ['enabled'] }),
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

    if (!confirm || !confirmOverwrite) {
      return NextResponse.json(
        {
          error:
            'Toggle requires confirm=true and confirmOverwrite=true before applying changes.',
          ...createContractPayload({
            unresolvedInputs: [
              ...(!confirm ? ['confirm'] : []),
              ...(!confirmOverwrite ? ['confirmOverwrite'] : []),
            ],
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
      id: pluginId,
      enabled,
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

    await writePluginManifest(existing.absolutePath, mergedManifest);

    return NextResponse.json(
      {
        persisted: true,
        manifest: mergedManifest,
        ...createContractPayload({
          validationTable,
          fileTreeDiffSummary: {
            mode: 'applied',
            files: [{ path: existing.relativePath, changeType: 'modified' }],
          },
          assumptions: [
            'Toggle mutations are limited to enabled to preserve unknown manifest keys.',
          ],
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error toggling plugin enabled state', error);
    return NextResponse.json(
      { error: 'Failed to toggle plugin enabled state' },
      { status: 500 }
    );
  }
}
