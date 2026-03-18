import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServiceAccountKey } from './firebase-admin';

test('parseServiceAccountKey rejects malformed or incomplete credentials', async (t) => {
  await t.test('malformed JSON', () => {
    assert.equal(parseServiceAccountKey('{bad json'), null);
  });

  await t.test('missing required fields', () => {
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
