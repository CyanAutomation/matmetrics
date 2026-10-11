import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServiceAccountKey } from './firebase-admin';

type ParseCase = {
  name: string;
  raw: string | undefined;
  expected: {
    project_id: string;
    client_email: string;
    private_key: string;
  } | null;
};

test('parseServiceAccountKey table-driven behavior', async (t) => {
  const cases: ParseCase[] = [
    {
      name: 'returns null for undefined input',
      raw: undefined,
      expected: null,
    },
    {
      name: 'returns null for malformed JSON',
      raw: '{bad json',
      expected: null,
    },
    {
      name: 'returns null when required fields are missing',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
      }),
      expected: null,
    },
    {
      name: 'rejects non-string project_id',
      raw: JSON.stringify({
        project_id: 123,
        client_email: 'service@example.com',
        private_key: 'line-1\\nline-2',
      }),
      expected: null,
    },
    {
      name: 'rejects non-string client_email',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: false,
        private_key: 'line-1\\nline-2',
      }),
      expected: null,
    },
    {
      name: 'rejects non-string private_key',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: { value: 'line-1\\nline-2' },
      }),
      expected: null,
    },
    {
      name: 'rejects empty project_id after trimming',
      raw: JSON.stringify({
        project_id: '   ',
        client_email: 'service@example.com',
        private_key: 'line-1\\nline-2',
      }),
      expected: null,
    },
    {
      name: 'rejects empty client_email after trimming',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: '   ',
        private_key: 'line-1\\nline-2',
      }),
      expected: null,
    },
    {
      name: 'rejects empty private_key after trimming',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: '   ',
      }),
      expected: null,
    },
    {
      name: 'tolerates extra fields and returns exact parsed shape',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\\nline-2',
        extra_field: 'ignored',
      }),
      expected: {
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\nline-2',
      },
    },
    {
      name: 'rejects non-object JSON payload',
      raw: JSON.stringify([
        'project-id',
        'service@example.com',
        'line-1\\nline-2',
      ]),
      expected: null,
    },
    {
      name: 'normalizes escaped private key newlines',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\\nline-2',
      }),
      expected: {
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\nline-2',
      },
    },
    {
      name: 'preserves already normalized private key newlines',
      raw: JSON.stringify({
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\nline-2',
      }),
      expected: {
        project_id: 'project-id',
        client_email: 'service@example.com',
        private_key: 'line-1\nline-2',
      },
    },
  ];

  for (const tc of cases) {
    await t.test(tc.name, () => {
      const actual = parseServiceAccountKey(tc.raw);

      if (tc.expected === null) {
        assert.equal(actual, null);
        return;
      }

      assert.deepEqual(actual, tc.expected);
      assert.deepEqual(Object.keys(actual).sort(), [
        'client_email',
        'private_key',
        'project_id',
      ]);
    });
  }
});
