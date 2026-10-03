import { NextResponse } from 'next/server';

import { PersistentSessionStorageUnavailableError } from './session-storage';

export function persistentSessionStorageUnavailableResponse(
  error: unknown
): NextResponse | null {
  if (!(error instanceof PersistentSessionStorageUnavailableError)) {
    return null;
  }

  return NextResponse.json({ error: error.message }, { status: 503 });
}
