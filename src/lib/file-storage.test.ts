import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession,
  findSessionFileById,
  getSessionFilePath,
  updateSession,
} from './file-storage';
import type { JudoSession } from './types';

function makeSession(overrides: Partial<JudoSession> = {}): JudoSession {
  return {
    id: 'session-1',
    date: '2025-01-10',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
    ...overrides,
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), 'matmetrics-file-storage-')
  );
  __setDataDirForTests(dataDir);

  try {
    await run();
  } finally {
    __resetDataDirForTests();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('updateSession moves the markdown file when the session date changes', async () => {
  await withTempDataDir(async () => {
    const originalPath = getSessionFilePath('2025-01-10', undefined, 'session-1');
    await createSession(makeSession());

    const nextSession = makeSession({
      date: '2025-02-12',
      notes: 'moved to a new month',
    });

    const nextPath = await updateSession(nextSession);

    assert.equal(
      nextPath,
      getSessionFilePath('2025-02-12', undefined, 'session-1')
    );
    assert.equal(await findSessionFileById('session-1'), nextPath);
    await assert.rejects(access(originalPath));
    const markdown = await readFile(nextPath, 'utf8');
    assert.match(markdown, /date: '2025-02-12'/);
    assert.match(markdown, /moved to a new month/);
  });
});

test('updateSession leaves exactly one markdown file for the session after a date move', async () => {
  await withTempDataDir(async () => {
    await createSession(makeSession());

    const nextPath = await updateSession(
      makeSession({
        date: '2025-02-12',
        notes: 'single canonical file',
      })
    );

    const januaryFiles = await readdir(path.dirname(getSessionFilePath('2025-01-10')));
    const februaryFiles = await readdir(path.dirname(nextPath));

    const matchingFiles = [...januaryFiles, ...februaryFiles].filter((file) =>
      file.includes('session-1')
    );

    assert.deepEqual(matchingFiles, [path.basename(nextPath)]);
  });
});
