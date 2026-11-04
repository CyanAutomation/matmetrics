import assert from 'node:assert/strict';
import test from 'node:test';
import { surfaceClassName } from './surface';

test('surface primitive supplies shared default styling', () => {
  assert.equal(
    surfaceClassName(),
    'ui-surface ui-surface--default ui-surface--padding-default'
  );
});

test('surface primitive selects an explicit variant and padding', () => {
  assert.equal(
    surfaceClassName({ variant: 'subtle', padding: 'sm' }),
    'ui-surface ui-surface--subtle ui-surface--padding-sm'
  );
  assert.equal(
    surfaceClassName({ variant: 'interactive', padding: 'none' }),
    'ui-surface ui-surface--interactive ui-surface--padding-none'
  );
});

test('surface primitive treats null choices as defaults', () => {
  assert.equal(
    surfaceClassName({ variant: null, padding: null }),
    'ui-surface ui-surface--default ui-surface--padding-default'
  );
});
