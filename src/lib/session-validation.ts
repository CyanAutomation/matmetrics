import crypto from 'crypto';
import { isBlockedNetworkHostname } from '@/lib/network-safety';
import { JudoSession } from '@/lib/types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_SESSION_ID_LENGTH = 100;

export type ValidationResult =
  | { ok: true; session: JudoSession }
  | { ok: false; error: string };

function validateDate(dateValue: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof dateValue !== 'string') return { ok: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) return { ok: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
    return { ok: false, error: 'Invalid date: must be a real calendar date' };
  }
  return { ok: true, value: dateValue };
}

function validateSessionId(value: unknown, generateWhenMissing: boolean): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    if (!generateWhenMissing) return { ok: false, error: 'Missing required field: id' };
    return { ok: true, value: `session-${Date.now()}-${crypto.randomUUID()}` };
  }
  if (typeof value !== 'string') return { ok: false, error: 'Invalid id: expected a string' };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: 'Invalid id: expected a non-empty string' };
  if (trimmed.length > MAX_SESSION_ID_LENGTH) return { ok: false, error: `Invalid id: exceeds maximum length of ${MAX_SESSION_ID_LENGTH} characters` };
  if (!SAFE_SESSION_ID_PATTERN.test(trimmed)) return { ok: false, error: 'Invalid id: contains invalid characters; only letters, digits, "-" and "_" are allowed' };
  return { ok: true, value: trimmed };
}

export function validateSessionPayload(payload: Record<string, unknown>, options: { routeId?: string; generateIdWhenMissing: boolean }): ValidationResult {
  const idResult = validateSessionId(options.routeId ?? payload.id, options.generateIdWhenMissing);
  if (!idResult.ok) return idResult;
  if (payload.date === undefined || payload.date === null || payload.date === '') return { ok: false, error: 'Missing required field: date' };
  const date = validateDate(payload.date);
  if (!date.ok) return date;
  if (!Number.isInteger(payload.effort) || (payload.effort as number) < 1 || (payload.effort as number) > 5) return { ok: false, error: 'Invalid effort level (must be an integer 1-5)' };
  if (!['Technical', 'Randori', 'Shiai'].includes(String(payload.category))) return { ok: false, error: 'Invalid category' };
  if (!Array.isArray(payload.techniques)) return { ok: false, error: 'Invalid techniques: expected an array of non-empty strings' };
  const techniques: string[] = [];
  for (let i = 0; i < payload.techniques.length; i += 1) {
    const t = payload.techniques[i];
    if (typeof t !== 'string') return { ok: false, error: `Invalid techniques[${i}]: expected a string` };
    const trimmed = t.trim();
    if (!trimmed) return { ok: false, error: `Invalid techniques[${i}]: value cannot be empty` };
    techniques.push(trimmed);
  }
  for (const field of ['description', 'notes'] as const) {
    const value = payload[field];
    if (value !== undefined && typeof value !== 'string') return { ok: false, error: `Invalid ${field}: expected a string` };
  }
  let videoUrl: string | undefined;
  if (payload.videoUrl !== undefined) {
    if (typeof payload.videoUrl !== 'string') return { ok: false, error: 'Invalid videoUrl: expected a string' };
    const trimmed = payload.videoUrl.trim();
    if (trimmed) {
      let parsed: URL;
      try { parsed = new URL(trimmed); } catch { return { ok: false, error: 'Invalid videoUrl: expected a valid absolute URL' }; }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'Invalid videoUrl: protocol must be http or https' };
      if (isBlockedNetworkHostname(parsed.hostname)) return { ok: false, error: 'Invalid videoUrl: private or internal network addresses are not allowed' };
      videoUrl = parsed.toString();
    }
  }
  if (payload.duration !== undefined && (!Number.isInteger(payload.duration) || (payload.duration as number) < 0)) return { ok: false, error: 'Invalid duration: expected a non-negative integer' };
  return { ok: true, session: { id: idResult.value, date: date.value, effort: payload.effort as 1|2|3|4|5, category: payload.category as JudoSession['category'], techniques: [...new Set(techniques)], ...(payload.description !== undefined && { description: payload.description as string }), ...(payload.notes !== undefined && { notes: payload.notes as string }), ...(videoUrl !== undefined && { videoUrl }), ...(payload.duration !== undefined && { duration: payload.duration as number }) } };
}
