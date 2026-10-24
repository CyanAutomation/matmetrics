import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateSkills } from './skill-metadata-validation';

function withSkillsFixture(
  run: (repoRoot: string, skillsRoot: string) => void
): void {
  const repoRoot = mkdtempSync(join(tmpdir(), 'matmetrics-skills-'));
  const skillsRoot = join(repoRoot, '.github', 'skills');
  mkdirSync(skillsRoot, { recursive: true });

  try {
    run(repoRoot, skillsRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function writeSkill(
  skillsRoot: string,
  name: string,
  body: string,
  filename = 'SKILL.md'
): void {
  const skillDirectory = join(skillsRoot, name);
  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(join(skillDirectory, filename), body);
}

const validSkill = (name: string, body = '') =>
  `---\nname: ${name}\ndescription: A focused skill description.\nlicense: MIT\n---\n\n# ${name}\n\n${body}`;

test('accepts required metadata and existing nested relative references', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeSkill(
      skillsRoot,
      'demo-skill',
      validSkill(
        'demo-skill',
        'Read the [guide](references/guide.md) when needed.'
      )
    );
    const references = join(skillsRoot, 'demo-skill', 'references');
    mkdirSync(references, { recursive: true });
    writeFileSync(join(references, 'guide.md'), '# Guide\n');

    assert.deepEqual(validateSkills(skillsRoot, repoRoot), []);
  });
});

test('reports missing metadata and a skill name that differs from its folder', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeSkill(
      skillsRoot,
      'folder-name',
      '---\nname: other-name\nlicense: MIT\n---\n'
    );

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(diagnostics.some((item) => item.message.includes('description')));
    assert.ok(diagnostics.some((item) => item.message.includes('folder-name')));
  });
});

test('reports broken local Markdown links in nested skill references', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeSkill(skillsRoot, 'demo-skill', validSkill('demo-skill'));
    const references = join(skillsRoot, 'demo-skill', 'references');
    mkdirSync(references, { recursive: true });
    writeFileSync(
      join(references, 'guide.md'),
      'See [the missing guide](./missing.md).\n'
    );

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(diagnostics.some((item) => item.message.includes('missing.md')));
  });
});

test('resolves repository-root links and ignores external and anchor-only links', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeSkill(
      skillsRoot,
      'demo-skill',
      validSkill(
        'demo-skill',
        '[Contract](/docs/contract.md), [site](https://example.com), [section](#purpose).'
      )
    );
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'docs', 'contract.md'), '# Contract\n');

    assert.deepEqual(validateSkills(skillsRoot, repoRoot), []);
  });
});

test('reports skill directories that do not contain SKILL.md', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    mkdirSync(join(skillsRoot, 'empty-skill'), { recursive: true });

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(diagnostics.some((item) => item.message.includes('SKILL.md')));
  });
});

test('validates root and prefixed npm run commands in skill entrypoints', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeFileSync(
      join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { 'test:all': 'node test.js' } })
    );
    const workerDirectory = join(repoRoot, 'workers', 'demo');
    mkdirSync(workerDirectory, { recursive: true });
    writeFileSync(
      join(workerDirectory, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
    );
    writeSkill(
      skillsRoot,
      'demo-skill',
      validSkill(
        'demo-skill',
        'Run npm run test:all. Also run `npm --prefix workers/demo run typecheck`.'
      )
    );

    assert.deepEqual(validateSkills(skillsRoot, repoRoot), []);
  });
});

test('reports npm run commands that are missing from their package scripts', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeFileSync(
      join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { 'test:all': 'node test.js' } })
    );
    const workerDirectory = join(repoRoot, 'workers', 'demo');
    mkdirSync(workerDirectory, { recursive: true });
    writeFileSync(
      join(workerDirectory, 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } })
    );
    writeSkill(
      skillsRoot,
      'demo-skill',
      validSkill(
        'demo-skill',
        'Run `npm run typo` and `npm --prefix workers/demo run missing`.'
      )
    );

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(diagnostics.some((item) => item.message.includes('typo')));
    assert.ok(diagnostics.some((item) => item.message.includes('missing')));
    assert.ok(diagnostics.every((item) => item.severity === 'error'));
  });
});

test('validates npm run commands in nested skill references', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ scripts: {} }));
    writeSkill(skillsRoot, 'demo-skill', validSkill('demo-skill'));
    const references = join(skillsRoot, 'demo-skill', 'references');
    mkdirSync(references, { recursive: true });
    writeFileSync(
      join(references, 'guide.md'),
      '# Guide\n\nRun `npm run missing-reference-script`.\n'
    );

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(
      diagnostics.some(
        (item) =>
          item.path === '.github/skills/demo-skill/references/guide.md' &&
          item.message.includes('missing-reference-script')
      )
    );
  });
});

test('validates local links and npm commands in the skills catalogue', () => {
  withSkillsFixture((repoRoot, skillsRoot) => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ scripts: {} }));
    writeSkill(skillsRoot, 'demo-skill', validSkill('demo-skill'));
    writeFileSync(
      join(skillsRoot, 'README.md'),
      '# Skills\n\n[Missing skill](./missing/SKILL.md)\n\nRun `npm run missing`.\n'
    );

    const diagnostics = validateSkills(skillsRoot, repoRoot);
    assert.ok(diagnostics.some((item) => item.message.includes('missing/SKILL.md')));
    assert.ok(diagnostics.some((item) => item.message.includes('Unknown npm script')));
  });
});
