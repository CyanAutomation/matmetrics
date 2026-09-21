export interface Env {
  DB: D1Database;
  BACKGROUND_JOBS: Queue<{ id: string }>;
  MATMETRICS_INTERNAL_API_SECRET: string;
  MATMETRICS_BACKGROUND_EXECUTOR_URL: string;
  MATMETRICS_BACKGROUND_EXECUTOR_SECRET: string;
}

type JobType = 'log-doctor-scan' | 'github-health';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
type JobPayload = {
  type: JobType;
  config: { owner: string; repo: string; branch?: string };
};
type StoredJob = {
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
};

const MAX_SIGNATURE_AGE_SECONDS = 60;
const MAX_JOB_PAYLOAD_BYTES = 4 * 1024;
const MAX_JOB_RESULT_BYTES = 512 * 1024;
const MAX_JOB_ATTEMPTS = 5;
const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

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

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function authenticate(
  request: Request,
  env: Env,
  body: string
): Promise<{ userId: string } | Response> {
  const timestamp = request.headers.get('X-Matmetrics-Timestamp');
  const userId = request.headers.get('X-Matmetrics-User-Id');
  const authorization = request.headers.get('Authorization');
  if (!timestamp || !userId || !authorization?.startsWith('Bearer '))
    return json({ error: 'Unauthorized' }, 401);
  const timestampNumber = Number(timestamp);
  if (
    !Number.isInteger(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > MAX_SIGNATURE_AGE_SECONDS
  )
    return json({ error: 'Expired signature' }, 401);
  const expected = await expectedSignature(
    env.MATMETRICS_INTERNAL_API_SECRET,
    timestamp,
    request.method,
    new URL(request.url).pathname,
    body
  );
  if (!timingSafeEqual(authorization.slice(7), expected))
    return json({ error: 'Unauthorized' }, 401);
  return { userId };
}

function parseJobPayload(body: string): JobPayload | null {
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

async function getJob(env: Env, id: string): Promise<StoredJob | null> {
  return env.DB.prepare(
    'SELECT id, user_id, type, status, payload_json, result_json, error_message, attempts, created_at, updated_at FROM background_jobs WHERE id = ?'
  )
    .bind(id)
    .first<StoredJob>();
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
 * Updates background job status in the database.
 * Consolidates duplicate UPDATE patterns for consistency and maintainability.
 */
async function updateJobStatus(
  env: Env,
  jobId: string,
  status: JobStatus,
  options?: {
    errorMessage?: string;
    resultJson?: string;
    attempts?: number;
  }
): Promise<void> {
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

  try {
    await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch (error) {
    console.error(
      `[updateJobStatus] Failed to update job ${jobId} to ${status}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function createJob(
  env: Env,
  userId: string,
  body: string
): Promise<Response> {
  const payload = parseJobPayload(body);
  if (!payload) return json({ error: 'Invalid background job payload' }, 400);
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
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
    await env.BACKGROUND_JOBS.send({ id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create background job';
    await updateJobStatus(env, id, 'failed', {
      errorMessage: message.slice(0, 1000),
    }).catch(() => {});
    return json({ error: 'Unable to queue background job' }, 503);
  }
  return json(toJobResponse((await getJob(env, id)) as StoredJob), 202);
}

async function handleBackgroundJobs(
  request: Request,
  env: Env,
  userId: string,
  body: string,
  pathname: string
): Promise<Response> {
  if (pathname === '/v1/background-jobs' && request.method === 'POST')
    return createJob(env, userId, body);
  const match = pathname.match(/^\/v1\/background-jobs\/([0-9a-f-]{36})$/i);
  if (!match || request.method !== 'GET')
    return json({ error: 'Not found' }, 404);
  const job = await getJob(env, match[1]);
  if (!job || job.user_id !== userId) return json({ error: 'Not found' }, 404);
  return json(toJobResponse(job));
}

async function executeBackgroundJob(
  env: Env,
  job: StoredJob
): Promise<Response> {
  const url = new URL(
    '/api/internal/background-jobs/execute',
    env.MATMETRICS_BACKGROUND_EXECUTOR_URL
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = safeParseJSON<JobPayload>(
      job.payload_json,
      `job-${job.id}-payload`
    );
    if (!payload) throw new Error('Failed to parse job payload');
    return await fetch(url, {
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
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function consumeMessage(
  env: Env,
  message: Message<{ id: string }>
): Promise<void> {
  const job = await getJob(env, message.body.id);
  if (!job || job.status === 'completed' || job.status === 'failed')
    return message.ack();
  const attempts = job.attempts + 1;
  await updateJobStatus(env, job.id, 'running', { attempts });
  try {
    const response = await executeBackgroundJob(env, job);
    const text = await response.text();
    if (!response.ok) {
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        await updateJobStatus(env, job.id, 'failed', {
          errorMessage: `Executor returned ${response.status}`,
        });
        return message.ack();
      }
      throw new Error(
        `Executor returned ${response.status}: ${text.slice(0, 500)}`
      );
    }
    if (encoder.encode(text).byteLength > MAX_JOB_RESULT_BYTES)
      throw new Error('Executor response exceeds job result limit');
    if (!safeParseJSON(text, `job-${job.id}-result`))
      throw new Error('Executor response is not valid JSON');
    await updateJobStatus(env, job.id, 'completed', { resultJson: text });
    return message.ack();
  } catch (error) {
    const failure =
      error instanceof Error ? error.message : 'Background job failed';
    if (attempts >= MAX_JOB_ATTEMPTS) {
      await updateJobStatus(env, job.id, 'failed', {
        errorMessage: failure.slice(0, 1000),
      });
      return message.ack();
    }
    await updateJobStatus(env, job.id, 'queued', {
      errorMessage: failure.slice(0, 1000),
    });
    return message.retry();
  }
}

async function handlePreferences(
  request: Request,
  env: Env,
  userId: string,
  body: string
): Promise<Response> {
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT preferences_json, revision FROM user_preferences WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ preferences_json: string; revision: number }>();
    const preferences = row
      ? safeParseJSON(row.preferences_json, `user-${userId}-preferences`)
      : null;
    return json(
      preferences
        ? { preferences, revision: row!.revision }
        : { preferences: null, revision: 0 }
    );
  }
  if (request.method !== 'PUT')
    return json({ error: 'Method not allowed' }, 405);
  const payload = safeParseJSON<{ preferences?: unknown; revision?: unknown }>(
    body,
    `user-${userId}-preferences-update`
  );
  if (!payload) return json({ error: 'Invalid JSON' }, 400);
  if (
    !payload.preferences ||
    typeof payload.preferences !== 'object' ||
    Array.isArray(payload.preferences) ||
    !Number.isInteger(payload.revision) ||
    (payload.revision as number) < 0
  )
    return json({ error: 'Invalid payload' }, 400);
  const preferencesJson = JSON.stringify(payload.preferences);
  if (preferencesJson.length > 1048576)
    return json({ error: 'Preferences payload exceeds 1MB limit' }, 413);
  const stored = await env.DB.prepare(
    'SELECT revision FROM user_preferences WHERE user_id = ?'
  )
    .bind(userId)
    .first<{ revision: number }>();
  const currentRevision = stored?.revision ?? 0;
  if (payload.revision !== currentRevision)
    return json(
      { error: 'Preference revision conflict', revision: currentRevision },
      409
    );
  const nextRevision = currentRevision + 1;
  await env.DB.prepare(
    `INSERT INTO user_preferences (user_id, preferences_json, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET preferences_json = excluded.preferences_json, revision = excluded.revision, updated_at = excluded.updated_at`
  )
    .bind(userId, preferencesJson, nextRevision, Date.now())
    .run();
  return json({ preferences: payload.preferences, revision: nextRevision });
}

const worker: ExportedHandler<Env, { id: string }> = {
  async fetch(request, env): Promise<Response> {
    const body = request.method === 'GET' ? '' : await request.text();
    const identity = await authenticate(request, env, body);
    if (identity instanceof Response) return identity;
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/v1/background-jobs'))
      return handleBackgroundJobs(
        request,
        env,
        identity.userId,
        body,
        pathname
      );
    if (pathname === '/v1/plugin-overrides') {
      if (request.method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT plugin_id, enabled FROM plugin_enabled_overrides WHERE user_id = ?'
        )
          .bind(identity.userId)
          .all<{ plugin_id: string; enabled: number }>();
        return json({
          overrides: Object.fromEntries(
            (result.results ?? []).map((row) => [
              row.plugin_id,
              row.enabled === 1,
            ])
          ),
        });
      }
      if (request.method !== 'PUT')
        return json({ error: 'Method not allowed' }, 405);
      const payload = safeParseJSON<{ pluginId?: unknown; enabled?: unknown }>(
        body,
        `user-${identity.userId}-plugin-override`
      );
      if (!payload) return json({ error: 'Invalid JSON' }, 400);
      if (
        typeof payload.pluginId !== 'string' ||
        !payload.pluginId.trim() ||
        typeof payload.enabled !== 'boolean'
      )
        return json({ error: 'Invalid payload' }, 400);
      await env.DB.prepare(
        `INSERT INTO plugin_enabled_overrides (user_id, plugin_id, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
      )
        .bind(
          identity.userId,
          payload.pluginId.trim(),
          payload.enabled ? 1 : 0,
          Date.now()
        )
        .run();
      return json({ persisted: true });
    }
    if (pathname === '/v1/preferences')
      return handlePreferences(request, env, identity.userId, body);
    return json({ error: 'Not found' }, 404);
  },
  async queue(batch, env): Promise<void> {
    await Promise.all(
      batch.messages.map((message) => consumeMessage(env, message))
    );
  },
};

export default worker;
