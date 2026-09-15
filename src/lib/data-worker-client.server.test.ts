import assert from 'node:assert/strict';
import test from 'node:test';

import { createDataWorkerSignature } from './data-worker-client.server';

test('data Worker signatures bind the method, path, timestamp, and body', () => {
  const secret = 'test-secret';
  const baseline = createDataWorkerSignature(
    secret,
    '1700000000',
    'PUT',
    '/v1/preferences',
    '{"preferences":{}}'
  );

  assert.equal(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'put',
      '/v1/preferences',
      '{"preferences":{}}'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/preferences',
      '{"preferences":{"changed":true}}'
    )
  );
  assert.notEqual(
    baseline,
    createDataWorkerSignature(
      secret,
      '1700000000',
      'PUT',
      '/v1/plugin-overrides',
      '{"preferences":{}}'
    )
  );
});
