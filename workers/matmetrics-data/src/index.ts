export interface Env {
  DB: D1Database;
  MATMETRICS_INTERNAL_API_SECRET: string;
}

const MAX_SIGNATURE_AGE_SECONDS = 60;
const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function expectedSignature(secret: string, timestamp: string, method: string, path: string, body: string): Promise<string> {
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`v1.${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`)));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function authenticate(request: Request, env: Env, body: string): Promise<{ userId: string } | Response> {
  const timestamp = request.headers.get('X-Matmetrics-Timestamp');
  const userId = request.headers.get('X-Matmetrics-User-Id');
  const authorization = request.headers.get('Authorization');
  if (!timestamp || !userId || !authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const timestampNumber = Number(timestamp);
  if (!Number.isInteger(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > MAX_SIGNATURE_AGE_SECONDS) return json({ error: 'Expired signature' }, 401);
  const expected = await expectedSignature(env.MATMETRICS_INTERNAL_API_SECRET, timestamp, request.method, new URL(request.url).pathname, body);
  if (!timingSafeEqual(authorization.slice(7), expected)) return json({ error: 'Unauthorized' }, 401);
  return { userId };
}

function isPreferencesPath(pathname: string): boolean {
  return pathname === '/v1/preferences';
}

function isPluginOverridesPath(pathname: string): boolean {
  return pathname === '/v1/plugin-overrides';
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const body = request.method === 'GET' ? '' : await request.text();
    const identity = await authenticate(request, env, body);
    if (identity instanceof Response) return identity;
    const pathname = new URL(request.url).pathname;
    if (isPluginOverridesPath(pathname)) {
      if (request.method === 'GET') {
        const result = await env.DB.prepare('SELECT plugin_id, enabled FROM plugin_enabled_overrides WHERE user_id = ?').bind(identity.userId).all<{ plugin_id: string; enabled: number }>();
        return json({ overrides: Object.fromEntries((result.results ?? []).map((row) => [row.plugin_id, row.enabled === 1])) });
      }
      if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
      let payload: unknown;
      try { payload = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'Invalid payload' }, 400);
      const { pluginId, enabled } = payload as { pluginId?: unknown; enabled?: unknown };
      if (typeof pluginId !== 'string' || !pluginId.trim() || typeof enabled !== 'boolean') return json({ error: 'Invalid payload' }, 400);
      await env.DB.prepare(`INSERT INTO plugin_enabled_overrides (user_id, plugin_id, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`).bind(identity.userId, pluginId.trim(), enabled ? 1 : 0, Date.now()).run();
      return json({ persisted: true });
    }
    if (!isPreferencesPath(pathname)) return json({ error: 'Not found' }, 404);

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT preferences_json, revision FROM user_preferences WHERE user_id = ?').bind(identity.userId).first<{ preferences_json: string; revision: number }>();
      return json(row ? { preferences: JSON.parse(row.preferences_json), revision: row.revision } : { preferences: null, revision: 0 });
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'Invalid payload' }, 400);
    const { preferences, revision } = payload as { preferences?: unknown; revision?: unknown };
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences) || !Number.isInteger(revision) || (revision as number) < 0) return json({ error: 'Invalid payload' }, 400);
    const preferencesJson = JSON.stringify(preferences);
    if (preferencesJson.length > 1048576) return json({ error: 'Preferences payload exceeds 1MB limit' }, 413);
    const stored = await env.DB.prepare('SELECT revision FROM user_preferences WHERE user_id = ?').bind(identity.userId).first<{ revision: number }>();
    const currentRevision = stored?.revision ?? 0;
    if (revision !== currentRevision) return json({ error: 'Preference revision conflict', revision: currentRevision }, 409);
    return json({ preferences, revision: nextRevision });
  },
};

export default worker;
