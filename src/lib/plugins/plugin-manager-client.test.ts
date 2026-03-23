import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchInstalledPlugins,
  getPluginManagerAccessState,
  normalizeInstalledPluginRows,
  toggleInstalledPlugin,
} from '@/lib/plugins/plugin-manager-client';

test('getPluginManagerAccessState requires auth configuration before plugin access', () => {
  assert.equal(
    getPluginManagerAccessState({
      authAvailable: false,
      userPresent: true,
    }),
    'auth-unavailable'
  );

  assert.equal(
    getPluginManagerAccessState({
      authAvailable: true,
      userPresent: false,
    }),
    'sign-in-required'
  );

  assert.equal(
    getPluginManagerAccessState({
      authAvailable: true,
      userPresent: true,
    }),
    'ready'
  );
});

test('normalizeInstalledPluginRows keeps only valid manifest rows', () => {
  const rows = normalizeInstalledPluginRows([
    {
      manifest: {
        id: 'tag-manager',
        name: 'Tag Manager',
        version: '1.0.0',
        description: 'Manage tags',
        enabled: true,
      },
      validation: {
        rows: [{ severity: 'info', path: 'enabled', message: 'ok' }],
      },
    },
    {
      manifest: {
        id: 'broken-plugin',
      },
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.manifest.id, 'tag-manager');
  assert.equal(rows[0]?.issues.length, 1);
});

test('fetchInstalledPlugins adds auth headers and parses valid plugin rows', async () => {
  let requestedAuthorization: string | null = null;

  const plugins = await fetchInstalledPlugins({
    getHeaders: async (headers?: HeadersInit) => {
      const nextHeaders = new Headers(headers);
      nextHeaders.set('Authorization', 'Bearer test-token');
      return nextHeaders;
    },
    fetchImpl: async (_input, init) => {
      requestedAuthorization = new Headers(init?.headers).get('Authorization');
      return new Response(
        JSON.stringify({
          plugins: [
            {
              manifest: {
                id: 'tag-manager',
                name: 'Tag Manager',
                version: '1.0.0',
                description: 'Manage tags',
                enabled: true,
              },
              validation: {
                rows: [],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },
  });

  assert.equal(requestedAuthorization, 'Bearer test-token');
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0]?.manifest.id, 'tag-manager');
});

test('fetchInstalledPlugins surfaces API error payloads for auth failures', async () => {
  await assert.rejects(
    () =>
      fetchInstalledPlugins({
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ error: 'Authentication required' }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }
          ),
      }),
    /Authentication required/
  );
});

test('toggleInstalledPlugin sends auth headers and toggle payload', async () => {
  let requestedAuthorization: string | null = null;
  let requestedContentType: string | null = null;
  let requestedBody = '';

  await toggleInstalledPlugin({
    pluginId: 'tag-manager',
    enabled: false,
    getHeaders: async (headers?: HeadersInit) => {
      const nextHeaders = new Headers(headers);
      nextHeaders.set('Authorization', 'Bearer test-token');
      return nextHeaders;
    },
    fetchImpl: async (_input, init) => {
      const headers = new Headers(init?.headers);
      requestedAuthorization = headers.get('Authorization');
      requestedContentType = headers.get('Content-Type');
      requestedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ persisted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(requestedAuthorization, 'Bearer test-token');
  assert.equal(requestedContentType, 'application/json');
  assert.deepEqual(JSON.parse(requestedBody), {
    id: 'tag-manager',
    enabled: false,
    confirm: true,
    confirmOverwrite: true,
  });
});
