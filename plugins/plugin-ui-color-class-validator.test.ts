import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePluginColorClasses } from './plugin-ui-color-class-validator';

test('validator covers supported static JSX expression forms', async (t) => {
  const fixtures = [
    { name: 'string literal', expression: "'bg-red-500'" },
    { name: 'template literal', expression: '`bg-red-500`' },
    {
      name: 'template expression',
      expression: "`text-primary ${'bg-red-500'}`",
    },
    {
      name: 'conditional expression',
      expression: "active ? 'bg-red-500' : 'text-primary'",
    },
    {
      name: 'binary expression',
      expression: "'text-primary' + ' bg-red-500'",
    },
    {
      name: 'parenthesized expression with allowed-token negative control',
      expression: "('text-primary bg-red-500')",
    },
    { name: 'array literal', expression: "['text-primary', 'bg-red-500']" },
    {
      name: 'object literal',
      expression: "{ 'bg-red-500': true, ['text-primary']: active }",
    },
    {
      name: 'simple computed property concatenation',
      expression: "{ ['bg-' + 'red-500']: true, ['text-primary']: active }",
    },
    {
      name: 'nested computed property concatenation',
      expression:
        "{ ['text-' + ('pink' + '-500')]: true, ['text-primary']: active }",
      token: 'text-pink-500',
      replacement: 'text-destructive',
    },
    {
      name: 'helper call',
      expression: "clsx('text-primary', 'bg-red-500')",
    },
  ] as const;

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      const file = `${fixture.name.replaceAll(' ', '-')}.tsx`;
      const source = `const active = true;\nexport const Fixture = () => <div className={${fixture.expression}} />;`;
      const diagnostics = validatePluginColorClasses(source, file, {
        allowedTokens: new Set(['text-primary']),
      });

      assert.equal(diagnostics.length, 1);
      assert.deepEqual(diagnostics[0], {
        file,
        line: 2,
        token: 'token' in fixture ? fixture.token : 'bg-red-500',
        replacement:
          'replacement' in fixture
            ? fixture.replacement
            : 'bg-destructive/10',
      });
    });
  }
});
