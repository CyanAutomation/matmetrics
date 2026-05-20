import { JudoSession } from '@/lib/types';
import { validateDate } from '@/lib/validators/date';
import { validateVideoUrl } from '@/lib/validators/video-url';
import { validateTechniques } from '@/lib/validators/techniques';
import { validateSessionId } from '@/lib/validators/session-id';

export type ValidationResult =
  | { ok: true; session: JudoSession }
  | { ok: false; error: string };

export function validateSessionPayload(
  payload: Record<string, unknown>,
  options: { routeId?: string; generateIdWhenMissing: boolean }
): ValidationResult {
  // Validate ID
  const idResult = validateSessionId(
    options.routeId ?? payload.id,
    options.generateIdWhenMissing
  );
  if (!idResult.ok) return idResult;

  // Validate date (required)
  if (
    payload.date === undefined ||
    payload.date === null ||
    payload.date === ''
  ) {
    return { ok: false, error: 'Missing required field: date' };
  }

  const dateResult = validateDate(payload.date);
  if (!dateResult.ok) return dateResult;

  // Validate effort level (required, 1-5)
  if (
    !Number.isInteger(payload.effort) ||
    (payload.effort as number) < 1 ||
    (payload.effort as number) > 5
  ) {
    return {
      ok: false,
      error: 'Invalid effort level (must be an integer 1-5)',
    };
  }

  // Validate category (required)
  if (
    !['Technical', 'Randori', 'Shiai'].includes(String(payload.category))
  ) {
    return { ok: false, error: 'Invalid category' };
  }

  // Validate techniques (required, non-empty array)
  const techniquesResult = validateTechniques(payload.techniques);
  if (!techniquesResult.ok) return techniquesResult;

  // Validate optional string fields (description, notes)
  for (const field of ['description', 'notes'] as const) {
    const value = payload[field];
    if (value !== undefined && typeof value !== 'string') {
      return {
        ok: false,
        error: `Invalid ${field}: expected a string`,
      };
    }
  }

  // Validate video URL (optional)
  const videoUrlResult = validateVideoUrl(payload.videoUrl);
  if (!videoUrlResult.ok) return videoUrlResult;
  const videoUrl = videoUrlResult.value;

  // Validate duration (optional, non-negative integer)
  if (
    payload.duration !== undefined &&
    (!Number.isInteger(payload.duration) ||
      (payload.duration as number) < 0)
  ) {
    return {
      ok: false,
      error: 'Invalid duration: expected a non-negative integer',
    };
  }

  // Build and return validated session object
  return {
    ok: true,
    session: {
      id: idResult.value,
      date: dateResult.value,
      effort: payload.effort as 1 | 2 | 3 | 4 | 5,
      category: payload.category as JudoSession['category'],
      techniques: techniquesResult.value,
      ...(payload.description !== undefined && {
        description: payload.description as string,
      }),
      ...(payload.notes !== undefined && { notes: payload.notes as string }),
      ...(videoUrl !== undefined && { videoUrl }),
      ...(payload.duration !== undefined && {
        duration: payload.duration as number,
      }),
    },
  };
}
