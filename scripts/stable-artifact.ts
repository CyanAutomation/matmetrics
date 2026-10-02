function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((result, [key, nestedValue]) => {
        result[key] = stableNormalize(nestedValue);
        return result;
      }, {});
  }

  return value;
}

export function serializeStableArtifact(value: unknown): string {
  return `${JSON.stringify(stableNormalize(value), null, 2)}\n`;
}

export async function digestStableArtifact(value: unknown): Promise<string> {
  const normalized = JSON.stringify(stableNormalize(value));
  const bytes = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
