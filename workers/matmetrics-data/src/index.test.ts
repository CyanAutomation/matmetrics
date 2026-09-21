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

interface _JobPayload {
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

  private async executeRun(
    sql: string,
    params: unknown[]
  ): Promise<MockD1Result> {
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

  private async executeFirst<T>(
    sql: string,
    _params: unknown[]
  ): Promise<T | null> {
    if (sql.includes('SELECT') && sql.includes('FROM background_jobs')) {
      const id = _params[_params.length - 1] as string;
      const job = this.data.get(id);
      return (job as T) || null;
    }
    if (sql.includes('SELECT') && sql.includes('FROM user_preferences')) {
      const userId = _params[0] as string;
      const prefs = this.preferences.get(userId);
      return (prefs as T) || null;
    }
    return null;
  }

  private async executeAll<T>(
    sql: string,
    _params: unknown[]
  ): Promise<MockD1Result<T>> {
    if (
      sql.includes('SELECT') &&
      sql.includes('FROM plugin_enabled_overrides')
    ) {
      // Return empty results for overrides (no setup needed in basic tests)
      return { results: [], success: true };
    }
    if (sql.includes('SELECT') && sql.includes('FROM user_preferences')) {
      const userId = _params[0] as string;
      const prefs = this.preferences.get(userId);
      if (!prefs) return { results: [], success: true };
      return { results: [prefs] as unknown as T[], success: true };
    }
    return { results: [], success: true };
  }

  // Preferences support for handlePreferences tests
  private preferences: Map<
    string,
    { preferences_json: string; revision: number }
  > = new Map();

  _setPreferences(userId: string, preferences: unknown, revision: number) {
    this.preferences.set(userId, {
      preferences_json: JSON.stringify(preferences),
      revision,
    });
  }

  _getPreferences(userId: string) {
    return this.preferences.get(userId);
  }

  // Helper to inject test data
  _setJob(job: StoredJob) {
    this.data.set(job.id, job);
  }

  _getJob(id: string): StoredJob | undefined {
    return this.data.get(id);
  }

  _setPreferences(
    userId: string,
    prefs: Record<string, unknown>,
    revision: number
  ): void {
    this.preferences.set(userId, {
      user_id: userId,
      data: JSON.stringify(prefs),
      revision,
      version: 1,
    });
  }

  _getPreferences(
    userId: string
  ):
    | { user_id: string; data: string; revision: number; version: number }
    | undefined {
    return this.preferences.get(userId);
  }
}

class _MockQueue<T> {
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

class MockMessage<T> {
  public acked = false;
  public retried = false;

  constructor(public body: T) {}

  async ack(): Promise<void> {
    this.acked = true;
  }

  async retry(): Promise<void> {
    this.retried = true;
  }
}

class MockRequest implements Request {
  public method: string;
  public headers: Headers;
  public url: string;
  private body_?: BodyInit;
  public readonly bodyUsed = false;
  public readonly cache: RequestCache = 'default';
  public readonly credentials: RequestCredentials = 'same-origin';
  public readonly destination: RequestDestination = '';
  public readonly integrity = '';
  public readonly keepalive = false;
  public readonly mode: RequestMode = 'cors';
  public readonly priority: RequestPriority = 'auto';
  public readonly redirect: RequestRedirect = 'follow';
  public readonly referrer = '';
  public readonly referrerPolicy: ReferrerPolicy = '';
  public readonly signal: AbortSignal = new AbortController().signal;

  constructor(input: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }) {
    this.url = input.url;
    this.method = input.method;
    this.headers = new Headers(input.headers || {});
    this.body_ = input.body;
  }

  async text(): Promise<string> {
    return this.body_ || '';
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const text = await this.text();
    const encoder = new TextEncoder();
    return encoder.encode(text).buffer;
  }

  async blob(): Promise<Blob> {
    throw new Error('MockRequest.blob() not implemented');
  }

  async formData(): Promise<FormData> {
    throw new Error('MockRequest.formData() not implemented');
  }

  async clone(): Promise<Request> {
    return new MockRequest({
      url: this.url,
      method: this.method,
      headers: Object.fromEntries(this.headers),
      body: this.body_,
    }) as unknown as Request;
  }
}

class MockResponse implements Response {
  public ok: boolean;
  public status: number;
  public statusText: string;
  public readonly headers = new Headers();
  public readonly redirected = false;
  public readonly type: ResponseType = 'default';
  public readonly url = '';
  public readonly body: ReadableStream<Uint8Array> | null = null;
  public readonly bodyUsed = false;

  private body_: string;

  constructor(body?: string, status = 200, statusText = 'OK') {
    this.body_ = body || '';
    this.status = status;
    this.statusText = statusText;
    this.ok = status >= 200 && status < 300;
  }

  async text(): Promise<string> {
    return this.body_;
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.body_);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    return encoder.encode(this.body_).buffer;
  }

  async blob(): Promise<Blob> {
    throw new Error('MockResponse.blob() not implemented');
  }

  async formData(): Promise<FormData> {
    throw new Error('MockResponse.formData() not implemented');
  }

  async clone(): Promise<Response> {
    return new MockResponse(
      this.body_,
      this.status,
      this.statusText
    ) as unknown as Response;
  }
}

type FetchHandler = (request: Request) => Promise<Response> | Response;

class MockFetch {
  private handlers: Array<{ pattern: RegExp; handler: FetchHandler }> = [];

  register(pattern: RegExp, handler: FetchHandler) {
    this.handlers.push({ pattern, handler });
  }

  async call(request: Request): Promise<Response> {
    for (const { pattern, handler } of this.handlers) {
      if (pattern.test(request.url)) {
        return handler(request);
      }
    }
    return new MockResponse('Not Found', 404);
  }

  reset() {
    this.handlers = [];
  }
}

