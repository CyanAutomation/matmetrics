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
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-plugin-route-')
  );
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

test('plugin create/update/validate routes are deprecated and return disabled responses', async () => {
  const requests = [
    {
      route: CREATE,
      url: 'http://localhost/api/plugins/create',
      body: { manifest: baseManifest, confirm: true, confirmOverwrite: true },
    },
    {
      route: UPDATE,
      url: 'http://localhost/api/plugins/update',
      body: {
        id: 'tags-plugin',
        manifest: { description: 'forced update' },
        confirm: true,
        confirmOverwrite: true,
      },
    },
    {
      route: VALIDATE,
      url: 'http://localhost/api/plugins/validate',
      body: { manifest: baseManifest },
    },
  ] as const;

  for (const request of requests) {
    const response = await request.route(
      new NextRequest(request.url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(request.body),
      })
    );

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, 'PLUGIN_ROUTE_DISABLED');
    assert.match(payload.error, /deprecated/i);
  }
});

test('deprecated create/update routes do not mutate plugin manifests', async () => {
  await withTempRepo(async (repoRoot) => {
    const pluginPath = path.join(repoRoot, 'plugins', 'tags', 'plugin.json');
    const original = await readFile(pluginPath, 'utf8');

    const createResponse = await CREATE(
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

    assert.equal(createResponse.status, 403);

    const updateResponse = await UPDATE(
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
          confirmOverwrite: true,
        }),
      })
    );

    assert.equal(updateResponse.status, 403);

    const after = await readFile(pluginPath, 'utf8');
    assert.equal(after, original);
  });
});
