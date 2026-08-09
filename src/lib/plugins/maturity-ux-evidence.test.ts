import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findFilesAssertingCriterion,
  findFilesAssertingState,
} from '@/lib/plugins/maturity-ux-evidence';

const withEvidenceFiles = async (
  files: Record<string, string>,
  run: (paths: Record<string, string>) => Promise<void>
) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'matmetrics-ux-'));

  try {
    const paths = Object.fromEntries(
      await Promise.all(
        Object.entries(files).map(async ([name, contents]) => {
          const filePath = path.join(directory, name);
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, contents, 'utf8');
          return [name, filePath];
        })
      )
    );
    await run(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test('findFilesAssertingState requires an assertion anchor near the UX state', async () => {
  await withEvidenceFiles(
    {
      'near.test.ts': `
        expect(screen.getByText('Loading'));
        assert.equal(status, 'loading');
      `,
      'keyword-only.test.ts': `
        const message = 'loading';
      `,
      'far.test.ts': `
        expect(screen.getByText('Ready'));
        ${'\n'.repeat(4)}
        const message = 'loading';
      `,
    },
    async (paths) => {
      assert.deepEqual(
        await findFilesAssertingState(
          [
            paths['near.test.ts'],
            paths['keyword-only.test.ts'],
            paths['far.test.ts'],
          ],
          'loading'
        ),
        [paths['near.test.ts']]
      );
    }
  );
});

test('findFilesAssertingState recognizes broad loading assertions and preserves file order', async () => {
  await withEvidenceFiles(
    {
      'broad.test.ts': `
        expect(
          screen.getByRole('status', { name: 'pending request is loading' })
        ).toBeVisible();
      `,
      'error.test.ts': `
        expect(screen.getByText('request failed')).toBeVisible();
      `,
    },
    async (paths) => {
      assert.deepEqual(
        await findFilesAssertingState(
          [paths['error.test.ts'], paths['broad.test.ts']],
          'loading'
        ),
        [paths['broad.test.ts']]
      );
    }
  );
});

test('findFilesAssertingCriterion verifies each composite UX criterion', async () => {
  await withEvidenceFiles(
    {
      'loading.test.ts': `expect(screen.getByText('loading')).toBeVisible();`,
      'error-recovery.test.ts': `expect(screen.getByText('error')).toBeVisible();
expect(screen.getByRole('button', { name: 'retry' })).toBeVisible();`,
      'empty-cta.test.ts': `expect(screen.getByText('no results')).toBeVisible();
expect(screen.getByRole('button', { name: 'add' })).toBeVisible();`,
      'destructive-safe.test.ts': `expect(screen.getByText('delete item')).toBeVisible();
expect(screen.getByRole('dialog', { name: 'confirm deletion' })).toBeVisible();
expect(screen.getByRole('button', { name: 'cancel' })).toBeVisible();`,
      'incomplete.test.ts': `expect(screen.getByText('error')).toBeVisible();`,
    },
    async (paths) => {
      assert.deepEqual(
        await findFilesAssertingCriterion(
          Object.values(paths),
          'loadingStatePresent'
        ),
        [paths['loading.test.ts']]
      );
      assert.deepEqual(
        await findFilesAssertingCriterion(
          Object.values(paths),
          'errorStateWithRecovery'
        ),
        [paths['error-recovery.test.ts']]
      );
      assert.deepEqual(
        await findFilesAssertingCriterion(
          Object.values(paths),
          'emptyStateWithCta'
        ),
        [paths['empty-cta.test.ts']]
      );
      assert.deepEqual(
        await findFilesAssertingCriterion(
          Object.values(paths),
          'destructiveActionSafety'
        ),
        [paths['destructive-safe.test.ts']]
      );
    }
  );
});

test('evidence scanners propagate missing-file errors', async () => {
  await assert.rejects(
    findFilesAssertingState(
      ['/tmp/matmetrics-file-that-does-not-exist'],
      'loading'
    ),
    /ENOENT/
  );
});