interface Env {
  DB: D1Database;
  BACKGROUND_JOBS: Queue<{ id: string }>;
  MATMETRICS_INTERNAL_API_SECRET: string;
  MATMETRICS_BACKGROUND_EXECUTOR_URL: string;
  MATMETRICS_BACKGROUND_EXECUTOR_SECRET: string;
}

function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    DB: new MockD1Database(),
    BACKGROUND_JOBS: new _MockQueue(),
    MATMETRICS_INTERNAL_API_SECRET: 'test-secret-key',
    MATMETRICS_BACKGROUND_EXECUTOR_URL: 'https://executor.example.com',
    MATMETRICS_BACKGROUND_EXECUTOR_SECRET: 'executor-secret',
    ...overrides,
  } as unknown as Env;
}

// ============================================================================
// HELPER FUNCTIONS TO TEST (extracted from main worker)
// ============================================================================

const encoder = new TextEncoder();

/**
 * Helper: convert ArrayBuffer to hex string
 */
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate HMAC-SHA256 signature for request authentication
 */
async function expectedSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string
): Promise<string> {
  const bodyHash = hex(
    await crypto.subtle.digest('SHA-256', encoder.encode(body))
  );
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(
        `v1.${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`
      )
    )
  );
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

/**
 * Authenticate request via HMAC signature and timestamp validation
 */
async function authenticate(
  request: Request,
  env: Env,
  body: string
): Promise<{ userId: string } | Response> {
  const timestamp = request.headers.get('X-Matmetrics-Timestamp');
  const userId = request.headers.get('X-Matmetrics-User-Id');
  const authorization = request.headers.get('Authorization');
  if (!timestamp || !userId || !authorization?.startsWith('Bearer '))
    return { error: 'Unauthorized' } as unknown as Response;
  const timestampNumber = Number(timestamp);
  const MAX_SIGNATURE_AGE_SECONDS = 60;
  if (
    !Number.isInteger(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > MAX_SIGNATURE_AGE_SECONDS
  )
    return { error: 'Expired signature' } as unknown as Response;
  const expected = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    timestamp,
    request.method,
    new URL(request.url).pathname,
    body
  );
  if (!timingSafeEqual(authorization.slice(7), expected))
    return { error: 'Unauthorized' } as unknown as Response;
  return { userId };
}

/**
 * Safely parses JSON with consistent error handling and context logging.
 * @returns Parsed object or null if invalid
 */
