import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { type Env } from './index';

const INTERNAL_SECRET = 'worker-integration-secret';

type TestJob = {
  id: string;
  user_id: string;
  type: 'log-doctor-scan' | 'github-health';
  status: 'queued' | 'running' | 'completed' | 'failed';
  payload_json: string;
  result_json: string | null;
  error_message: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
};

class WorkerTestDatabase {
  readonly jobs = new Map<string, TestJob>();

  prepare(sql: string) {
    return {
      bind: (...params: unknown[]) => ({
        first: async <T>() => {
          if (sql.includes('FROM user_preferences')) return null;
          if (sql.includes('FROM background_jobs')) {
            return (this.jobs.get(String(params.at(-1))) ?? null) as T | null;
          }
          return null;
        },
        all: async <T>() => ({ results: [] as T[] }),
        run: async () => {
          if (sql.includes('INSERT INTO background_jobs')) {
            const job: TestJob = {
              id: params[0] as string,
              user_id: params[1] as string,
              type: params[2] as TestJob['type'],
              status: params[3] as TestJob['status'],
              payload_json: params[4] as string,
              result_json: null,
              error_message: null,
              attempts: params[5] as number,
              created_at: params[6] as number,
              updated_at: params[7] as number,
            };
            this.jobs.set(job.id, job);
            return { success: true };
          }
          if (sql.includes('UPDATE background_jobs')) {
            const job = this.jobs.get(String(params.at(-1)));
            if (!job) return { success: false };

            let index = 0;
            job.status = params[index++] as TestJob['status'];
            if (sql.includes('result_json = ?')) {
              job.result_json = params[index++] as string;
            }
            if (sql.includes('error_message = ?')) {
              job.error_message = params[index++] as string;
            } else if (sql.includes('error_message = NULL')) {
              job.error_message = null;
            }
            if (sql.includes('attempts = ?')) {
              job.attempts = params[index++] as number;
            }
            job.updated_at = params[index] as number;
            return { success: true };
          }
          return { success: true };
        },
      }),
    };
  }
}

class WorkerTestQueue {
  readonly messages: Array<{ id: string }> = [];

  async send(message: { id: string }): Promise<void> {
    this.messages.push(message);
  }
}

function createEnv(database = new WorkerTestDatabase()) {
  const queue = new WorkerTestQueue();
  const env = {
    DB: database,
    BACKGROUND_JOBS: queue,
    MATMETRICS_INTERNAL_API_SECRET: INTERNAL_SECRET,
    MATMETRICS_BACKGROUND_EXECUTOR_URL: 'https://executor.example.test',
    MATMETRICS_BACKGROUND_EXECUTOR_SECRET: 'executor-secret',
  } as unknown as Env;
  return { env, database, queue };
}

function makeJob(overrides: Partial<TestJob> = {}): TestJob {
  return {
    id: 'job-runtime-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"dojo","repo":"matmetrics"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    ...overrides,
  };
}

async function signedHeaders(
  method: string,
  path: string,
  body: string
): Promise<Headers> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const encoder = new TextEncoder();
  const bodyHash = [...new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(body))
  )]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(INTERNAL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = [...new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`v1.${timestamp}.${method}.${path}.${bodyHash}`)
    )
  )]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

  return new Headers({
    Authorization: `Bearer ${signature}`,
    'X-Matmetrics-Timestamp': timestamp,
    'X-Matmetrics-User-Id': 'user-1',
  });
}

