import assert from 'node:assert/strict';
import test from 'node:test';

import { createVariantClasses } from './variant-classes';

const surfaceClasses = createVariantClasses(
  'rounded text-card-foreground',
  {
    variant: {
      default: 'bg-card',
      subtle: 'bg-muted',
    },
    padding: {
      none: '',
      compact: 'p-3',
      roomy: 'p-6',
    },
  },
  {
    variant: 'default',
    padding: 'roomy',
  }
);

test('variant classes include base classes and default variants', () => {
  assert.equal(
    surfaceClasses(),
    'rounded text-card-foreground bg-card p-6'
  );
});

test('variant classes let explicit selections override defaults', () => {
  assert.equal(
    surfaceClasses({ variant: 'subtle', padding: 'compact' }),
    'rounded text-card-foreground bg-muted p-3'
  );
});

test('null suppresses a configured default and empty classes are omitted', () => {
  assert.equal(
    surfaceClasses({ variant: null, padding: 'none' }),
    'rounded text-card-foreground'
  );
});