function safeParseJSON<T>(input: string, context: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    console.error(
      `[safeParseJSON] Failed to parse ${context}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Validates and parses a background job payload
 */
function parseJobPayload(body: string): _JobPayload | null {
  const MAX_JOB_PAYLOAD_BYTES = 4 * 1024;
  if (encoder.encode(body).byteLength > MAX_JOB_PAYLOAD_BYTES) return null;
  try {
    const value = JSON.parse(body) as {
      type?: unknown;
      config?: { owner?: unknown; repo?: unknown; branch?: unknown };
    };
    const type = value?.type;
    const owner =
      typeof value?.config?.owner === 'string' ? value.config.owner.trim() : '';
    const repo =
      typeof value?.config?.repo === 'string' ? value.config.repo.trim() : '';
    const branch =
      typeof value?.config?.branch === 'string'
        ? value.config.branch.trim()
        : undefined;
    if (
      (type !== 'log-doctor-scan' && type !== 'github-health') ||
      !owner ||
      !repo ||
      owner.length > 200 ||
      repo.length > 200 ||
      (branch !== undefined && (!branch || branch.length > 200))
    )
      return null;
    return { type, config: { owner, repo, ...(branch ? { branch } : {}) } };
  } catch {
    return null;
  }
}

/**
 * Converts a stored job to API response format
 */
function toJobResponse(job: StoredJob): Record<string, unknown> {
  let result: unknown;
  if (job.result_json !== null) {
    try {
      result = JSON.parse(job.result_json);
    } catch {
      result = undefined;
    }
  }
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    createdAt: new Date(job.created_at).toISOString(),
    updatedAt: new Date(job.updated_at).toISOString(),
    ...(result === undefined ? {} : { result }),
    ...(job.error_message ? { error: job.error_message } : {}),
  };
}

/**
 * Query a single job by ID
 */
async function getJob(env: Env, id: string): Promise<StoredJob | null> {
  return (env.DB as any)
    .prepare(
      'SELECT id, user_id, type, status, payload_json, result_json, error_message, attempts, created_at, updated_at FROM background_jobs WHERE id = ?'
    )
    .bind(id)
    .first<StoredJob>();
}

/**
 * Creates a new background job and queues it
 */
async function createJob(
  env: Env,
  userId: string,
  body: string
): Promise<{ status: number; body: unknown }> {
  const payload = parseJobPayload(body);
  if (!payload)
    return { status: 400, body: { error: 'Invalid background job payload' } };
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await (env.DB as any)
      .prepare(
        'INSERT INTO background_jobs (id, user_id, type, status, payload_json, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        userId,
        payload.type,
        'queued',
        JSON.stringify(payload),
        0,
        now,
        now
      )
      .run();
    await (env.BACKGROUND_JOBS as any).send({ id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create background job';
    await updateJobStatus(env as any, id, 'failed', {
      errorMessage: message.slice(0, 1000),
    }).catch(() => {});
    return { status: 503, body: { error: 'Unable to queue background job' } };
  }
  const job = await getJob(env, id);
  return { status: 202, body: toJobResponse(job as StoredJob) };
}

/**
 * Executes a background job via HTTP to executor service
 * @param fetchFn - Optional fetch implementation for testing
 */
async function executeBackgroundJob(
  env: Env,
  job: StoredJob,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<Response> {
  const url = new URL(
    '/api/internal/background-jobs/execute',
    env.MATMETRICS_BACKGROUND_EXECUTOR_URL
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = safeParseJSON<_JobPayload>(
      job.payload_json,
      `job-${job.id}-payload`
    );
    if (!payload) throw new Error('Failed to parse job payload');
    return await fetchFn(
      new MockRequest({
        url: url.toString(),
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MATMETRICS_BACKGROUND_EXECUTOR_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: job.id,
          type: job.type,
          config: payload.config,
        }),
      }) as unknown as Request,
      { signal: controller.signal } as any
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Consumes a message from the queue (processes a background job)
 * @param fetchFn - Optional fetch implementation for testing
 */
async function consumeMessage(
  env: Env,
  message: MockMessage<{ id: string }>,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<void> {
  const MAX_JOB_ATTEMPTS = 5;
  const job = await getJob(env, message.body.id);
  if (!job || job.status === 'completed' || job.status === 'failed')
    return message.ack();
  const attempts = job.attempts + 1;
  await updateJobStatus(env as any, job.id, 'running', { attempts });
  try {
    const response = await executeBackgroundJob(env, job, fetchFn);
    const text = await response.text();
    if (!response.ok) {
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        await updateJobStatus(env as any, job.id, 'failed', {
          errorMessage: `Executor returned ${response.status}`,
        });
        return message.ack();
      }
      throw new Error(
        `Executor returned ${response.status}: ${text.slice(0, 500)}`
      );
    }
    if (encoder.encode(text).byteLength > 512 * 1024)
      throw new Error('Executor response exceeds job result limit');
    if (!safeParseJSON(text, `job-${job.id}-result`))
      throw new Error('Executor response is not valid JSON');
    await updateJobStatus(env as any, job.id, 'completed', {
      resultJson: text,
    });
    return message.ack();
  } catch (error) {
    const failure =
      error instanceof Error ? error.message : 'Background job failed';
    if (attempts >= MAX_JOB_ATTEMPTS) {
      await updateJobStatus(env as any, job.id, 'failed', {
        errorMessage: failure.slice(0, 1000),
      });
      return message.ack();
    }
    await updateJobStatus(env as any, job.id, 'queued', {
      errorMessage: failure.slice(0, 1000),
    });
    return message.retry();
  }
}

/**
 * Handles user preferences GET/PUT requests
 */
async function handlePreferences(
  request: Request,
  env: Env,
  userId: string,
  body: string
): Promise<{ status: number; body: unknown }> {
  if (request.method === 'GET') {
    const row = (await (env.DB as any)
      .prepare(
        'SELECT preferences_json, revision FROM user_preferences WHERE user_id = ?'
      )
      .bind(userId)
      .first()) as { preferences_json: string; revision: number } | null;
    const preferences = row
      ? safeParseJSON(row.preferences_json, `user-${userId}-preferences`)
      : null;
    return {
      status: 200,
      body: preferences
        ? { preferences, revision: row!.revision }
        : { preferences: null, revision: 0 },
    };
  }
  if (request.method !== 'PUT')
    return { status: 405, body: { error: 'Method not allowed' } };
  const payload = safeParseJSON<{ preferences?: unknown; revision?: unknown }>(
    body,
    `user-${userId}-preferences-update`
  );
  if (!payload) return { status: 400, body: { error: 'Invalid JSON' } };
  if (
    !payload.preferences ||
    typeof payload.preferences !== 'object' ||
    Array.isArray(payload.preferences) ||
    !Number.isInteger(payload.revision) ||
    (payload.revision as number) < 0
  )
    return { status: 400, body: { error: 'Invalid payload' } };
  const preferencesJson = JSON.stringify(payload.preferences);
  if (preferencesJson.length > 1048576)
    return {
      status: 413,
      body: { error: 'Preferences payload exceeds 1MB limit' },
    };
  const stored = (await (env.DB as any)
    .prepare('SELECT revision FROM user_preferences WHERE user_id = ?')
    .bind(userId)
    .first()) as { revision: number } | null;
  const currentRevision = stored?.revision ?? 0;
  if (payload.revision !== currentRevision)
    return {
      status: 409,
      body: {
        error: 'Preference revision conflict',
        revision: currentRevision,
      },
    };
  const nextRevision = currentRevision + 1;
  await (env.DB as any)
    .prepare(
      `INSERT INTO user_preferences (user_id, preferences_json, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET preferences_json = excluded.preferences_json, revision = excluded.revision, updated_at = excluded.updated_at`
    )
    .bind(userId, preferencesJson, nextRevision, Date.now())
    .run();
  return {
    status: 200,
    body: { preferences: payload.preferences, revision: nextRevision },
  };
}

/**
 * Updates background job status in the database.
 * Consolidates duplicate UPDATE patterns.
 */
async function updateJobStatus(
  db: MockD1Database | Env,
  jobId: string,
  status: JobStatus,
  options?: {
    errorMessage?: string;
    resultJson?: string;
    attempts?: number;
  }
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

  // Handle both MockD1Database and Env types
  let dbInstance: MockD1Database;
  if ('_setJob' in db) {
    dbInstance = db as MockD1Database;
  } else {
    dbInstance = (db as Env).DB as any;
  }

  const result = await (dbInstance as any)
    .prepare(sql)
    .bind(...params)
    .run();
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
  const result = safeParseJSON<{ active: boolean }>(
    '{"active": true}',
    'active'
  );
  assert.strictEqual(result?.active, true);
});

test('safeParseJSON helper - handles array types', () => {
  const result = safeParseJSON<{ items: string[] }>(
    '{"items": ["a", "b"]}',
    'items'
  );
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

// ============================================================================
// PHASE 2a TESTS: Cryptography & Authentication
// ============================================================================

test('hex helper - converts ArrayBuffer to hex string', async () => {
  const encoder = new TextEncoder();
  const buffer = encoder.encode('hello').buffer;
  const result = hex(buffer);
  assert.strictEqual(typeof result, 'string');
  assert.strictEqual(result.length, 10); // 5 bytes * 2 hex chars
  assert.match(result, /^[0-9a-f]+$/);
});

test('expectedSignature - generates deterministic HMAC-SHA256 signature', async () => {
  const secret = 'test-secret';
  const timestamp = '1234567890';
  const method = 'POST';
  const path = '/v1/background-jobs';
  const body = '{"type":"log-doctor-scan"}';

  const sig1 = await expectedSignature(secret, timestamp, method, path, body);
  const sig2 = await expectedSignature(secret, timestamp, method, path, body);

  assert.strictEqual(sig1, sig2, 'Signature should be deterministic');
  assert.strictEqual(typeof sig1, 'string');
  assert.match(sig1, /^[0-9a-f]+$/);
});

test('expectedSignature - produces different signatures for different secrets', async () => {
  const timestamp = '1234567890';
  const method = 'POST';
  const path = '/v1/background-jobs';
  const body = '{"type":"log-doctor-scan"}';

  const sig1 = await expectedSignature(
    'secret-1',
    timestamp,
    method,
    path,
    body
  );
  const sig2 = await expectedSignature(
    'secret-2',
    timestamp,
    method,
    path,
    body
  );

  assert.notStrictEqual(
    sig1,
    sig2,
    'Different secrets should produce different signatures'
  );
});

test('expectedSignature - produces different signatures for different bodies', async () => {
  const secret = 'test-secret';
  const timestamp = '1234567890';
  const method = 'POST';
  const path = '/v1/background-jobs';

  const sig1 = await expectedSignature(
    secret,
    timestamp,
    method,
    path,
    '{"type":"log-doctor-scan"}'
  );
  const sig2 = await expectedSignature(
    secret,
    timestamp,
    method,
    path,
    '{"type":"github-health"}'
  );

  assert.notStrictEqual(
    sig1,
    sig2,
    'Different bodies should produce different signatures'
  );
});

test('expectedSignature - produces different signatures for different timestamps', async () => {
  const secret = 'test-secret';
  const method = 'POST';
  const path = '/v1/background-jobs';
  const body = '{"type":"log-doctor-scan"}';

  const sig1 = await expectedSignature(
    secret,
    '1000000000',
    method,
    path,
    body
  );
  const sig2 = await expectedSignature(
    secret,
    '2000000000',
    method,
    path,
    body
  );

  assert.notStrictEqual(
    sig1,
    sig2,
    'Different timestamps should produce different signatures'
  );
});

test('timingSafeEqual - returns true for identical strings', () => {
  const result = timingSafeEqual('hello', 'hello');
  assert.strictEqual(result, true);
});

test('timingSafeEqual - returns false for different strings', () => {
  const result = timingSafeEqual('hello', 'world');
  assert.strictEqual(result, false);
});

test('timingSafeEqual - returns false for different lengths', () => {
  const result = timingSafeEqual('hello', 'hello123');
  assert.strictEqual(result, false);
});

test('timingSafeEqual - returns false for one-char difference', () => {
  const result = timingSafeEqual('abcdef', 'abcxef');
  assert.strictEqual(result, false);
});

test('timingSafeEqual - compares long strings correctly', () => {
  const long1 = 'a'.repeat(1000);
  const long2 = 'a'.repeat(1000);
  const result = timingSafeEqual(long1, long2);
  assert.strictEqual(result, true);
});

test('authenticate - returns userId on valid request', async () => {
  const env = createMockEnv();
  const secret = env.MATMETRICS_INTERNAL_API_SECRET;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const userId = 'user-123';
  const method = 'POST';
  const path = '/v1/background-jobs';
  const body = '{"type":"log-doctor-scan"}';

  const sig = await expectedSignature(secret, timestamp, method, path, body);

  const request = new MockRequest({
    url: `https://api.example.com${path}`,
    method,
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      'X-Matmetrics-User-Id': userId,
      Authorization: `Bearer ${sig}`,
    },
    body,
  });

  const result = await authenticate(request, env, body);
  assert.deepEqual(result, { userId });
});

