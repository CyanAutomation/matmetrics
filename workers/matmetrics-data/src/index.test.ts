import assert from 'node:assert/strict';
import test from 'node:test';
/**
 * Test suite for matmetrics-data worker (Cloudflare Durable Objects + D1 Database)
 *
 * Mocking strategy:
 * - D1Database: Mock with in-memory result sets
 * - Queue<{id: string}>: Mock with message tracking
 * - Message: Mock with ack() and retry() methods
 * - Env: Mock all required environment variables and services
 */

// ============================================================================
// TYPE DEFINITIONS (mirrored from index.ts)
// ============================================================================

type JobType = 'log-doctor-scan' | 'github-health';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface JobPayload {
  type: JobType;
  config: { owner: string; repo: string; branch?: string };
}

interface StoredJob {
  id: string;
  user_id: string;
  type: JobType;
  status: JobStatus;
  payload_json: string;
  result_json: string | null;
  error_message: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// MOCKS & TEST HELPERS
// ============================================================================

interface MockD1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: { duration: number };
}

class MockD1Database {
  private data: Map<string, StoredJob> = new Map();

  prepare(sql: string) {
    return {
      bind: (...params: unknown[]) => ({
        run: async () => this.executeRun(sql, params),
        first: async <T = unknown>() => this.executeFirst<T>(sql, params),
        all: async <T = unknown>() => this.executeAll<T>(sql, params),
      }),
    };
  }

  private async executeRun(sql: string, params: unknown[]): Promise<MockD1Result> {
    if (sql.includes('INSERT INTO background_jobs')) {
      const id = params[0] as string;
      const job: StoredJob = {
        id,
        user_id: params[1] as string,
        type: params[2] as JobType,
        status: params[3] as JobStatus,
        payload_json: params[4] as string,
        result_json: null,
        error_message: null,
        attempts: params[5] as number,
        created_at: params[6] as number,
        updated_at: params[7] as number,
      };
      this.data.set(id, job);
      return { success: true };
    }

    if (sql.includes('UPDATE background_jobs')) {
      // Extract WHERE id = ? from the end
      const idMatch = params[params.length - 1];
      const job = this.data.get(idMatch as string);
      if (!job) return { success: false };

      // Parse the UPDATE clause based on status value
      const status = params[0] as JobStatus;
      job.status = status;
      job.updated_at = params[params.length - 2] as number;

      // Handle status-specific updates
      if (status === 'running') {
        job.attempts = params[1] as number;
        job.error_message = null;
      } else if (status === 'completed') {
        job.result_json = params[1] as string;
        job.error_message = null;
      } else if (status === 'failed' || status === 'queued') {
        job.error_message = params[1] as string;
      }

      return { success: true };
    }

    return { success: false };
  }

  private async executeFirst<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('SELECT') && sql.includes('FROM background_jobs')) {
      const id = params[params.length - 1] as string;
      const job = this.data.get(id);
      return (job as T) || null;
    }
    return null;
  }

  private async executeAll<T>(sql: string, params: unknown[]): Promise<MockD1Result<T>> {
    if (sql.includes('SELECT') && sql.includes('FROM plugin_enabled_overrides')) {
      // Return empty results for overrides (no setup needed in basic tests)
      return { results: [], success: true };
    }
    return { results: [], success: true };
  }

  // Helper to inject test data
  _setJob(job: StoredJob) {
    this.data.set(job.id, job);
  }

  _getJob(id: string): StoredJob | undefined {
    return this.data.get(id);
  }
}

class MockQueue<T> {
  private messages: T[] = [];

  async send(message: T) {
    this.messages.push(message);
  }

  _getMessages(): T[] {
    return this.messages;
  }

  _reset() {
    this.messages = [];
  }
}

// ============================================================================
// HELPER FUNCTIONS TO TEST (extracted from main worker)
// ============================================================================

/**
 * Safely parses JSON with consistent error handling and context logging.
 * @returns Parsed object or null if invalid
 */
