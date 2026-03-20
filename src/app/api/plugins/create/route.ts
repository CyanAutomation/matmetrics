import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

import {
  createContractPayload,
  findStoredPluginManifestById,
  getPluginsRoot,
  toPluginDirectoryName,
  toRelativeRepoPath,
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
    const manifest = body?.manifest;
    const confirm = body?.confirm === true;
    const confirmOverwrite = body?.confirmOverwrite === true;

    if (!manifest || typeof manifest !== 'object') {
      return NextResponse.json(
        {
          error: 'Missing required field: manifest',
          ...createContractPayload({ unresolvedInputs: ['manifest'] }),
        },
        { status: 400 }
      );
    }

    const validationTable = toValidationTable(manifest);
    if (!validationTable.isValid) {
      return NextResponse.json(
        {
          error: 'Plugin manifest validation failed',
          ...createContractPayload({ validationTable }),
        },
        { status: 400 }
      );
    }

    const pluginId = (manifest as Record<string, unknown>).id;
    if (typeof pluginId !== 'string' || !pluginId.trim()) {
      return NextResponse.json(
        {
          error: 'Manifest id must be a non-empty string',
          ...createContractPayload({ unresolvedInputs: ['manifest.id'] }),
        },
        { status: 400 }
      );
    }

    const existing = await findStoredPluginManifestById(pluginId);
    if (existing && !confirmOverwrite) {
      return NextResponse.json(
        {
          error: 'Plugin already exists. Set confirmOverwrite=true to overwrite.',
          ...createContractPayload({
            validationTable,
            fileTreeDiffSummary: {
              mode: 'dry-run',
              files: [{ path: existing.relativePath, changeType: 'modified' }],
            },
            unresolvedInputs: ['confirmOverwrite'],
          }),
        },
        { status: 409 }
      );
    }

    const directoryName = existing?.directoryName ?? toPluginDirectoryName(pluginId);
    const absolutePath =
      existing?.absolutePath ??
      path.join(getPluginsRoot(), directoryName, 'plugin.json');
    const relativePath = existing?.relativePath ?? toRelativeRepoPath(absolutePath);

    if (confirm) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writePluginManifest(absolutePath, manifest);
    }

    return NextResponse.json(
      {
        created: !existing,
        persisted: confirm,
        ...createContractPayload({
          validationTable,
          fileTreeDiffSummary: {
            mode: confirm ? 'applied' : 'dry-run',
            files: [
              {
                path: relativePath,
                changeType: existing ? 'modified' : 'added',
              },
            ],
          },
          assumptions: [
            'Operations are non-destructive by default (confirm=false means dry-run only).',
          ],
        }),
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('Error creating plugin', error);
    return NextResponse.json({ error: 'Failed to create plugin' }, { status: 500 });
  }
}
