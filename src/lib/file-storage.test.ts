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
  extractDateFromPath,
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

test('updateSession rejects a conflicting interleaved write to nextPath and preserves the original file', async () => {
  await withTempDataDir(async () => {
    const originalWriteFile = fs.writeFile;
    const session = makeSession();
    const originalPath = await createSession(session);
    const nextSession = makeSession({
      date: '2025-02-12',
      notes: 'should fail due to interleaved conflict',
    });
    const nextPath = getSessionFilePath('2025-02-12', undefined, 'session-1');
    const conflictingMarkdown = [
      "---",
      "id: 'session-other'",
      "date: '2025-02-12'",
      'effort: 2',
      "category: 'Technical'",
      'duration: 90',
      '---',
      '',
      '# Conflicting Session',
      '',
      '## Techniques Practiced',
      '',
      '- Seoi nage',
      '',
      '## Session Description',
      '',
      'interleaving write',
      '',
      '## Notes',
      '',
      'conflict',
      '',
    ].join('\n');
    let injectedConflict = false;

    fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => {
      const [targetPath, data, options] = args;
      const targetPathString = targetPath.toString();
      const flag =
        typeof options === 'object' && options !== null && 'flag' in options
          ? options.flag
          : undefined;
      if (
        !injectedConflict &&
        targetPathString === nextPath &&
        flag === 'wx'
      ) {
        injectedConflict = true;
        await originalWriteFile.call(fs, nextPath, conflictingMarkdown, 'utf-8');
      }

      return originalWriteFile.call(fs, ...args);
    }) as typeof fs.writeFile;

    try {
      await assert.rejects(
        updateSession(nextSession),
        /another session already exists there/
      );
    } finally {
      fs.writeFile = originalWriteFile;
    }

    assert.equal(injectedConflict, true);
    const originalMarkdown = await readFile(originalPath, 'utf8');
    assert.match(originalMarkdown, /date: '2025-01-10'/);
    const conflictingAtNextPath = await readFile(nextPath, 'utf8');
    assert.match(conflictingAtNextPath, /id: 'session-other'/);
    const januaryFiles = await readdir(path.dirname(originalPath));
    assert.equal(
      januaryFiles.filter((file) => file.includes('session-1')).length,
      1
    );
  });
});

test('updateSession treats interleaved write of the same session ID as idempotent and removes old path', async () => {
  await withTempDataDir(async () => {
    const originalWriteFile = fs.writeFile;
    const session = makeSession();
    const originalPath = await createSession(session);
    const nextSession = makeSession({
      date: '2025-02-12',
      notes: 'same-id interleaving should still succeed',
    });
    const nextPath = getSessionFilePath('2025-02-12', undefined, 'session-1');
    let injectedSameIdWrite = false;

    fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => {
      const [targetPath, data, options] = args;
      const targetPathString = targetPath.toString();
      const flag =
        typeof options === 'object' && options !== null && 'flag' in options
          ? options.flag
          : undefined;
      if (
        !injectedSameIdWrite &&
        targetPathString === nextPath &&
        flag === 'wx' &&
        typeof data === 'string'
      ) {
        injectedSameIdWrite = true;
        await originalWriteFile.call(fs, nextPath, data, 'utf-8');
      }

      return originalWriteFile.call(fs, ...args);
    }) as typeof fs.writeFile;

    try {
      const updatedPath = await updateSession(nextSession);
      assert.equal(updatedPath, nextPath);
    } finally {
      fs.writeFile = originalWriteFile;
    }

    assert.equal(injectedSameIdWrite, true);
    await assert.rejects(access(originalPath));
    const nextMarkdown = await readFile(nextPath, 'utf8');
    assert.match(nextMarkdown, /id: session-1/);
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

test('extractDateFromPath extracts dates from POSIX-style session paths', () => {
  assert.equal(
    extractDateFromPath('/tmp/data/2025/01/20250110-matmetrics-session-1.md'),
    '2025-01-10'
  );
});

test('extractDateFromPath extracts dates from Windows-style session paths', () => {
  assert.equal(
    extractDateFromPath(
      'C:\\tmp\\data\\2025\\01\\20250110-matmetrics-session-1.md'
    ),
    '2025-01-10'
  );
});
