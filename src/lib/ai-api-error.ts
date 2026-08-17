export const AI_API_ERROR_CODES = [
  'INVALID_REQUEST',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'AUTH_REQUIRED',
  'INPUT_TOO_LARGE',
  'INVALID_AI_RESPONSE',
  'UNKNOWN_ERROR',
] as const;

export type AiApiErrorCode = (typeof AI_API_ERROR_CODES)[number];

export interface AiApiErrorResponse {
  error: {
    code: AiApiErrorCode;
    message: string;
  };
}

export class InvalidAiResponseError extends Error {
  constructor() {
    super('The AI model returned an empty or invalid response');
    this.name = 'InvalidAiResponseError';
  }
}

const ERROR_DETAILS: Record<
  AiApiErrorCode,
  { status: number; message: string }
> = {
  INVALID_REQUEST: { status: 400, message: 'The request is invalid.' },
  RATE_LIMITED: {
    status: 429,
    message: 'The AI request limit has been reached. Please try again later.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message:
      'The AI service is temporarily unavailable. Please try again later.',
  },
  AUTH_REQUIRED: {
    status: 401,
    message: 'AI service authentication is required.',
  },
  INPUT_TOO_LARGE: {
    status: 413,
    message: 'The request is too large. Shorten it and try again.',
  },
  INVALID_AI_RESPONSE: {
    status: 502,
    message: 'The AI service returned an unusable response. Please try again.',
  },
  UNKNOWN_ERROR: {
    status: 500,
    message: 'The description could not be transformed. Please try again.',
  },
};

export function aiApiError(code: AiApiErrorCode): {
  body: AiApiErrorResponse;
  status: number;
} {
  const details = ERROR_DETAILS[code];
  return {
    body: { error: { code, message: details.message } },
    status: details.status,
  };
}

function errorProperties(error: unknown): {
  code?: number | string;
  message?: string;
  status?: number | string;
} {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) {
    return {};
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  return {
    code:
      typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? candidate.code
        : undefined,
    message:
      typeof candidate.message === 'string' ? candidate.message : undefined,
    status:
      typeof candidate.status === 'string' ||
      typeof candidate.status === 'number'
        ? candidate.status
        : undefined,
  };
}

export function classifyAiError(error: unknown): AiApiErrorCode {
  if (error instanceof InvalidAiResponseError) return 'INVALID_AI_RESPONSE';

  const { code, message = '', status } = errorProperties(error);
  const identifiers = [code, status]
    .map((value) => String(value ?? '').toUpperCase())
    .filter(Boolean);

  // Cloudflare-specific error messages
  if (
    /cloudflare ai authentication failed/i.test(message) ||
    /CLOUDFLARE_API_TOKEN.*not set/i.test(message)
  ) {
    return 'AUTH_REQUIRED';
  }
  if (/cloudflare ai rate limit/i.test(message)) {
    return 'RATE_LIMITED';
  }
  if (/cloudflare ai service unavailable/i.test(message)) {
    return 'SERVICE_UNAVAILABLE';
  }

  if (
    identifiers.some((value) => ['429', 'RESOURCE_EXHAUSTED'].includes(value))
  )
    return 'RATE_LIMITED';
  if (
    identifiers.some((value) =>
      ['401', '403', 'UNAUTHENTICATED', 'PERMISSION_DENIED'].includes(value)
    )
  )
    return 'AUTH_REQUIRED';
  if (
    identifiers.includes('413') ||
    identifiers.includes('OUT_OF_RANGE') ||
    (identifiers.includes('INVALID_ARGUMENT') &&
      /(?:context|input|payload|request|token).*(?:large|length|limit|long)/i.test(
        message
      ))
  )
    return 'INPUT_TOO_LARGE';
  if (
    identifiers.some((value) =>
      [
        '408',
        '500',
        '502',
        '503',
        '504',
        'ABORTED',
        'DEADLINE_EXCEEDED',
        'INTERNAL',
        'UNAVAILABLE',
      ].includes(value)
    )
  )
    return 'SERVICE_UNAVAILABLE';
  return 'UNKNOWN_ERROR';
}
