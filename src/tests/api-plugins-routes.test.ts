import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { POST as CREATE } from '@/app/api/plugins/create/route';
import { GET as LIST } from '@/app/api/plugins/list/route';
import { POST as UPDATE } from '@/app/api/plugins/update/route';
import { POST as VALIDATE } from '@/app/api/plugins/validate/route';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

const baseManifest = {
  id: 'tags-plugin',
  name: 'Tag Manager Plugin',
  version: '1.0.0',
  description: 'Provides a dashboard tab for managing tags.',
  enabled: true,
  uiExtensions: [
    {
      type: 'dashboard_tab',
      id: 'tags-dashboard-tab',
      title: 'Tag Manager',
      config: {
        tabId: 'tags',
        headerTitle: 'Manage Tags',
        icon: 'tags',
        component: 'tag_manager',
      },
    },
  ],
};

async function withTempRepo(run: (repoRoot: string) => Promise<void>) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'matmetrics-plugin-route-'));
  const previousCwd = process.cwd();

  try {
    await mkdir(path.join(repoRoot, 'plugins', 'tags'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'plugins', 'tags', 'plugin.json'),
      `${JSON.stringify({ ...baseManifest, unknownTopLevel: { preserveMe: true } }, null, 2)}\n`,
      'utf8'
    );

    process.chdir(repoRoot);
    await run(repoRoot);
  } finally {
    process.chdir(previousCwd);
    await rm(repoRoot, { recursive: true, force: true });
  }
}

test('GET /api/plugins/list returns manifests and contract payload', async () => {
  await withTempRepo(async () => {
    const response = await LIST(
      new NextRequest('http://localhost/api/plugins/list', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.plugins.length, 1);
    assert.equal(payload.fileTreeDiffSummary.mode, 'dry-run');
    assert.equal(payload.fileTreeDiffSummary.files[0].changeType, 'unchanged');
    assert.equal(payload.validationTable.isValid, true);
  });
});

test('POST /api/plugins/validate returns validation table for invalid manifest', async () => {
  const response = await VALIDATE(
    new NextRequest('http://localhost/api/plugins/validate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        manifest: {
          id: 'x',
          name: 'X',
          version: 'invalid',
          description: 'broken',
          uiExtensions: [],
        },
      }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.isValid, false);
  assert.equal(payload.validationTable.isValid, false);
  assert.ok(payload.validationTable.rows.length > 0);
});

test('POST /api/plugins/create is non-destructive by default and rejects overwrite without flag', async () => {
  await withTempRepo(async () => {
    const response = await CREATE(
      new NextRequest('http://localhost/api/plugins/create', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ manifest: baseManifest, confirm: false }),
      })
    );

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.unresolvedInputs[0], 'confirmOverwrite');
  });
});

test('POST /api/plugins/create writes only when confirm and confirmOverwrite are true', async () => {
  await withTempRepo(async (repoRoot) => {
    const response = await CREATE(
      new NextRequest('http://localhost/api/plugins/create', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          manifest: { ...baseManifest, description: 'updated from create' },
          confirm: true,
          confirmOverwrite: true,
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.persisted, true);
    assert.equal(payload.fileTreeDiffSummary.mode, 'applied');

    const stored = JSON.parse(
      await readFile(path.join(repoRoot, 'plugins', 'tags', 'plugin.json'), 'utf8')
    );
    assert.equal(stored.description, 'updated from create');
  });
});

test('POST /api/plugins/update performs merge-preserve and dry-run by default', async () => {
  await withTempRepo(async (repoRoot) => {
    const response = await UPDATE(
      new NextRequest('http://localhost/api/plugins/update', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'tags-plugin',
          manifest: {
            description: 'updated description',
            settings: { darkMode: true },
          },
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.persisted, false);
    assert.equal(payload.manifest.unknownTopLevel.preserveMe, true);
    assert.equal(payload.manifest.settings.darkMode, true);

    const stored = JSON.parse(
      await readFile(path.join(repoRoot, 'plugins', 'tags', 'plugin.json'), 'utf8')
    );
    assert.equal(stored.description, 'Provides a dashboard tab for managing tags.');
    assert.equal(stored.unknownTopLevel.preserveMe, true);
  });
});

test('POST /api/plugins/update rejects applied overwrite without confirmOverwrite', async () => {
  await withTempRepo(async () => {
    const response = await UPDATE(
      new NextRequest('http://localhost/api/plugins/update', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'tags-plugin',
          manifest: { description: 'forced update' },
          confirm: true,
        }),
      })
    );

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.unresolvedInputs[0], 'confirmOverwrite');
  });
});
