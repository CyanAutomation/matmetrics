import createClient from 'openapi-fetch';
import type { components, paths } from './generated';

export type KeikoSessionListQuery = NonNullable<
  paths['/v1/sessions']['get']['parameters']['query']
>;
export type KeikoSession = components['schemas']['Session'];
export type KeikoSessionRecord = components['schemas']['SessionRecord'];
export type KeikoCreateSession = components['schemas']['CreateSessionRequest'];
export type KeikoUpdateSession = components['schemas']['UpdateSessionRequest'];

export type KeikoResponse = {
  response: Response;
  facadeResponse: Response;
  error?: KeikoHttpError;
};

export type KeikoErrorCategory =
  | 'authentication'
  | 'not_found'
  | 'conflict'
  | 'stale_revision'
  | 'missing_precondition'
  | 'rate_limited'
  | 'validation'
  | 'service'
  | 'http';

export type KeikoHttpError = {
  status: number;
  category: KeikoErrorCategory;
  code?: string;
  requestId?: string;
  retryable: boolean;
  retryAfterMs?: number;
};

export class KeikoTransportError extends Error {
  readonly category = 'transport';
  readonly retryable = true;

  constructor() {
    super('Keiko request could not reach the service.');
    this.name = 'KeikoTransportError';
  }
}

function readRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.max(0, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function classifyKeikoError(response: Response, body: unknown): KeikoHttpError {
  const status = response.status;
  const category: KeikoErrorCategory =
    status === 401 || status === 403 ? 'authentication' :
    status === 404 ? 'not_found' :
    status === 409 ? 'conflict' :
    status === 412 ? 'stale_revision' :
    status === 428 ? 'missing_precondition' :
    status === 429 ? 'rate_limited' :
    status === 400 || status === 413 || status === 415 || status === 422 ? 'validation' :
    status >= 500 ? 'service' : 'http';
  const result: KeikoHttpError = {
    status,
    category,
    retryable: status === 408 || status === 425 || status === 429 || status >= 500,
  };
  if (body && typeof body === 'object') {
    if ('error' in body && body.error && typeof body.error === 'object' && 'code' in body.error && typeof body.error.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.error.code)) {
      result.code = body.error.code;
    }
    if ('requestId' in body && typeof body.requestId === 'string' && body.requestId.length <= 128) {
      result.requestId = body.requestId;
    }
  }
  const requestIdHeader = response.headers.get('x-request-id');
  if (!result.requestId && requestIdHeader && requestIdHeader.length <= 128) {
    result.requestId = requestIdHeader;
  }
  const retryAfterMs = readRetryAfterMs(response.headers.get('retry-after'));
  if (retryAfterMs !== undefined) result.retryAfterMs = retryAfterMs;
  return result;
}

/** A per-request OpenAPI client; credentials and abort behavior stay server-side. */
export function createKeikoApiClient(
  baseUrl: string,
  bearerToken: string
) {
  let responseForFacade: Response | undefined;
  const client = createClient<paths>({
    baseUrl,
    headers: { authorization: `Bearer ${bearerToken}` },
    fetch: async (request) => {
      let response: Response;
      try {
        response = await fetch(request, {
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new KeikoTransportError();
      }
      responseForFacade = response.clone();
      return response;
    },
  });

  return {
    async listSessions(query: KeikoSessionListQuery): Promise<KeikoResponse> {
      const result = await client.GET('/v1/sessions', { params: { query } });
      return makeKeikoResponse(result.response, takeFacadeResponse());
    },
    async getSession(id: string): Promise<KeikoResponse> {
      const result = await client.GET('/v1/sessions/{id}', { params: { path: { id } } });
      return makeKeikoResponse(result.response, takeFacadeResponse());
    },
    async createSession(body: KeikoCreateSession): Promise<KeikoResponse> {
      const result = await client.POST('/v1/sessions', { body });
      return makeKeikoResponse(result.response, takeFacadeResponse());
    },
    async updateSession(id: string, body: KeikoUpdateSession, ifMatch: string | undefined): Promise<KeikoResponse> {
      const result = await client.PUT('/v1/sessions/{id}', {
        params: {
          path: { id },
          // Missing preconditions intentionally reach Keiko for its canonical 428.
          header: ifMatch === undefined ? ({} as never) : { 'If-Match': ifMatch },
        },
        body,
      });
      return makeKeikoResponse(result.response, takeFacadeResponse());
    },
    async deleteSession(id: string, ifMatch: string | undefined): Promise<KeikoResponse> {
      const result = await client.DELETE('/v1/sessions/{id}', {
        params: {
          path: { id },
          // Preserve 428 semantics for operations whose original revision is absent.
          header: ifMatch === undefined ? ({} as never) : { 'If-Match': ifMatch },
        },
      });
      return makeKeikoResponse(result.response, takeFacadeResponse());
    },
  };

  function takeFacadeResponse(): Response {
    if (!responseForFacade) throw new Error('Keiko response was not captured');
    const response = responseForFacade;
    responseForFacade = undefined;
    return response;
  }

  async function makeKeikoResponse(response: Response, facadeResponse: Response): Promise<KeikoResponse> {
    if (response.ok) return { response, facadeResponse };
    let envelope: unknown;
    try {
      envelope = await facadeResponse.clone().json();
    } catch {
      envelope = undefined;
    }
    return { response, facadeResponse, error: classifyKeikoError(response, envelope) };
  }
}
