import type { JudoSession } from '@/lib/types';
import { validateDate } from '@/lib/validators/date';
import { validateTechniques } from '@/lib/validators/techniques';
import { validateVideoUrl } from '@/lib/validators/video-url';

type FieldResult =
  | { ok: true; values: Omit<JudoSession, 'id'> }
  | { ok: false; error: string };

export function validateSessionFields(
  payload: Record<string, unknown>
): FieldResult {
  if (
    payload.date === undefined ||
    payload.date === null ||
    payload.date === ''
  ) {
    return { ok: false, error: 'Missing required field: date' };
  }
  const dateResult = validateDate(payload.date);
  if (!dateResult.ok) return dateResult;

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

  if (!['Technical', 'Randori', 'Shiai'].includes(String(payload.category))) {
    return { ok: false, error: 'Invalid category' };
  }

  const techniquesResult = validateTechniques(payload.techniques);
  if (!techniquesResult.ok) return techniquesResult;

  for (const field of ['description', 'notes'] as const) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') {
      return { ok: false, error: `Invalid ${field}: expected a string` };
    }
  }

  const videoUrlResult = validateVideoUrl(payload.videoUrl);
  if (!videoUrlResult.ok) return videoUrlResult;

  if (
    payload.duration !== undefined &&
    (!Number.isInteger(payload.duration) || (payload.duration as number) < 0)
  ) {
    return {
      ok: false,
      error: 'Invalid duration: expected a non-negative integer',
    };
  }

  return {
    ok: true,
    values: {
      date: dateResult.value,
      effort: payload.effort as JudoSession['effort'],
      category: payload.category as JudoSession['category'],
      techniques: techniquesResult.value,
      ...(payload.description !== undefined && {
        description: payload.description as string,
      }),
      ...(payload.notes !== undefined && { notes: payload.notes as string }),
      ...(videoUrlResult.value !== undefined && {
        videoUrl: videoUrlResult.value,
      }),
      ...(payload.duration !== undefined && {
        duration: payload.duration as number,
      }),
    },
  };
}
