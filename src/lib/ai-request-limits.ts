/** Maximum UTF-8 sizes accepted by model-backed API routes. */
export const AI_REQUEST_BODY_MAX_BYTES = 16 * 1024;
export const AI_DESCRIPTION_MAX_BYTES = 8 * 1024;
export const AI_CUSTOM_PROMPT_MAX_BYTES = 2 * 1024;

export function exceedsUtf8Limit(value: string, maxBytes: number): boolean {
  return new TextEncoder().encode(value).byteLength > maxBytes;
}
