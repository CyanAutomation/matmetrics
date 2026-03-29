import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  findStoredPluginManifestById,
  toValidationTable,
} from '@/lib/plugins/api-contract';
import { persistPluginEnabledOverride } from '@/lib/plugins/state.server';
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

    const effectiveManifest = {
      ...existing.manifest,
      enabled,
    };

    const validationTable = toValidationTable(effectiveManifest, {
      validateDeclaredComponentsAtRuntime: false,
    });
    if (!validationTable.isValid) {
      return NextResponse.json(
        {
          error: 'Plugin manifest validation failed',
          ...createContractPayload({ validationTable }),
        },
        { status: 400 }
      );
    }

    await persistPluginEnabledOverride(pluginId, enabled);

    return NextResponse.json(
      {
        persisted: true,
        manifest: effectiveManifest,
        ...createContractPayload({
          validationTable,
          fileTreeDiffSummary: {
            mode: 'applied',
            files: [
              {
                path: 'firestore:app/pluginConfig',
                changeType: 'modified',
              },
            ],
          },
          assumptions: [
            'Toggle mutations are persisted as Firebase-backed enabled overrides.',
          ],
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error toggling plugin enabled state', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to toggle plugin enabled state!',
      },
      { status: 500 }
    );
  }
}
