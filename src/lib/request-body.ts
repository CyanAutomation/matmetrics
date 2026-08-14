export type JsonObjectBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      reason: 'invalid-json' | 'not-an-object' | 'body-too-large';
    };

/** Parse a required JSON object without hiding unexpected request failures. */
export async function parseJsonObjectBody(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<JsonObjectBodyResult> {
  let value: unknown;

  try {
    if (options.maxBytes !== undefined) {
      const declaredLength = request.headers.get('content-length');
      if (
        declaredLength !== null &&
        Number.isFinite(Number(declaredLength)) &&
        Number(declaredLength) > options.maxBytes
      ) {
        return { ok: false, reason: 'body-too-large' };
      }

      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > options.maxBytes) {
        return { ok: false, reason: 'body-too-large' };
      }
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      );
    } else {
      value = await request.json();
    }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return { ok: false, reason: 'invalid-json' };
    }
    throw error;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'not-an-object' };
  }

  return { ok: true, value: value as Record<string, unknown> };
}
