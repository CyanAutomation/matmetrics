import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePluginColorClasses } from './plugin-ui-color-class-validator';

test('validator evaluates nested binary concatenation inside computed property names', () => {
  const source = `
    export const Fixture = () => (
      <div className={clsx({ ['text-' + ('pink' + '-500')]: true })} />
    );
  `;

  const diagnostics = validatePluginColorClasses(source, 'nested-computed.tsx', {
    allowedTokens: new Set(),
  });

  const tokens = diagnostics.map((d) => d.token);
  assert.ok(tokens.includes('text-pink-500'));
});
