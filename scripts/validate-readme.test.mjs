import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  validateHeadingStructure,
  validateMarkdownLinks,
} from './validate-readme.mjs';

async function withTempRepository(run) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'matmetrics-readme-'));
  try {
    await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('accepts existing relative files, fragments, and external links', async () => {
  await withTempRepository(async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'));
    await writeFile(
      path.join(rootDir, 'docs', 'guide.md'),
      '# Guide\n\n## Set up\n'
    );
    const markdown = [
      '# Home',
      '',
      '[Guide](docs/guide.md#set-up)',
      '[External](https://example.com)',
      '[Home section](#home)',
    ].join('\n');

    assert.deepEqual(
      await validateMarkdownLinks(markdown, path.join(rootDir, 'README.md'), rootDir),
      []
    );
  });
});

test('reports missing relative files and heading anchors with source lines', async () => {
  await withTempRepository(async (rootDir) => {
    const markdown = [
      '# Home',
      '',
      '[Missing file](docs/missing.md)',
      '[Missing section](#not-here)',
    ].join('\n');

    const issues = await validateMarkdownLinks(
      markdown,
      path.join(rootDir, 'README.md'),
      rootDir
    );

    assert.equal(issues.length, 2);
    assert.match(issues[0], /README\.md:3.*docs\/missing\.md/);
    assert.match(issues[1], /README\.md:4.*#not-here/);
  });
});

test('ignores links inside fenced code examples', async () => {
  await withTempRepository(async (rootDir) => {
    const markdown = ['# Home', '', '```markdown', '[Broken](missing.md)', '```'].join(
      '\n'
    );

    assert.deepEqual(
      await validateMarkdownLinks(markdown, path.join(rootDir, 'README.md'), rootDir),
      []
    );
  });
});

test('supports duplicate GitHub heading slugs', async () => {
  await withTempRepository(async (rootDir) => {
    const markdown = ['# Home', '', '## More', '## More', '[Second](#more-1)'].join(
      '\n'
    );

    assert.deepEqual(
      await validateMarkdownLinks(markdown, path.join(rootDir, 'README.md'), rootDir),
      []
    );
  });
});

test('requires a title heading and rejects skipped heading levels', () => {
  assert.deepEqual(
    validateHeadingStructure('# Title\n\n## Section\n### Detail', 'README.md'),
    []
  );
  assert.deepEqual(
    validateHeadingStructure('Intro\n\n## Section', 'README.md'),
    ['README.md:3: first heading must be level 1']
  );
  assert.deepEqual(
    validateHeadingStructure('# Title\n\n### Skipped', 'README.md'),
    ['README.md:3: heading level skipped from 1 to 3']
  );
});
