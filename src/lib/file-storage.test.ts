import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { promises as fs } from 'fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  __resetDataDirForTests,
  __setDataDirForTests,
  createSession,
  findSessionFileById,
  getNextCounter,
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
    const originalPath = getSessionFilePath(
      '2025-01-10',
      undefined,
      'session-1'
    );
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

    const januaryFiles = await readdir(
      path.dirname(getSessionFilePath('2025-01-10'))
    );
    const februaryFiles = await readdir(path.dirname(nextPath));

    const matchingFiles = [...januaryFiles, ...februaryFiles].filter((file) =>
      file.includes('session-1')
    );

    assert.deepEqual(matchingFiles, [path.basename(nextPath)]);
  });
});

test('findSessionFileById locates a session even when the file path month no longer matches frontmatter date', async () => {
  await withTempDataDir(async () => {
    const session = makeSession({
      id: 'session-misaligned',
      date: '2025-01-10',
    });
    const originalPath = await createSession(session);
    const movedPath = getSessionFilePath('2025-02-10', undefined, session.id);

    await fs.mkdir(path.dirname(movedPath), { recursive: true });
    await rename(originalPath, movedPath);

    assert.equal(await findSessionFileById(session.id), movedPath);
  });
});

test('updateSession restores the original file when the destination rename fails after backup', async () => {
  await withTempDataDir(async () => {
    const originalRename = fs.rename;
    const session = makeSession();
    const originalPath = await createSession(session);
    const nextSession = makeSession({
      date: '2025-02-12',
      notes: 'should roll back cleanly',
    });
    const nextPath = getSessionFilePath('2025-02-12', undefined, 'session-1');
    let renameCount = 0;

    fs.rename = (async (from: string, to: string) => {
      renameCount += 1;
      if (renameCount === 2) {
        throw new Error('simulated destination rename failure');
      }

      return originalRename.call(fs, from, to);
    }) as typeof fs.rename;

    try {
      await assert.rejects(
        updateSession(nextSession),
        /simulated destination rename failure/
      );
    } finally {
      fs.rename = originalRename;
    }

    const originalMarkdown = await readFile(originalPath, 'utf8');
    assert.match(originalMarkdown, /date: '2025-01-10'/);
    await assert.rejects(access(nextPath));
    const januaryFiles = await readdir(path.dirname(originalPath));
    assert.equal(
      januaryFiles.filter((file) => file.includes('session-1')).length,
      1
    );
  });
});

test('getNextCounter rejects invalid dates before constructing paths', async () => {
  await withTempDataDir(async () => {
    await assert.rejects(
      getNextCounter('2026-99-99'),
      /Invalid session date format; expected YYYY-MM-DD/
    );
  });
});

test('getNextCounter counts existing sessions for a normalized valid date', async () => {
  await withTempDataDir(async () => {
    await createSession(
      makeSession({
        id: 'session-2',
        date: '2025-01-10',
      })
    );
    await createSession(
      makeSession({
        id: 'session-3',
        date: '2025-01-10',
      })
    );

    const nextCounter = await getNextCounter('2025-01-10');
    assert.equal(nextCounter, 1);
  });
});
