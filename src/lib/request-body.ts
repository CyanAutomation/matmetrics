export type JsonObjectBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'invalid-json' | 'not-an-object' };

/** Parse a required JSON object without hiding unexpected request failures. */
export async function parseJsonObjectBody(
  request: Request
): Promise<JsonObjectBodyResult> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, reason: 'invalid-json' };
    }
    throw error;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'not-an-object' };
  }

  return { ok: true, value: value as Record<string, unknown> };
}
