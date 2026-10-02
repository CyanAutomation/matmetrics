import assert from 'node:assert/strict';
import test from 'node:test';

import {
  digestStableArtifact,
  serializeStableArtifact,
} from './stable-artifact';

test('artifact serialization sorts object keys recursively and preserves arrays', () => {
  const first = {
    z: [{ second: 2, first: 1 }],
    a: true,
  };
  const reordered = {
    a: true,
    z: [{ first: 1, second: 2 }],
  };

  assert.equal(serializeStableArtifact(first), serializeStableArtifact(reordered));
  assert.ok(serializeStableArtifact(first).endsWith('\n'));
  assert.notEqual(
    serializeStableArtifact({ values: [1, 2] }),
    serializeStableArtifact({ values: [2, 1] })
  );
});

test('artifact digests are stable for object key order and sensitive to values', async () => {
  const first = await digestStableArtifact({ z: 2, a: { y: 1, x: 3 } });
  const reordered = await digestStableArtifact({ a: { x: 3, y: 1 }, z: 2 });
  const changed = await digestStableArtifact({ a: { x: 4, y: 1 }, z: 2 });

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});
