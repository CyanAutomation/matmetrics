export const AI_API_ERROR_CODES = [
  'INVALID_REQUEST',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'AUTH_REQUIRED',
  'INPUT_TOO_LARGE',
  'INVALID_AI_RESPONSE',
  'AI_PROVIDER_REJECTED',
  'UNKNOWN_ERROR',
] as const;

export type AiApiErrorCode = (typeof AI_API_ERROR_CODES)[number];

export interface AiApiErrorResponse {
  error: {
    code: AiApiErrorCode;
    message: string;
    providerStatus?: number;
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
  AI_PROVIDER_REJECTED: {
    status: 502,
    message: 'The AI provider rejected the check-in request.',
  },
  UNKNOWN_ERROR: {
    status: 500,
    message: 'The AI request could not be completed. Please try again.',
  },
};

export function aiApiError(
  code: AiApiErrorCode,
  options: { providerStatus?: number } = {}
): {
  body: AiApiErrorResponse;
  status: number;
} {
  const details = ERROR_DETAILS[code];
  const providerStatus = options.providerStatus;
  return {
    body: {
      error: {
        code,
        message: details.message,
        ...(isHttpStatus(providerStatus) ? { providerStatus } : {}),
      },
    },
    status: details.status,
  };
}

function isHttpStatus(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  );
}

const CHECKIN_FALLBACK_MESSAGE =
  'The training check-in could not be completed. Please try again.';

/**
 * Maps only allow-listed API error codes to user-facing copy. Provider text is
 * intentionally ignored because it can include private request content.
 */
export function getAiApiErrorMessage(value: unknown): string {
  if (!value || typeof value !== 'object') return CHECKIN_FALLBACK_MESSAGE;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return CHECKIN_FALLBACK_MESSAGE;
  const details = error as { code?: unknown; providerStatus?: unknown };

  switch (details.code) {
    case 'AUTH_REQUIRED': {
      if (isHttpStatus(details.providerStatus)) {
        return `OpenRouter rejected the JEV credential or denied access (HTTP ${details.providerStatus}). Check OPENROUTER_API_KEY in the Production environment.`;
      }
      return 'The JEV credential is missing or was rejected. Check OPENROUTER_API_KEY in the Production environment.';
    }
    case 'RATE_LIMITED':
      return isHttpStatus(details.providerStatus)
        ? `OpenRouter rate limited the JEV check-in (HTTP ${details.providerStatus}). Wait a moment and try again.`
        : 'OpenRouter rate limited the JEV check-in. Wait a moment and try again.';
    case 'SERVICE_UNAVAILABLE':
      return isHttpStatus(details.providerStatus)
        ? `OpenRouter is temporarily unavailable (HTTP ${details.providerStatus}). Please try again shortly.`
        : 'OpenRouter is temporarily unavailable. Please try again shortly.';
    case 'INPUT_TOO_LARGE':
      return 'The check-in text is too long. Shorten the description or notes and try again.';
    case 'INVALID_AI_RESPONSE':
      return 'JEV returned an unexpected response. Please try again.';
    case 'AI_PROVIDER_REJECTED': {
      const status = details.providerStatus;
      if (!isHttpStatus(status)) return CHECKIN_FALLBACK_MESSAGE;
      return `OpenRouter rejected the JEV request (HTTP ${status}). Check the Vercel function logs for the same status.`;
    }
    default:
      return CHECKIN_FALLBACK_MESSAGE;
  }
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

  // Provider authentication and availability failures.
  if (
    /cloudflare ai authentication failed/i.test(message) ||
    /CLOUDFLARE_API_TOKEN.*not set/i.test(message) ||
    /OPENROUTER_API_KEY.*not set/i.test(message)
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
  if (
    identifiers.some((value) => {
      const statusCode = Number(value);
      return (
        Number.isInteger(statusCode) && statusCode >= 500 && statusCode <= 599
      );
    })
  )
    return 'SERVICE_UNAVAILABLE';
  if (
    identifiers.some((value) => {
      const statusCode = Number(value);
      return (
        Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 499
      );
    })
  )
    return 'AI_PROVIDER_REJECTED';
  return 'UNKNOWN_ERROR';
}

/** Returns only a validated HTTP status for safe diagnostics. */
export function getAiErrorProviderStatus(error: unknown): number | undefined {
  const { status } = errorProperties(error);
  const providerStatus = Number(status);
  return isHttpStatus(providerStatus) ? providerStatus : undefined;
}
