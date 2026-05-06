/**
 * Shared utilities for log-doctor plugin
 */

export type LogDoctorDestructiveAction = 'apply-fixes' | 'reset-diagnostics-state';
export type LogDoctorDestructiveStage = 'opened' | 'confirmed' | 'canceled' | 'undone';

const ABORTED_REQUEST_REASON = 'Request canceled';

/**
 * Convert error to user-friendly reason string
 */
export const toErrorReason = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return ABORTED_REQUEST_REASON;
  }

  if (
    typeof error === 'object' &&
    error &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  ) {
    return ABORTED_REQUEST_REASON;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unexpected response from the service.';
};

/**
 * Check if content type is JSON
 */
const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') || normalized.includes('+json')
  );
};

/**
 * Get route hint from response URL
 */
const getRouteHint = (response: Response): string => {
  try {
    if (!response.url) {
      return 'unknown route';
    }
    const parsed = new URL(response.url);
    return parsed.pathname || response.url;
  } catch {
    return response.url || 'unknown route';
  }
};

/**
 * Parse and validate API response
 */
export const parseApiResponse = async <T,>(response: Response): Promise<T> => {
  const statusLabel = `HTTP ${response.status}`;
  const routeHint = getRouteHint(response);
  const contentType = response.headers.get('content-type');

  if (isJsonContentType(contentType)) {
    let payload: T;
    try {
      payload = (await response.json()) as T;
    } catch {
      throw new Error(`Service returned malformed JSON (${statusLabel}).`);
    }

    if (!response.ok) {
      const maybeMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? String(
              (payload as { message?: unknown }).message ?? 'Request failed'
            )
          : `Request failed (${statusLabel})`;
      throw new Error(maybeMessage);
    }

    return payload;
  }

  const rawText = (await response.text()).trim();
  const bodyHint = rawText
    ? ` Response body: ${rawText.slice(0, 160)}${rawText.length > 160 ? '…' : ''}`
    : '';
  throw new Error(
    `Service returned non-JSON response (${statusLabel}) from ${routeHint}.${bodyHint}`
  );
};

/**
 * Emit destructive action event for analytics/logging
 */
export const emitDestructiveActionEvent = (
  action: LogDoctorDestructiveAction,
  stage: LogDoctorDestructiveStage,
  metadata?: Record<string, string | number | boolean>
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('logDoctorDestructiveAction', {
      detail: {
        action,
        stage,
        metadata: metadata ?? {},
      },
    })
  );
};