test('worker.fetch rejects requests with no signed identity before touching storage', async () => {
  const { env, database } = createEnv();
  const response = await worker.fetch(
    new Request('https://worker.example.test/v1/preferences'),
    env
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  assert.equal(database.jobs.size, 0);
});

test('worker.fetch routes a signed preferences read through the production handler', async () => {
  const { env } = createEnv();
  const headers = await signedHeaders('GET', '/v1/preferences', '');
  const response = await worker.fetch(
    new Request('https://worker.example.test/v1/preferences', { headers }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { preferences: null, revision: 0 });
});

test('worker.fetch validates signed job creation payloads before enqueueing', async () => {
  const { env, queue } = createEnv();
  const path = '/v1/background-jobs';
  const body = '{';
  const headers = await signedHeaders('POST', path, body);
  const response = await worker.fetch(
    new Request(`https://worker.example.test${path}`, {
      method: 'POST',
      headers,
      body,
    }),
    env
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Invalid background job payload',
  });
  assert.deepEqual(queue.messages, []);
});

test('worker.fetch queues valid signed job payloads and returns the stored job', async () => {
  const { env, queue } = createEnv();
  const path = '/v1/background-jobs';
  const body = JSON.stringify({
    type: 'github-health',
    config: { owner: ' dojo ', repo: ' matmetrics ' },
  });
  const headers = await signedHeaders('POST', path, body);
  const response = await worker.fetch(
    new Request(`https://worker.example.test${path}`, {
      method: 'POST',
      headers,
      body,
    }),
    env
  );
  const payload = (await response.json()) as {
    id: string;
    type: string;
    status: string;
    attempts: number;
    createdAt: string;
    updatedAt: string;
  };

  assert.equal(response.status, 202);
  assert.equal(payload.type, 'github-health');
  assert.equal(payload.status, 'queued');
  assert.equal(payload.attempts, 0);
  assert.match(payload.createdAt, /^\d{4}-\d\d-\d\dT/);
  assert.match(payload.updatedAt, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(queue.messages, [{ id: payload.id }]);
});

test('worker.fetch persists signed plugin override updates', async () => {
  const { env } = createEnv();
  const path = '/v1/plugin-overrides';
  const body = JSON.stringify({ pluginId: 'github-sync', enabled: false });
  const headers = await signedHeaders('PUT', path, body);
  const response = await worker.fetch(
    new Request(`https://worker.example.test${path}`, {
      method: 'PUT',
      headers,
      body,
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { persisted: true });
});

test('worker.queue runs the production job flow and acknowledges a successful result', async () => {
  const { env, database } = createEnv();
  database.jobs.set('job-runtime-1', makeJob());
  const message = {
    body: { id: 'job-runtime-1' },
    ackCount: 0,
    retryCount: 0,
    ack() {
      this.ackCount += 1;
    },
    retry() {
      this.retryCount += 1;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      'https://executor.example.test/api/internal/background-jobs/execute'
    );
    assert.equal(init?.method, 'POST');
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer executor-secret'
    );
    return new Response('{"result":"complete"}', { status: 200 });
  };

  try {
    await worker.queue({ messages: [message] } as never, env);

    assert.equal(message.ackCount, 1);
    assert.equal(message.retryCount, 0);
    assert.equal(database.jobs.get('job-runtime-1')?.status, 'completed');
    assert.equal(database.jobs.get('job-runtime-1')?.attempts, 1);
    assert.equal(
      database.jobs.get('job-runtime-1')?.result_json,
      '{"result":"complete"}'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker.queue retries executor failures and records the retry state', async () => {
  const { env, database } = createEnv();
  database.jobs.set('job-runtime-1', makeJob());
  const message = {
    body: { id: 'job-runtime-1' },
    ackCount: 0,
    retryCount: 0,
    ack() {
      this.ackCount += 1;
    },
    retry() {
      this.retryCount += 1;
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('temporarily unavailable', { status: 503 });

  try {
    await worker.queue({ messages: [message] } as never, env);

    assert.equal(message.ackCount, 0);
    assert.equal(message.retryCount, 1);
    assert.equal(database.jobs.get('job-runtime-1')?.status, 'queued');
    assert.equal(database.jobs.get('job-runtime-1')?.attempts, 1);
    assert.match(
      database.jobs.get('job-runtime-1')?.error_message ?? '',
      /Executor returned 503/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
