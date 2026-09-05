import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePluginColorClasses } from './plugin-ui-color-class-validator';

test('validator covers object/array/binary/conditional/helper call paths', () => {
  const source = `
    const active = true;
    export const Fixture = () => (
      <div
        className={clsx(
          ['text-primary', 'bg-red-500'],
          active ? 'hover:bg-green-600' : 'text-primary',
          'text-primary' + ' bg-red-500',
          { 'border-amber-200/50': true, ['text-pink-500']: false },
          { 'bg-red-500': true, ['text-blue-600']: active }
        )}
      />
    );
  `;

  const diagnostics = validatePluginColorClasses(source, 'testfile.tsx', {
    allowedTokens: new Set(['text-primary']),
  });

  const tokens = diagnostics.map((d) => d.token);

  // Expected forbidden tokens detected statically
  assert.ok(tokens.includes('bg-red-500'));
  assert.ok(tokens.includes('text-blue-600'));
  assert.ok(tokens.includes('hover:bg-green-600'));
  assert.ok(tokens.includes('border-amber-200/50'));
  assert.ok(tokens.includes('text-pink-500'));

  // Allowed token should not appear
  assert.ok(!tokens.includes('text-primary'));
});

test('validator handles parenthesized expressions', () => {
  const source = `
    export const Fixture = () => (
      <div className={( 'bg-red-500' )} />
    );
  `;

  const diagnostics = validatePluginColorClasses(source, 'paren.tsx', {
    allowedTokens: new Set([]),
  });

  const tokens = diagnostics.map((d) => d.token);
  assert.ok(tokens.includes('bg-red-500'));
});

test('validator resolves computed property name expressions when concatenated', () => {
  const source = `
    const color = 'pink-500';
    export const Fixture = () => (
      <div className={clsx({ ['text-' + 'pink-500']: true })} />
    );
  `;

  const diagnostics = validatePluginColorClasses(source, 'computed.tsx', {
    allowedTokens: new Set([]),
  });

  const tokens = diagnostics.map((d) => d.token);
  assert.ok(tokens.includes('text-pink-500'));
});