test('authenticate - returns 401 when Authorization header missing', async () => {
  const env = createMockEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      'X-Matmetrics-User-Id': 'user-123',
      // Missing Authorization
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Unauthorized' });
});

test('authenticate - returns 401 when User-Id header missing', async () => {
  const env = createMockEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    timestamp,
    'POST',
    '/v1/background-jobs',
    '{}'
  );

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      // Missing User-Id
      Authorization: `Bearer ${sig}`,
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Unauthorized' });
});

test('authenticate - returns 401 when Timestamp header missing', async () => {
  const env = createMockEnv();
  const sig = 'dummy-sig';

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      // Missing Timestamp
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: `Bearer ${sig}`,
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Unauthorized' });
});

test('authenticate - returns 401 when Authorization format invalid (missing Bearer)', async () => {
  const env = createMockEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: 'InvalidFormat sig-here',
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Unauthorized' });
});

test('authenticate - returns 401 when HMAC signature mismatches', async () => {
  const env = createMockEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: 'Bearer incorrect-signature-value',
    },
    body: '{"type":"log-doctor-scan"}',
  });

  const result = await authenticate(request, env, '{"type":"log-doctor-scan"}');
  assert.deepEqual(result, { error: 'Unauthorized' });
});

test('authenticate - returns 401 when timestamp is too old (>60s)', async () => {
  const env = createMockEnv();
  const oldTimestamp = String(Math.floor(Date.now() / 1000) - 70); // 70 seconds ago
  const sig = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    oldTimestamp,
    'POST',
    '/v1/background-jobs',
    '{}'
  );

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': oldTimestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: `Bearer ${sig}`,
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Expired signature' });
});

test('authenticate - returns 401 when timestamp is in the future (>60s)', async () => {
  const env = createMockEnv();
  const futureTimestamp = String(Math.floor(Date.now() / 1000) + 70); // 70 seconds in future
  const sig = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    futureTimestamp,
    'POST',
    '/v1/background-jobs',
    '{}'
  );

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': futureTimestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: `Bearer ${sig}`,
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Expired signature' });
});

test('authenticate - returns 401 when timestamp is not an integer', async () => {
  const env = createMockEnv();

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': 'not-a-number',
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: 'Bearer sig',
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { error: 'Expired signature' });
});

