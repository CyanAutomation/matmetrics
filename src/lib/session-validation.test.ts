import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { validateSessionPayload } from '@/lib/session-validation';

type Fixture = { name: string; session: Record<string, unknown>; error: string };

const fixtures = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'testdata/validation/session-validation-fixtures.json'), 'utf8')
) as Fixture[];

test('TS validator matches shared fixtures', async (t) => {
  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      const result = validateSessionPayload(fixture.session, { generateIdWhenMissing: false });
      const error = result.ok ? '' : result.error.toLowerCase();
      assert.equal(error, fixture.error.toLowerCase());
    });
  }
});
