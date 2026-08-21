import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAiProse } from './ai-output-normalization';

test('removes a generated emphasized title', () => {
  assert.equal(
    normalizeAiProse('**Training Diary Entry**\n\nWe worked on throws.'),
    'We worked on throws.'
  );
});

test('removes a generated Markdown heading', () => {
  assert.equal(
    normalizeAiProse('# Training Diary Entry\n\nWe worked on throws.'),
    'We worked on throws.'
  );
});

test('removes emphasis from Judo terms', () => {
  assert.equal(
    normalizeAiProse('We moved into *ne-waza* after warming up.'),
    'We moved into ne-waza after warming up.'
  );
});

test('preserves paragraph breaks', () => {
  const prose = 'We drilled uchi-mata.\n\nRandori felt more controlled.';
  assert.equal(normalizeAiProse(prose), prose);
});

test('leaves already-correct plain prose unchanged', () => {
  const prose = 'I concentrated on kuzushi and kept a steady pace.';
  assert.equal(normalizeAiProse(prose), prose);
});
