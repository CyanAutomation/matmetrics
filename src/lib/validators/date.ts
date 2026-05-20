/**
 * Date validation utilities
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validateDate(
  dateValue: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof dateValue !== 'string') {
    return { ok: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    return { ok: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  // Validate the date is a real calendar date
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return { ok: false, error: 'Invalid date: must be a real calendar date' };
  }

  return { ok: true, value: dateValue };
}