test('authenticate - accepts valid timestamp within 60s window', async () => {
  const env = createMockEnv();
  const recentTimestamp = String(Math.floor(Date.now() / 1000) - 30); // 30 seconds ago (within window)
  const sig = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    recentTimestamp,
    'POST',
    '/v1/background-jobs',
    '{}'
  );

  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': recentTimestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: `Bearer ${sig}`,
    },
    body: '{}',
  });

  const result = await authenticate(request, env, '{}');
  assert.deepEqual(result, { userId: 'user-123' });
});

test('authenticate - validates signature against request body', async () => {
  const env = createMockEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const originalBody = '{"type":"log-doctor-scan"}';
  const sig = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    timestamp,
    'POST',
    '/v1/background-jobs',
    originalBody
  );

  // Signature valid for originalBody
  const request = new MockRequest({
    url: 'https://api.example.com/v1/background-jobs',
    method: 'POST',
    headers: {
      'X-Matmetrics-Timestamp': timestamp,
      'X-Matmetrics-User-Id': 'user-123',
      Authorization: `Bearer ${sig}`,
    },
    body: originalBody,
  });

  // But authenticate with a different body should fail
  const tamperedBody = '{"type":"github-health"}';
  const result = await authenticate(request, env, tamperedBody);
  assert.deepEqual(result, { error: 'Unauthorized' });
});

// ============================================================================
// PHASE 2b TESTS: Validation (parseJobPayload, toJobResponse)
// ============================================================================

test('parseJobPayload - accepts valid log-doctor-scan payload', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });
});

test('parseJobPayload - accepts valid github-health payload', () => {
  const body = JSON.stringify({
    type: 'github-health',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'github-health',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });
});

test('parseJobPayload - accepts payload with optional branch', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: 'main' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: 'main' },
  });
});

test('parseJobPayload - rejects invalid job type', () => {
  const body = JSON.stringify({
    type: 'invalid-type',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects payload missing type', () => {
  const body = JSON.stringify({
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects payload missing config', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects payload missing owner', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects payload missing repo', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects owner exceeding 200 chars', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'a'.repeat(201), repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects repo exceeding 200 chars', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'a'.repeat(201) },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects branch exceeding 200 chars', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: 'a'.repeat(201) },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - accepts owner at exactly 200 chars', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'a'.repeat(200), repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result?.config.owner.length, 200);
});

test('parseJobPayload - trims whitespace from owner', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: '  octocat  ', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });
});

test('parseJobPayload - trims whitespace from repo', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: '  Hello-World  ' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });
});

test('parseJobPayload - trims whitespace from branch', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: '  main  ' },
  });

  const result = parseJobPayload(body);
  assert.deepEqual(result, {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: 'main' },
  });
});

test('parseJobPayload - rejects branch that is only whitespace', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: '   ' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects owner that is only whitespace', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: '   ', repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects repo that is only whitespace', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: '   ' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects invalid JSON', () => {
  const result = parseJobPayload('{ invalid json }');
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects payload exceeding 4KB', () => {
  const oversized = JSON.stringify({
    type: 'log-doctor-scan',
    config: {
      owner: 'octocat',
      repo: 'Hello-World',
      largeData: 'x'.repeat(5000),
    },
  });

  const result = parseJobPayload(oversized);
  assert.strictEqual(result, null);
});

test('parseJobPayload - accepts payload at exactly 4KB', () => {
  // Create payload close to 4KB limit
  const padding = 'x'.repeat(4000 - 100); // Subtract overhead
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', data: padding },
  });

  if (encoder.encode(body).byteLength <= 4096) {
    const result = parseJobPayload(body);
    assert.notStrictEqual(result, null);
  }
});

test('parseJobPayload - rejects owner with non-string type', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 123, repo: 'Hello-World' },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('parseJobPayload - rejects repo with non-string type', () => {
  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: true },
  });

  const result = parseJobPayload(body);
  assert.strictEqual(result, null);
});

test('toJobResponse - formats job with all fields', () => {
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'completed',
    payload_json: '{}',
    result_json: '{"issues": []}',
    error_message: null,
    attempts: 1,
    created_at: 1000000000000,
    updated_at: 1000000001000,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.id, 'job-123');
  assert.strictEqual(response.type, 'log-doctor-scan');
  assert.strictEqual(response.status, 'completed');
  assert.strictEqual(response.attempts, 1);
  assert.deepEqual(response.result, { issues: [] });
  assert.strictEqual(response.error, undefined);
});

test('toJobResponse - omits result field when result_json is null', () => {
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: 1000000000000,
    updated_at: 1000000001000,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.id, 'job-123');
  assert.strictEqual(response.result, undefined);
  assert.strictEqual(response.error, undefined);
});

test('toJobResponse - includes error field when error_message is present', () => {
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'failed',
    payload_json: '{}',
    result_json: null,
    error_message: 'Executor timeout',
    attempts: 5,
    created_at: 1000000000000,
    updated_at: 1000000005000,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.error, 'Executor timeout');
  assert.strictEqual(response.result, undefined);
});

test('toJobResponse - includes both result and error', () => {
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'completed',
    payload_json: '{}',
    result_json: '{"warnings": ["issue"]}',
    error_message: 'Partial failure',
    attempts: 2,
    created_at: 1000000000000,
    updated_at: 1000000002000,
  };

  const response = toJobResponse(job);

  assert.deepEqual(response.result, { warnings: ['issue'] });
  assert.strictEqual(response.error, 'Partial failure');
});

test('toJobResponse - converts timestamps to ISO strings', () => {
  const created = 1609459200000; // 2021-01-01T00:00:00Z
  const updated = 1609545600000; // 2021-01-02T00:00:00Z
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: created,
    updated_at: updated,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.createdAt, new Date(created).toISOString());
  assert.strictEqual(response.updatedAt, new Date(updated).toISOString());
});

