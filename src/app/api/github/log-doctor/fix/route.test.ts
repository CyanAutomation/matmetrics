import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { buildLogDoctorFixErrorResponse } from './error-response';

const INVALID_PROXY_ERROR =
  'Invalid MATMETRICS_GO_PROXY_BASE_URL; expected absolute URL such as https://host:port';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/github/log-doctor/fix', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('log-doctor fix route proxies to /api/go/github/log-doctor/fix with expected body mapping', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalAuthMode = process.env.MATMETRICS_AUTH_TEST_MODE;

  let fetchCall: { url: string; body: string | undefined } | undefined;

  process.env.GITHUB_TOKEN = 'ghs_test_token';
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

  global.fetch = async (input, init) => {
    fetchCall = {
      url: typeof input === 'string' ? input : input.toString(),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await POST(
      buildRequest({
        owner: '  octocat  ',
        repo: '  matmetrics  ',
        branch: '  main  ',
        mode: 'apply',
        paths: ['data/2026/03/a.md', 'data/2026/03/b.md'],
        options: {
          normalizeFrontmatter: false,
          enforceSectionOrder: true,
          preserveUserContent: false,
        },
        confirmApply: true,
      })
    );

    assert.equal(response.status, 200);
    assert.ok(fetchCall);
    assert.equal(
      fetchCall?.url,
      'http://localhost/api/go/github/log-doctor/fix'
    );
    assert.deepEqual(JSON.parse(fetchCall?.body ?? '{}'), {
      owner: 'octocat',
      repo: 'matmetrics',
      branch: 'main',
      mode: 'apply',
      paths: ['data/2026/03/a.md', 'data/2026/03/b.md'],
      options: {
        normalizeFrontmatter: false,
        enforceSectionOrder: true,
        preserveUserContent: false,
      },
      confirmApply: true,
    });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    if (originalAuthMode === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = originalAuthMode;
    }
  }
});

test('log-doctor fix route rejects invalid payloads before proxying', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalAuthMode = process.env.MATMETRICS_AUTH_TEST_MODE;

  let fetchCount = 0;
  process.env.GITHUB_TOKEN = 'ghs_test_token';
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

  global.fetch = async () => {
    fetchCount += 1;
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const missingOwner = await POST(
      buildRequest({
        owner: ' ',
        repo: 'matmetrics',
        paths: ['data/2026/03/a.md'],
      })
    );
    assert.equal(missingOwner.status, 400);
    assert.deepEqual(await missingOwner.json(), {
      success: false,
      message: 'Missing owner or repo',
    });

    const emptyBranch = await POST(
      buildRequest({
        owner: 'octocat',
        repo: 'matmetrics',
        branch: '  ',
        paths: ['data/2026/03/a.md'],
      })
    );
    assert.equal(emptyBranch.status, 400);
    assert.deepEqual(await emptyBranch.json(), {
      success: false,
      message: 'Branch cannot be empty when provided',
    });

    const noSafePaths = await POST(
      buildRequest({
        owner: 'octocat',
        repo: 'matmetrics',
        paths: ['../secrets.md', '/data/2026/03/a.md'],
      })
    );
    assert.equal(noSafePaths.status, 400);
    assert.deepEqual(await noSafePaths.json(), {
      success: false,
      message: 'At least one file path must be selected',
    });

    const applyWithoutConfirm = await POST(
      buildRequest({
        owner: 'octocat',
        repo: 'matmetrics',
        mode: 'apply',
        paths: ['data/2026/03/a.md'],
        confirmApply: false,
      })
    );
    assert.equal(applyWithoutConfirm.status, 400);
    assert.deepEqual(await applyWithoutConfirm.json(), {
      success: false,
      message: 'Apply mode requires explicit confirmation from the UI',
    });

    assert.equal(fetchCount, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    if (originalAuthMode === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = originalAuthMode;
    }
  }
});

test('log-doctor fix route maps malformed proxy base URL to a configuration-specific 500 message', async () => {
  const response = buildLogDoctorFixErrorResponse(
    new Error(INVALID_PROXY_ERROR)
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    message:
      'Log-doctor fix failed: MATMETRICS_GO_PROXY_BASE_URL is invalid. This is a server configuration issue; update the proxy base URL to an absolute URL such as https://host:port.',
  });
});