function safeParseJSON<T>(input: string, context: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    console.error(`[safeParseJSON] Failed to parse ${context}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Updates background job status in the database.
 * Consolidates duplicate UPDATE patterns.
 */
async function updateJobStatus(
  db: MockD1Database,
  jobId: string,
  status: JobStatus,
  options?: {
    errorMessage?: string;
    resultJson?: string;
    attempts?: number;
  },
): Promise<boolean> {
  const timestamp = Date.now();
  const params: unknown[] = [status];

  let sql = 'UPDATE background_jobs SET status = ?';

  if (options?.resultJson !== undefined) {
    sql += ', result_json = ?';
    params.push(options.resultJson);
  }

  if (options?.errorMessage !== undefined) {
    sql += ', error_message = ?';
    params.push(options.errorMessage);
  } else if (status === 'running' || status === 'completed') {
    sql += ', error_message = NULL';
  }

  if (options?.attempts !== undefined) {
    sql += ', attempts = ?';
    params.push(options.attempts);
  }

  sql += ', updated_at = ? WHERE id = ?';
  params.push(timestamp, jobId);

  const result = await (db as any).prepare(sql).bind(...params).run();
  return result.success;
}

// ============================================================================
// TEST SUITE
// ============================================================================

test('safeParseJSON helper - parses valid JSON', () => {
  const payload = { type: 'log-doctor-scan', config: { owner: 'test' } };
  const result = safeParseJSON(JSON.stringify(payload), 'test-payload');
  assert.deepEqual(result, payload);
});

test('safeParseJSON helper - returns null for invalid JSON', () => {
  const result = safeParseJSON('{ invalid json', 'bad-json');
  assert.strictEqual(result, null);
});

test('safeParseJSON helper - returns null for empty string', () => {
  const result = safeParseJSON('', 'empty');
  assert.strictEqual(result, null);
});

test('safeParseJSON helper - parses and type-casts correctly', () => {
  const result = safeParseJSON<{ value: number }>('{"value": 42}', 'number');
  assert.strictEqual(result?.value, 42);
});

test('safeParseJSON helper - handles number types', () => {
  const result = safeParseJSON<{ count: number }>('{"count": 123}', 'count');
  assert.strictEqual(result?.count, 123);
});

test('safeParseJSON helper - handles boolean types', () => {
  const result = safeParseJSON<{ active: boolean }>('{"active": true}', 'active');
  assert.strictEqual(result?.active, true);
});

test('safeParseJSON helper - handles array types', () => {
  const result = safeParseJSON<{ items: string[] }>('{"items": ["a", "b"]}', 'items');
  assert.deepEqual(result?.items, ['a', 'b']);
});

test('updateJobStatus helper - updates job status without error message', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  const success = await updateJobStatus(db, 'job-1', 'running', {
    attempts: 1,
  });
  assert.strictEqual(success, true);
  const updated = db._getJob('job-1');
  assert.strictEqual(updated?.status, 'running');
  assert.strictEqual(updated?.attempts, 1);
});

test('updateJobStatus helper - updates job status with error message', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-2',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  const success = await updateJobStatus(db, 'job-2', 'failed', {
    errorMessage: 'Executor returned 500',
  });
  assert.strictEqual(success, true);
  const updated = db._getJob('job-2');
  assert.strictEqual(updated?.status, 'failed');
  assert.strictEqual(updated?.error_message, 'Executor returned 500');
});

test('updateJobStatus helper - updates job status with result JSON', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-3',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  const resultJson = '{"issues": []}';
  const success = await updateJobStatus(db, 'job-3', 'completed', {
    resultJson,
  });
  assert.strictEqual(success, true);
  const updated = db._getJob('job-3');
  assert.strictEqual(updated?.status, 'completed');
  assert.strictEqual(updated?.result_json, resultJson);
});

test('updateJobStatus helper - returns false for non-existent job', async () => {
  const db = new MockD1Database();
  const success = await updateJobStatus(db, 'non-existent', 'failed', {
    errorMessage: 'Job not found',
  });
  assert.strictEqual(success, false);
});

test('updateJobStatus helper - clears error message when transitioning to running', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-4',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: 'Previous error',
    attempts: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  await updateJobStatus(db, 'job-4', 'running', { attempts: 1 });
  const updated = db._getJob('job-4');
  assert.strictEqual(updated?.error_message, null);
});

test('updateJobStatus helper - supports multiple options simultaneously', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-5',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  const success = await updateJobStatus(db, 'job-5', 'completed', {
    resultJson: '{"success": true}',
    attempts: 1,
  });
  assert.strictEqual(success, true);
  const updated = db._getJob('job-5');
  assert.strictEqual(updated?.status, 'completed');
  assert.strictEqual(updated?.result_json, '{"success": true}');
});

test('updateJobStatus helper - updates to queued with error message for retry', async () => {
  const db = new MockD1Database();
  const job: StoredJob = {
    id: 'job-6',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  db._setJob(job);

  const success = await updateJobStatus(db, 'job-6', 'queued', {
    errorMessage: 'Temporary failure, will retry',
  });
  assert.strictEqual(success, true);
  const updated = db._getJob('job-6');
  assert.strictEqual(updated?.status, 'queued');
  assert.strictEqual(updated?.error_message, 'Temporary failure, will retry');
});
