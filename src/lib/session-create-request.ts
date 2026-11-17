import type { KeikoCreateSession } from './keiko-api/client';
import { validateSessionPayload } from './session-validation';
import type { JudoSession } from './types';

export type PreparedSessionCreate =
  | { ok: true; session: JudoSession; keikoBody: KeikoCreateSession }
  | { ok: false; error: string };

/** Normalize a create body while leaving missing IDs to keyed Keiko creates. */
export function prepareSessionCreate(
  body: Record<string, unknown>,
  keyedKeikoCreate: boolean
): PreparedSessionCreate {
  const missingId = body.id === undefined || body.id === null;
  const deferGeneratedId = keyedKeikoCreate && missingId;
  const validationBody = deferGeneratedId
    ? { ...body, id: 'pending-idempotency-session' }
    : body;
  const validation = validateSessionPayload(validationBody, {
    generateIdWhenMissing: !deferGeneratedId,
  });
  if (!validation.ok) return validation;

  const keikoBody = deferGeneratedId
    ? (({ id: _placeholderId, ...sessionWithoutId }) => sessionWithoutId)(validation.session)
    : validation.session;
  return { ok: true, session: validation.session, keikoBody };
}
