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
      maturity: {
        score: 62,
        tier: 'bronze',
        categoryScores: {
          contract_metadata: {
            label: 'Contract & Metadata',
            earned: 10,
            possible: 20,
          },
          runtime_integration: {
            label: 'Runtime Integration',
            earned: 14,
            possible: 20,
          },
          feature_quality: {
            label: 'Feature Quality',
            earned: 16,
            possible: 25,
          },
          test_coverage: {
            label: 'Test Coverage',
            earned: 12,
            possible: 20,
          },
          operability_docs: {
            label: 'Operability & Docs',
            earned: 10,
            possible: 15,
          },
        },
        reasons: ['Plugin README is missing.'],
        nextActions: [
          'Add a README for each plugin with usage and verification steps.',
        ],
        evidence: ['Manifest passes required schema validation.'],
        verificationDetails: {
          testEvidenceSource: 'heuristic',
          testEvidenceFiles: ['src/tests/tag-manager.test.ts'],
          readmeSections: [],
          uxCriteria: {
            loadingStatePresent: {
              label: 'loading state present',
              relevant: true,
              declared: true,
              verified: true,
              source: 'heuristic',
              files: ['src/tests/tag-manager.test.ts'],
            },
            errorStateWithRecovery: {
              label: 'error state present with recovery',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
            emptyStateWithCta: {
              label: 'empty state present with CTA',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
            destructiveActionSafety: {
              label: 'destructive action confirmation + cancellation path',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
          },
        },
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
  assert.equal(rows[0]?.maturity?.tier, 'bronze');
});

test('normalizeInstalledPluginRows keeps maturity when contract gate errors exist', () => {
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
        rows: [
          {
            severity: 'error',
            path: 'contractGate.readme',
            message: 'README is missing required sections.',
          },
        ],
      },
      maturity: {
        score: 40,
        tier: 'bronze',
        categoryScores: {
          contract_metadata: {
            label: 'Contract & Metadata',
            earned: 8,
            possible: 20,
          },
          runtime_integration: {
            label: 'Runtime Integration',
            earned: 10,
            possible: 20,
          },
          feature_quality: {
            label: 'Feature Quality',
            earned: 10,
            possible: 25,
          },
          test_coverage: {
            label: 'Test Coverage',
            earned: 7,
            possible: 20,
          },
          operability_docs: {
            label: 'Operability & Docs',
            earned: 5,
            possible: 15,
          },
        },
        reasons: ['README contract requirements are not fully satisfied.'],
        nextActions: ['Add Usage and Verification sections to README.md.'],
        evidence: ['Manifest passes required schema validation.'],
        verificationDetails: {
          testEvidenceSource: 'heuristic',
          testEvidenceFiles: ['src/tests/tag-manager.test.ts'],
          readmeSections: [],
          uxCriteria: {
            loadingStatePresent: {
              label: 'loading state present',
              relevant: true,
              declared: true,
              verified: true,
              source: 'heuristic',
              files: ['src/tests/tag-manager.test.ts'],
            },
            errorStateWithRecovery: {
              label: 'error state present with recovery',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
            emptyStateWithCta: {
              label: 'empty state present with CTA',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
            destructiveActionSafety: {
              label: 'destructive action confirmation + cancellation path',
              relevant: false,
              declared: false,
              verified: false,
              source: 'none',
              files: [],
            },
          },
        },
      },
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.issues[0]?.path, 'contractGate.readme');
  assert.equal(rows[0]?.maturity?.score, 40);
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
              maturity: {
                score: 62,
                tier: 'bronze',
                categoryScores: {
                  contract_metadata: {
                    label: 'Contract & Metadata',
                    earned: 10,
                    possible: 20,
                  },
                  runtime_integration: {
                    label: 'Runtime Integration',
                    earned: 14,
                    possible: 20,
                  },
                  feature_quality: {
                    label: 'Feature Quality',
                    earned: 16,
                    possible: 25,
                  },
                  test_coverage: {
                    label: 'Test Coverage',
                    earned: 12,
                    possible: 20,
                  },
                  operability_docs: {
                    label: 'Operability & Docs',
                    earned: 10,
                    possible: 15,
                  },
                },
                reasons: ['Plugin README is missing.'],
                nextActions: [
                  'Add a README for each plugin with usage and verification steps.',
                ],
                evidence: ['Manifest passes required schema validation.'],
                verificationDetails: {
                  testEvidenceSource: 'heuristic',
                  testEvidenceFiles: ['src/tests/tag-manager.test.ts'],
                  readmeSections: [],
                  uxCriteria: {
                    loadingStatePresent: {
                      label: 'loading state present',
                      relevant: true,
                      declared: true,
                      verified: true,
                      source: 'heuristic',
                      files: ['src/tests/tag-manager.test.ts'],
                    },
                    errorStateWithRecovery: {
                      label: 'error state present with recovery',
                      relevant: false,
                      declared: false,
                      verified: false,
                      source: 'none',
                      files: [],
                    },
                    emptyStateWithCta: {
                      label: 'empty state present with CTA',
                      relevant: false,
                      declared: false,
                      verified: false,
                      source: 'none',
                      files: [],
                    },
                    destructiveActionSafety: {
                      label:
                        'destructive action confirmation + cancellation path',
                      relevant: false,
                      declared: false,
                      verified: false,
                      source: 'none',
                      files: [],
                    },
                  },
                },
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
  assert.equal(plugins[0]?.maturity?.tier, 'bronze');
});

test('fetchInstalledPlugins surfaces API error payloads for auth failures', async () => {
  await assert.rejects(
    () =>
      fetchInstalledPlugins({
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
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
