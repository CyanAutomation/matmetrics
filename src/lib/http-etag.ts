/** Apply the weak comparison required for If-None-Match on GET responses. */
export function ifNoneMatchMatches(
  header: string | null,
  etag: string
): boolean {
  if (!header) return false;

  return header.split(',').some((candidate) => {
    const value = candidate.trim();
    return value === '*' || value === etag || value === `W/${etag}`;
  });
}
