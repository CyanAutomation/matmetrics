import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { buildLogDoctorErrorResponse } from './error-response';

const INVALID_PROXY_ERROR =
  'Invalid MATMETRICS_GO_PROXY_BASE_URL; expected absolute URL such as https://host:port';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/github/log-doctor', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('log-doctor route queues a scan and trims owner/repo/branch', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalAuthMode = process.env.MATMETRICS_AUTH_TEST_MODE;

  let fetchCall: { url: string; body: string | undefined } | undefined;

  process.env.GITHUB_TOKEN = 'ghs_test_token';
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';
  process.env.CLOUDFLARE_DATA_WORKER_URL = 'https://worker.example';
  process.env.MATMETRICS_INTERNAL_API_SECRET = 'worker-secret';

  global.fetch = async (input, init) => {
    fetchCall = {
      url: typeof input === 'string' ? input : input.toString(),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };

    return new Response(
      JSON.stringify({
        id: '00000000-0000-4000-8000-000000000001',
        type: 'log-doctor-scan',
        status: 'queued',
        attempts: 0,
        createdAt: '2026-09-16T00:00:00.000Z',
        updatedAt: '2026-09-16T00:00:00.000Z',
      }),
      {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }
    );
  };

  try {
    const response = await POST(
      buildRequest({
        owner: '  octocat  ',
        repo: '  matmetrics  ',
        branch: '  main  ',
      })
    );

    assert.equal(response.status, 202);
    assert.ok(fetchCall);
    assert.equal(fetchCall?.url, 'https://worker.example/v1/background-jobs');
    assert.deepEqual(JSON.parse(fetchCall?.body ?? '{}'), {
      type: 'log-doctor-scan',
      config: { owner: 'octocat', repo: 'matmetrics', branch: 'main' },
    });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    delete process.env.CLOUDFLARE_DATA_WORKER_URL;
    delete process.env.MATMETRICS_INTERNAL_API_SECRET;
    if (originalAuthMode === undefined) {
      delete process.env.MATMETRICS_AUTH_TEST_MODE;
    } else {
      process.env.MATMETRICS_AUTH_TEST_MODE = originalAuthMode;
    }
  }
});

test('log-doctor route rejects invalid body before proxying', async () => {
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
    const missingOwnerOrRepo = await POST(
      buildRequest({ owner: ' ', repo: 'matmetrics' })
    );
    assert.equal(missingOwnerOrRepo.status, 400);
    assert.deepEqual(await missingOwnerOrRepo.json(), {
      success: false,
      message: 'Missing owner or repo',
    });

    const emptyBranch = await POST(
      buildRequest({ owner: 'octocat', repo: 'matmetrics', branch: '   ' })
    );
    assert.equal(emptyBranch.status, 400);
    assert.deepEqual(await emptyBranch.json(), {
      success: false,
      message: 'Branch cannot be empty when provided',
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

test('log-doctor route reports an unavailable queue configuration', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalAuthMode = process.env.MATMETRICS_AUTH_TEST_MODE;

  process.env.GITHUB_TOKEN = 'ghs_test_token';
  process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

  global.fetch = async () => {
    throw new Error('must not fetch');
  };

  try {
    const response = await POST(
      buildRequest({ owner: 'octocat', repo: 'matmetrics', branch: 'main' })
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      message: 'Background jobs are not configured',
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

test('log-doctor route maps malformed proxy base URL to a configuration-specific 500 message', async () => {
  const response = buildLogDoctorErrorResponse(new Error(INVALID_PROXY_ERROR));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    message:
      'Log diagnosis failed: MATMETRICS_GO_PROXY_BASE_URL is invalid. This is a server configuration issue; update the proxy base URL to an absolute URL such as https://host:port.',
  });
});
