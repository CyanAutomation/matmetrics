import { JudoSession } from '@/lib/types';
import { validateSessionId } from '@/lib/validators/session-id';
import { validateSessionFields } from './session-validation-fields';

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

  const fieldsResult = validateSessionFields(payload);
  if (!fieldsResult.ok) return fieldsResult;

  // Build and return validated session object
  return {
    ok: true,
    session: {
      id: idResult.value,
      ...fieldsResult.values,
      ...(typeof payload.revisionSha === 'string' && payload.revisionSha
        ? { revisionSha: payload.revisionSha }
        : {}),
    },
  };
}
