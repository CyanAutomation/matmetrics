import assert from 'node:assert/strict';
import test from 'node:test';
import { ifNoneMatchMatches } from './http-etag';

test('If-None-Match supports exact, weak, list, and wildcard validators', () => {
  const etag = '"sessions-v1"';

  assert.equal(ifNoneMatchMatches(etag, etag), true);
  assert.equal(ifNoneMatchMatches(`W/${etag}`, etag), true);
  assert.equal(ifNoneMatchMatches(`"old", ${etag}`, etag), true);
  assert.equal(ifNoneMatchMatches('*', etag), true);
  assert.equal(ifNoneMatchMatches('"other"', etag), false);
  assert.equal(ifNoneMatchMatches(null, etag), false);
});
