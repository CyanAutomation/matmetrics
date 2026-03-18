import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServiceAccountKey } from './firebase-admin';

test('parseServiceAccountKey returns null for malformed JSON', () => {
  assert.equal(parseServiceAccountKey('{bad json'), null);
});

test('parseServiceAccountKey returns null for incomplete JSON payload', () => {
  assert.equal(
    parseServiceAccountKey(
      JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
      })
    ),
    null
  );
});

test('parseServiceAccountKey normalizes escaped private key newlines', () => {
  assert.deepEqual(
    parseServiceAccountKey(
      JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\\nline-2',
      })
    ),
    {
      project_id: 'project-id',
      client_email: 'service@example.com',
      private_key: 'line-1\nline-2',
    }
  );
});
