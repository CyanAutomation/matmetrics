import { createHash, createHmac } from 'node:crypto';

const SIGNATURE_VERSION = 'v2';
export const DATA_WORKER_REQUEST_TIMEOUT_MS = 8_000;

export type DataWorkerAuthFailure =
  | 'expired-signature'
  | 'request-rejected'
  | 'access-denied';

export class DataWorkerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly category:
      | 'authentication'
      | 'configuration'
      | 'unavailable' = 'unavailable',
    readonly upstreamStatus?: number,
    readonly upstreamAuthFailure?: DataWorkerAuthFailure
  ) {
    super(message);
    this.name = 'DataWorkerError';
  }
}

export function isDataWorkerConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_DATA_WORKER_URL?.trim() &&
    process.env.MATMETRICS_INTERNAL_API_SECRET?.trim()
  );
}

export function createDataWorkerSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
  userId: string
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(JSON.stringify([
      SIGNATURE_VERSION,
      timestamp,
      method.toUpperCase(),
      path,
      userId,
      bodyHash,
    ]))
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
  const baseUrl = process.env.CLOUDFLARE_DATA_WORKER_URL?.trim();
  const secret =
    process.env.MATMETRICS_INTERNAL_API_SECRET?.trim() || undefined;
  if (!baseUrl || !secret) {
    throw new DataWorkerError(
      'The background data service is not configured. Please contact the site administrator.',
      503,
      'configuration'
    );
  }

  let url: URL;
  try {
    url = new URL(path, baseUrl);
  } catch {
    throw new DataWorkerError(
      'The background data service is not configured correctly. Please contact the site administrator.',
      503,
      'configuration'
    );
  }
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new DataWorkerError(
      'The background data service is not configured securely. Please contact the site administrator.',
      503,
      'configuration'
    );
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
        Authorization: `Bearer ${createDataWorkerSignature(
          secret,
          timestamp,
          options.method,
          `${url.pathname}${url.search}`,
          body,
          options.userId
        )}`,
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
        'The background data service did not respond in time. Please try again.',
        504
      );
    }
    if (error instanceof TypeError) {
      throw new DataWorkerError(
        'The background data service is temporarily unavailable. Please try again.',
        503
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      const upstreamAuthFailure: DataWorkerAuthFailure =
        response.status === 403
          ? 'access-denied'
          : payload?.error === 'Expired signature'
            ? 'expired-signature'
            : 'request-rejected';
      throw new DataWorkerError(
        'The background data service rejected request authentication.',
        503,
        'authentication',
        response.status,
        upstreamAuthFailure
      );
    }
    if (response.status >= 500) {
      throw new DataWorkerError(
        'The background data service is temporarily unavailable. Please try again.',
        503
      );
    }
    throw new DataWorkerError(
      'The background data service rejected the request.',
      response.status
    );
  }

  return response.json() as Promise<T>;
}
