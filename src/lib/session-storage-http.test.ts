import assert from 'node:assert/strict';
import test from 'node:test';
import { PersistentSessionStorageUnavailableError } from './session-storage';
import { persistentSessionStorageUnavailableResponse } from './session-storage-http';

test('persistent storage configuration failures return a service-unavailable response', async () => {
  const response = persistentSessionStorageUnavailableResponse(
    new PersistentSessionStorageUnavailableError()
  );

  assert.ok(response);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error:
      'Session storage requires a configured GitHub repository and GITHUB_TOKEN on Vercel.',
  });
});

test('unrelated session storage errors are not converted to configuration responses', () => {
  assert.equal(
    persistentSessionStorageUnavailableResponse(new Error('unexpected')),
    null
  );
});
