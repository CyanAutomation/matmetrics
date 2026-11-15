import assert from 'node:assert/strict';
import test from 'node:test';
import { isKeikoRevision, keikoIfMatch } from './keiko-session-revision';

test('formats a list revision using Keiko’s documented If-Match compatibility form', () => {
  assert.equal(keikoIfMatch(17), '"17"');
});

test('does not create an If-Match value when the original revision is missing or invalid', () => {
  assert.equal(keikoIfMatch(undefined), undefined);
  assert.equal(keikoIfMatch(0), undefined);
  assert.equal(keikoIfMatch(Number.MAX_SAFE_INTEGER + 1), undefined);
  assert.equal(isKeikoRevision(17), true);
  assert.equal(isKeikoRevision('17'), false);
});
