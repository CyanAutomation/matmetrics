import { createHash, createHmac } from 'node:crypto';

const SIGNATURE_VERSION = 'v1';
export const DATA_WORKER_REQUEST_TIMEOUT_MS = 8_000;

export class DataWorkerError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'DataWorkerError';
  }
}

export function isDataWorkerConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_DATA_WORKER_URL &&
    process.env.MATMETRICS_INTERNAL_API_SECRET
  );
}

export function createDataWorkerSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(
      `${SIGNATURE_VERSION}.${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`
    )
    .digest('hex');
}

export async function requestDataWorker<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    userId: string;
    body?: unknown;
  }
): Promise<T> {
  const baseUrl = process.env.CLOUDFLARE_DATA_WORKER_URL;
  const secret = process.env.MATMETRICS_INTERNAL_API_SECRET;
  if (!baseUrl || !secret) {
    throw new Error('Cloudflare data Worker is not configured');
  }

  const url = new URL(path, baseUrl);
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('Cloudflare data Worker URL must use HTTPS in production');
  }

  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DATA_WORKER_REQUEST_TIMEOUT_MS
  );
  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${createDataWorkerSignature(secret, timestamp, options.method, url.pathname, body)}`,
        'Content-Type': 'application/json',
        'X-Matmetrics-Timestamp': timestamp,
        'X-Matmetrics-User-Id': options.userId,
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DataWorkerError(
        `Cloudflare data Worker request timed out after ${DATA_WORKER_REQUEST_TIMEOUT_MS}ms`,
        504
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new DataWorkerError(
      typeof payload?.error === 'string'
        ? payload.error
        : `Cloudflare data Worker request failed (${response.status})`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}
