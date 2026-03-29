import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLogDoctorFixErrorResponse } from './route';

const INVALID_PROXY_ERROR =
  'Invalid MATMETRICS_GO_PROXY_BASE_URL; expected absolute URL such as https://host:port';

test('log-doctor fix route maps malformed proxy base URL to a configuration-specific 500 message', async () => {
  const response = buildLogDoctorFixErrorResponse(new Error(INVALID_PROXY_ERROR));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    message:
      'Log-doctor fix failed: MATMETRICS_GO_PROXY_BASE_URL is invalid. This is a server configuration issue; update the proxy base URL to an absolute URL such as https://host:port.',
  });
});
