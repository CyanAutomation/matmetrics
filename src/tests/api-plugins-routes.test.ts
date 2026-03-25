import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { POST as CREATE } from '@/app/api/plugins/create/route';
import { GET as LIST } from '@/app/api/plugins/list/route';
import { POST as TOGGLE } from '@/app/api/plugins/toggle/route';
import { POST as UPDATE } from '@/app/api/plugins/update/route';
import { POST as VALIDATE } from '@/app/api/plugins/validate/route';
import { resetPluginEnabledOverridesForTests } from '@/lib/plugins/state.server';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

test.afterEach(() => {
  resetPluginEnabledOverridesForTests();
});

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
    await mkdir(path.join(process.cwd(), 'plugins', 'tags', 'src'), {
      recursive: true,
    });
    await writeFile(
      path.join(process.cwd(), 'plugins', 'tags', 'src', 'index.ts'),
      `export const initPlugin = (context: { register?: (id: string) => void; registerPluginComponent?: (id: string, renderer: unknown) => void; }) => {
  context.register?.('tags-dashboard-tab');
  context.registerPluginComponent?.('tag_manager', () => null);
};
`,
      'utf8'
    );
    await mkdir(path.join(process.cwd(), 'plugins', 'tags', 'src', 'components'), {
      recursive: true,
    });
    await writeFile(
      path.join(
        process.cwd(),
        'plugins',
        'tags',
        'src',
        'components',
        'tag-manager.tsx'
      ),
      'export default function TagManager() { return null; }\\n',
      'utf8'
    );
    await writeFile(
      path.join(process.cwd(), 'plugins', 'tags', 'README.md'),
      '# Tag Manager\\n\\n## Usage\\n\\nUse plugin.\\n\\n## Verification\\n\\nVerify plugin.\\n',
      'utf8'
    );
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
    assert.equal(typeof payload.plugins[0].validation.isValid, 'boolean');
    assert.equal(Array.isArray(payload.plugins[0].validation.rows), true);
  });
});

test('GET /api/plugins/list surfaces plugin contract gate violations', async () => {
  await withTempRepo(async () => {
    const response = await LIST(
      new NextRequest('http://localhost/api/plugins/list', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.validationTable.isValid, false);
    assert.equal(
      payload.plugins[0].validation.rows.some(
        (issue: { path: string }) => issue.path === 'contractGate.readme'
      ),
      true
    );
  });
});

test('POST /api/plugins/toggle persists enabled override without mutating plugin.json', async () => {
  await withTempRepo(async (repoRoot) => {
    const pluginPath = path.join(repoRoot, 'plugins', 'tags', 'plugin.json');
    const original = await readFile(pluginPath, 'utf8');

    const toggleResponse = await TOGGLE(
      new NextRequest('http://localhost/api/plugins/toggle', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'tags-plugin',
          enabled: false,
          confirm: true,
          confirmOverwrite: true,
        }),
      })
    );

    assert.equal(toggleResponse.status, 200);
    const togglePayload = await toggleResponse.json();
    assert.equal(togglePayload.persisted, true);
    assert.equal(togglePayload.manifest.enabled, false);
    assert.equal(
      togglePayload.fileTreeDiffSummary.files[0].path,
      'firestore:app/pluginConfig'
    );

    const listResponse = await LIST(
      new NextRequest('http://localhost/api/plugins/list', {
        headers: { authorization: 'Bearer test-token' },
      })
    );

    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.plugins[0].manifest.enabled, false);

    const after = await readFile(pluginPath, 'utf8');
    assert.equal(after, original);
  });
});

test('plugin create/update routes are deprecated and return disabled responses', async () => {
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

test('POST /api/plugins/validate returns contract gate violations', async () => {
  await withTempRepo(async () => {
    const response = await VALIDATE(
      new NextRequest('http://localhost/api/plugins/validate', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.validationTable.isValid, false);
    assert.equal(
      payload.validationTable.rows.some(
        (issue: { path: string }) => issue.path === 'contractGate.readme'
      ),
      true
    );
  });
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
