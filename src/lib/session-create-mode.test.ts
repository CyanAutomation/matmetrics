import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSessionCreateMode,
  parseSessionCreateMode,
  SESSION_CREATE_MODE_HEADER,
} from './session-create-mode';

test('parses only the server-defined session create modes', () => {
  assert.equal(parseSessionCreateMode('legacy'), 'legacy');
  assert.equal(parseSessionCreateMode('keiko-idempotent'), 'keiko-idempotent');
  assert.equal(parseSessionCreateMode('keiko-unavailable'), 'keiko-unavailable');
  assert.equal(parseSessionCreateMode('keiko'), null);
  assert.equal(parseSessionCreateMode('*'), null);
  assert.equal(parseSessionCreateMode(null), null);
});

test('only the authenticated server-side cutover and rollout flag enable Keiko creates', () => {
  assert.equal(getSessionCreateMode(false, 'true'), 'legacy');
  assert.equal(getSessionCreateMode(true, 'true'), 'keiko-idempotent');
  assert.equal(getSessionCreateMode(true, 'false'), 'keiko-unavailable');
  assert.equal(getSessionCreateMode(true, 'TRUE'), 'keiko-unavailable');
  assert.equal(getSessionCreateMode(true, undefined), 'keiko-unavailable');
});

test('uses a dedicated header for the authenticated server routing decision', () => {
  assert.equal(SESSION_CREATE_MODE_HEADER, 'x-matmetrics-session-create-mode');
});
