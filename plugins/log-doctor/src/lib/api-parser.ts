/**
 * Parses API responses from log-doctor endpoints.
 * Handles JSON parsing, error extraction, and consistent error formatting.
 */
export const parseLogDoctorApiResponse = async <T,>(
  response: Response
): Promise<T> => {
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

const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') || normalized.includes('+json')
  );
};

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