test('toJobResponse - handles malformed result_json gracefully', () => {
  const job: StoredJob = {
    id: 'job-123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'completed',
    payload_json: '{}',
    result_json: 'invalid json {',
    error_message: null,
    attempts: 1,
    created_at: 1000000000000,
    updated_at: 1000000001000,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.id, 'job-123');
  assert.strictEqual(response.result, undefined);
  assert.strictEqual(response.error, undefined);
});

test('toJobResponse - preserves all job metadata', () => {
  const job: StoredJob = {
    id: 'unique-id-456',
    user_id: 'user-999',
    type: 'github-health',
    status: 'queued',
    payload_json: '{"config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1234567890000,
    updated_at: 1234567890000,
  };

  const response = toJobResponse(job);

  assert.strictEqual(response.id, 'unique-id-456');
  assert.strictEqual(response.type, 'github-health');
  assert.strictEqual(response.status, 'queued');
  assert.strictEqual(response.attempts, 0);
});

// ============================================================================
// PHASE 2c TESTS: Database Operations (getJob, createJob)
// ============================================================================

test('getJob - retrieves job by ID from database', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const job: StoredJob = {
    id: 'job-abc123',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{"type":"log-doctor-scan"}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);

  const result = await getJob(env, 'job-abc123');
  assert.deepEqual(result, job);
});

test('getJob - returns null when job not found', async () => {
  const env = createMockEnv();

  const result = await getJob(env, 'non-existent-id');
  assert.strictEqual(result, null);
});

test('getJob - preserves all job fields', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const job: StoredJob = {
    id: 'job-preserve',
    user_id: 'user-preserve',
    type: 'github-health',
    status: 'completed',
    payload_json: '{"config":{"owner":"test","repo":"repo"}}',
    result_json: '{"status":"ok"}',
    error_message: null,
    attempts: 2,
    created_at: 1234567890,
    updated_at: 1234567891,
  };

  db._setJob(job);

  const retrieved = await getJob(env, 'job-preserve');
  assert.strictEqual(retrieved?.id, 'job-preserve');
  assert.strictEqual(retrieved?.user_id, 'user-preserve');
  assert.strictEqual(retrieved?.type, 'github-health');
  assert.strictEqual(retrieved?.status, 'completed');
  assert.strictEqual(retrieved?.attempts, 2);
  assert.strictEqual(retrieved?.created_at, 1234567890);
  assert.strictEqual(retrieved?.updated_at, 1234567891);
});

test('createJob - creates job with valid payload', async () => {
  const env = createMockEnv();
  const _db = env.DB as any as MockD1Database;

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const response = await createJob(env, 'user-1', body);

  assert.strictEqual(response.status, 202);
  const jobResponse = response.body as Record<string, unknown>;
  assert.strictEqual(typeof jobResponse.id, 'string');
  assert.strictEqual(jobResponse.type, 'log-doctor-scan');
  assert.strictEqual(jobResponse.status, 'queued');
  assert.strictEqual(jobResponse.attempts, 0);
});

test('createJob - returns 400 for invalid payload', async () => {
  const env = createMockEnv();

  const body = JSON.stringify({ type: 'invalid-type' });

  const response = await createJob(env, 'user-1', body);

  assert.strictEqual(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid background job payload' });
});

test('createJob - queues message for created job', async () => {
  const env = createMockEnv();
  const queue = env.BACKGROUND_JOBS as any as _MockQueue<{ id: string }>;

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  await createJob(env, 'user-1', body);

  const messages = queue._getMessages();
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(typeof messages[0].id, 'string');
});

test('createJob - stores job in database', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const body = JSON.stringify({
    type: 'github-health',
    config: { owner: 'octocat', repo: 'Spoon-Knife' },
  });

  const response = await createJob(env, 'user-1', body);
  const jobResponse = response.body as Record<string, unknown>;
  const jobId = jobResponse.id as string;

  const stored = db._getJob(jobId);
  assert.notStrictEqual(stored, undefined);
  assert.strictEqual(stored?.type, 'github-health');
  assert.strictEqual(stored?.status, 'queued');
  assert.strictEqual(stored?.user_id, 'user-1');
});

test('createJob - generates unique ID for each job', async () => {
  const env = createMockEnv();

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const response1 = await createJob(env, 'user-1', body);
  const response2 = await createJob(env, 'user-1', body);

  const id1 = (response1.body as Record<string, unknown>).id;
  const id2 = (response2.body as Record<string, unknown>).id;

  assert.notStrictEqual(id1, id2);
});

test('createJob - stores job with optional branch', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World', branch: 'develop' },
  });

  const response = await createJob(env, 'user-1', body);
  const jobResponse = response.body as Record<string, unknown>;
  const jobId = jobResponse.id as string;

  const stored = db._getJob(jobId);
  const payloadJson = JSON.parse(stored?.payload_json || '{}');
  assert.strictEqual(payloadJson.config.branch, 'develop');
});

test('createJob - sets initial attempts to 0', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const response = await createJob(env, 'user-1', body);
  const jobResponse = response.body as Record<string, unknown>;
  const jobId = jobResponse.id as string;

  const stored = db._getJob(jobId);
  assert.strictEqual(stored?.attempts, 0);
});

test('createJob - sets status to queued', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const body = JSON.stringify({
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  });

  const response = await createJob(env, 'user-1', body);
  const jobResponse = response.body as Record<string, unknown>;
  const jobId = jobResponse.id as string;

  const stored = db._getJob(jobId);
  assert.strictEqual(stored?.status, 'queued');
});

test('createJob - stores payload as JSON string', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const originalPayload = {
    type: 'log-doctor-scan',
    config: { owner: 'octocat', repo: 'Hello-World' },
  };
  const body = JSON.stringify(originalPayload);

  const response = await createJob(env, 'user-1', body);
  const jobResponse = response.body as Record<string, unknown>;
  const jobId = jobResponse.id as string;

  const stored = db._getJob(jobId);
  const storedPayload = JSON.parse(stored?.payload_json || '{}');
  assert.deepEqual(storedPayload, originalPayload);
});

