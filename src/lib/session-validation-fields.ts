import type { JudoSession } from '@/lib/types';
import { sessionFieldsSchema } from '@/lib/validators/session-schema';
import { validateTechniques } from '@/lib/validators/techniques';
import { validateVideoUrl } from '@/lib/validators/video-url';
import { ZodError } from 'zod';

type FieldResult =
  | { ok: true; values: Omit<JudoSession, 'id'> }
  | { ok: false; error: string };

/**
 * Validates session fields using Zod schema.
 * Returns normalized values with techniques deduplicated and optional fields filtered.
 */
export function validateSessionFields(
  payload: Record<string, unknown>
): FieldResult {
  try {
    const validated = sessionFieldsSchema.parse(payload);

    // Get normalized techniques (deduplicated)
    const techniquesResult = validateTechniques(validated.techniques);
    if (!techniquesResult.ok) {
      return techniquesResult;
    }

    // Get normalized video URL (undefined for empty strings)
    const videoUrlResult = validateVideoUrl(validated.videoUrl);
    if (!videoUrlResult.ok) {
      return videoUrlResult;
    }

    return {
      ok: true,
      values: {
        date: validated.date,
        effort: validated.effort,
        category: validated.category,
        techniques: techniquesResult.value,
        ...(validated.description !== undefined && {
          description: validated.description,
        }),
        ...(validated.notes !== undefined && { notes: validated.notes }),
        ...(videoUrlResult.value !== undefined && {
          videoUrl: videoUrlResult.value,
        }),
        ...(validated.duration !== undefined && {
          duration: validated.duration,
        }),
      },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      // Return just the message without field prefix since custom validators
      // already include the field name in their error messages
      return {
        ok: false,
        error: firstError.message,
      };
    }
    return { ok: false, error: 'Invalid session data' };
  }
}