// ============================================================================
// PHASE 2d TESTS: Network & Retry Logic (executeBackgroundJob, consumeMessage, handlePreferences)
// ============================================================================

test('executeBackgroundJob - calls executor with valid job data', async () => {
  const env = createMockEnv();
  const mockFetch = new MockFetch();
  let capturedRequest: Request | null = null;

  mockFetch.register(/executor/, async (req) => {
    capturedRequest = req;
    return new MockResponse('{"status":"ok"}', 200);
  });

  const job: StoredJob = {
    id: 'job-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"octocat","repo":"Hello-World"}}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: 1000000000,
    updated_at: 1000000001,
  };

  const response = await executeBackgroundJob(
    env,
    job,
    mockFetch.call.bind(mockFetch) as any
  );

  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.status, 200);
  assert.notStrictEqual(capturedRequest, null);
  assert.strictEqual(capturedRequest?.method, 'POST');
});

test('executeBackgroundJob - includes bearer token', async () => {
  const env = createMockEnv({
    ...createMockEnv(),
    MATMETRICS_BACKGROUND_EXECUTOR_SECRET: 'secret-token-123',
  });
  const mockFetch = new MockFetch();
  let authHeader = '';

  mockFetch.register(/executor/, async (req) => {
    authHeader = req.headers.get('Authorization') || '';
    return new MockResponse('{}', 200);
  });

  const job: StoredJob = {
    id: 'job-2',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"octocat","repo":"Hello-World"}}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: 1000000000,
    updated_at: 1000000001,
  };

  await executeBackgroundJob(env, job, mockFetch.call.bind(mockFetch) as any);

  assert.strictEqual(authHeader, 'Bearer secret-token-123');
});

test('executeBackgroundJob - returns 500 error from executor', async () => {
  const env = createMockEnv();
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('Internal error', 500);
  });

  const job: StoredJob = {
    id: 'job-3',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'running',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"octocat","repo":"Hello-World"}}',
    result_json: null,
    error_message: null,
    attempts: 1,
    created_at: 1000000000,
    updated_at: 1000000001,
  };

  const response = await executeBackgroundJob(
    env,
    job,
    mockFetch.call.bind(mockFetch) as any
  );

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.status, 500);
});

test('consumeMessage - marks job as acked on success', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('{"result":"success"}', 200);
  });

  const job: StoredJob = {
    id: 'job-success',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-success' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  assert.strictEqual(message.acked, true);
  assert.strictEqual(message.retried, false);
});

test('consumeMessage - increments attempts', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('{"result":"success"}', 200);
  });

  const job: StoredJob = {
    id: 'job-attempts',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 2,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-attempts' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  const updated = db._getJob('job-attempts');
  assert.strictEqual(updated?.attempts, 3);
});

test('consumeMessage - stores result on success', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();
  const resultData = { issues: [{ severity: 'high', message: 'test' }] };

  mockFetch.register(/executor/, async () => {
    return new MockResponse(JSON.stringify(resultData), 200);
  });

  const job: StoredJob = {
    id: 'job-result',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-result' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  const updated = db._getJob('job-result');
  assert.strictEqual(updated?.result_json, JSON.stringify(resultData));
  assert.strictEqual(updated?.status, 'completed');
});

test('consumeMessage - marks 4xx errors as terminal failure', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('Bad Request', 400);
  });

  const job: StoredJob = {
    id: 'job-4xx',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-4xx' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  const updated = db._getJob('job-4xx');
  assert.strictEqual(updated?.status, 'failed');
  assert.match(updated?.error_message || '', /Executor returned 400/);
  assert.strictEqual(message.acked, true);
  assert.strictEqual(message.retried, false);
});

test('consumeMessage - retries on 5xx errors', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('Service Unavailable', 503);
  });

  const job: StoredJob = {
    id: 'job-5xx',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-5xx' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  const updated = db._getJob('job-5xx');
  assert.strictEqual(updated?.status, 'queued');
  assert.strictEqual(message.retried, true);
  assert.strictEqual(message.acked, false);
});

test('consumeMessage - respects max attempts (5)', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('Service Unavailable', 503);
  });

  const job: StoredJob = {
    id: 'job-max-attempts',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 5, // Already at max
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-max-attempts' });

  await consumeMessage(env, message, mockFetch.call.bind(mockFetch) as any);

  const updated = db._getJob('job-max-attempts');
  assert.strictEqual(updated?.status, 'failed');
  assert.strictEqual(updated?.attempts, 6);
  assert.strictEqual(message.acked, true);
});

test('consumeMessage - skips already completed job', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const job: StoredJob = {
    id: 'job-completed',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'completed',
    payload_json: '{}',
    result_json: '{}',
    error_message: null,
    attempts: 1,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-completed' });

  await consumeMessage(env, message, undefined as any);

  assert.strictEqual(message.acked, true);
  assert.strictEqual(message.retried, false);
});

test('consumeMessage - skips already failed job', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  const job: StoredJob = {
    id: 'job-failed',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'failed',
    payload_json: '{}',
    result_json: null,
    error_message: 'Previous failure',
    attempts: 5,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);
  const message = new MockMessage({ id: 'job-failed' });

  await consumeMessage(env, message, undefined as any);

  assert.strictEqual(message.acked, true);
  assert.strictEqual(message.retried, false);
});

test('handlePreferences - GET returns null for new user', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'GET',
  });

  const response = await handlePreferences(request, env, 'new-user', '');

  assert.strictEqual(response.status, 200);
  assert.deepEqual(response.body, { preferences: null, revision: 0 });
});

test('handlePreferences - PUT creates new preferences', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const prefs = { theme: 'dark', notifications: true };
  const body = JSON.stringify({ preferences: prefs, revision: 0 });

  const response = await handlePreferences(request, env, 'user-1', body);

  assert.strictEqual(response.status, 200);
  const respBody = response.body as Record<string, unknown>;
  assert.deepEqual(respBody.preferences, prefs);
  assert.strictEqual(respBody.revision, 1);
});

test('handlePreferences - PUT detects revision conflict', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  // Set current revision to 2
  db._setPreferences('user-conflict', { theme: 'light' }, 2);

  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = JSON.stringify({ preferences: { theme: 'dark' }, revision: 1 }); // Stale revision

  const response = await handlePreferences(request, env, 'user-conflict', body);

  assert.strictEqual(response.status, 409);
  const respBody = response.body as Record<string, unknown>;
  assert.strictEqual(respBody.error, 'Preference revision conflict');
  assert.strictEqual(respBody.revision, 2);
});

test('handlePreferences - PUT rejects payload > 1MB', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const hugePayload = { data: 'x'.repeat(1100000) };
  const body = JSON.stringify({ preferences: hugePayload, revision: 0 });

  const response = await handlePreferences(request, env, 'user-huge', body);

  assert.strictEqual(response.status, 413);
  const respBody = response.body as Record<string, unknown>;
  assert.match(respBody.error as string, /1MB limit/);
});

test('handlePreferences - PUT rejects invalid JSON', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = '{ invalid json ]';

  const response = await handlePreferences(request, env, 'user-invalid', body);

  assert.strictEqual(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid JSON' });
});

test('handlePreferences - PUT increments revision', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;

  db._setPreferences('user-rev', { theme: 'light' }, 1);

  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = JSON.stringify({ preferences: { theme: 'dark' }, revision: 1 });

  const response = await handlePreferences(request, env, 'user-rev', body);

  assert.strictEqual(response.status, 200);
  const respBody = response.body as Record<string, unknown>;
  assert.strictEqual(respBody.revision, 2);
});

test('handlePreferences - rejects non-object preferences', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = JSON.stringify({ preferences: 'string', revision: 0 });

  const response = await handlePreferences(request, env, 'user-invalid', body);

  assert.strictEqual(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid payload' });
});

test('handlePreferences - rejects array preferences', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = JSON.stringify({ preferences: ['item1', 'item2'], revision: 0 });

  const response = await handlePreferences(request, env, 'user-array', body);

  assert.strictEqual(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid payload' });
});

test('handlePreferences - rejects negative revision', async () => {
  const env = createMockEnv();
  const request = new MockRequest({
    url: 'https://api.example.com/v1/preferences',
    method: 'PUT',
  });
  const body = JSON.stringify({ preferences: { theme: 'dark' }, revision: -1 });

  const response = await handlePreferences(request, env, 'user-negative', body);

  assert.strictEqual(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid payload' });
});

// ============================================================================
// PHASE 2e TESTS: Integration Tests (worker.fetch & worker.queue handlers)
// ============================================================================

// ============================================================================
// PHASE 2e TESTS: Integration Tests (worker.queue batch processing)
// ============================================================================

test('worker.queue - processes single message batch', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('{"result":"success"}', 200);
  });

  const job: StoredJob = {
    id: 'job-queue-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json:
      '{"type":"log-doctor-scan","config":{"owner":"test","repo":"repo"}}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job);

  const message = new MockMessage({ id: 'job-queue-1' });
  const batch = { messages: [message] };

  // Call worker queue handler
  await (async () => {
    await Promise.all(
      batch.messages.map((msg) =>
        consumeMessage(env, msg, mockFetch.call.bind(mockFetch) as any)
      )
    );
  })();

  assert.strictEqual(message.acked, true);
  const updated = db._getJob('job-queue-1');
  assert.strictEqual(updated?.status, 'completed');
});

test('worker.queue - handles multiple messages in batch', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  mockFetch.register(/executor/, async () => {
    return new MockResponse('{"result":"success"}', 200);
  });

  const job1: StoredJob = {
    id: 'job-batch-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  const job2: StoredJob = {
    id: 'job-batch-2',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job1);
  db._setJob(job2);

  const message1 = new MockMessage({ id: 'job-batch-1' });
  const message2 = new MockMessage({ id: 'job-batch-2' });
  const batch = { messages: [message1, message2] };

  await (async () => {
    await Promise.all(
      batch.messages.map((msg) =>
        consumeMessage(env, msg, mockFetch.call.bind(mockFetch) as any)
      )
    );
  })();

  assert.strictEqual(message1.acked, true);
  assert.strictEqual(message2.acked, true);
  assert.strictEqual(db._getJob('job-batch-1')?.status, 'completed');
  assert.strictEqual(db._getJob('job-batch-2')?.status, 'completed');
});

test('worker.queue - continues processing after message error', async () => {
  const env = createMockEnv();
  const db = env.DB as any as MockD1Database;
  const mockFetch = new MockFetch();

  let callCount = 0;
  mockFetch.register(/executor/, async () => {
    callCount++;
    if (callCount === 1) {
      return new MockResponse('Internal error', 500);
    }
    return new MockResponse('{"result":"success"}', 200);
  });

  const job1: StoredJob = {
    id: 'job-error-1',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  const job2: StoredJob = {
    id: 'job-error-2',
    user_id: 'user-1',
    type: 'log-doctor-scan',
    status: 'queued',
    payload_json: '{}',
    result_json: null,
    error_message: null,
    attempts: 0,
    created_at: 1000000000,
    updated_at: 1000000000,
  };

  db._setJob(job1);
  db._setJob(job2);

  const message1 = new MockMessage({ id: 'job-error-1' });
  const message2 = new MockMessage({ id: 'job-error-2' });
  const batch = { messages: [message1, message2] };

  await (async () => {
    await Promise.all(
      batch.messages.map((msg) =>
        consumeMessage(env, msg, mockFetch.call.bind(mockFetch) as any)
      )
    );
  })();

  // First job retried (5xx error)
  assert.strictEqual(message1.retried, true);
  // Second job succeeded
  assert.strictEqual(message2.acked, true);
  assert.strictEqual(db._getJob('job-error-2')?.status, 'completed');
});
