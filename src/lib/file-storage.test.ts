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
  hasAnySessions,
  findSessionFileById,
  getNextCounter,
  getSessionFilePath,
  listSessions,
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

test('updateSession overwrites an existing destination file when interleaved write has the same session ID with stale content', async () => {
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
        const staleSameIdMarkdown = data.replace(
          'same-id interleaving should still succeed',
          'stale destination content'
        );
        await originalWriteFile.call(fs, nextPath, staleSameIdMarkdown, 'utf-8');
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
    assert.match(nextMarkdown, /same-id interleaving should still succeed/);
    assert.doesNotMatch(nextMarkdown, /stale destination content/);
  });
});

test('createSession rejects same-ID concurrent creates across different dates and preserves a single canonical file', async () => {
  await withTempDataDir(async () => {
    const sessionId = 'session-concurrent';
    const firstSession = makeSession({
      id: sessionId,
      date: '2025-01-10',
      notes: 'first writer',
    });
    const secondSession = makeSession({
      id: sessionId,
      date: '2025-02-11',
      notes: 'conflicting writer',
    });

    const [firstResult, secondResult] = await Promise.allSettled([
      createSession(firstSession),
      createSession(secondSession),
    ]);

    const fulfilled = [firstResult, secondResult].filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === 'fulfilled'
    );
    const rejected = [firstResult, secondResult].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(
      String(rejected[0].reason),
      /already exists with different content|is locked by another create operation/
    );

    const winningPath = fulfilled[0].value;
    const storedPath = await findSessionFileById(sessionId);
    assert.equal(storedPath, winningPath);

    const storedMarkdown = await readFile(winningPath, 'utf8');
    assert.match(storedMarkdown, /id: session-concurrent/);
    assert.match(storedMarkdown, /date: '(2025-01-10|2025-02-11)'/);
  });
});

test('createSession rolls back index lock when markdown write fails', async () => {
  await withTempDataDir(async () => {
    const originalWriteFile = fs.writeFile;
    const session = makeSession({
      id: 'session-rollback',
      date: '2025-03-03',
    });
    const filePath = getSessionFilePath(session.date, undefined, session.id);
    const indexPath = path.join(
      path.dirname(path.dirname(filePath)),
      '.index',
      `${session.id}.json`
    );
    let injectedFailure = false;

    fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => {
      const [targetPath, data, options] = args;
      const targetPathString = targetPath.toString();
      const flag =
        typeof options === 'object' && options !== null && 'flag' in options
          ? options.flag
          : undefined;

      if (!injectedFailure && targetPathString === filePath && flag === 'wx') {
        injectedFailure = true;
        throw Object.assign(new Error('simulated write failure'), {
          code: 'EIO',
        });
      }

      return originalWriteFile.call(fs, ...args);
    }) as typeof fs.writeFile;

    try {
      await assert.rejects(createSession(session), /simulated write failure/);
    } finally {
      fs.writeFile = originalWriteFile;
    }

    assert.equal(injectedFailure, true);
    await assert.rejects(access(filePath));
    await assert.rejects(access(indexPath));

    const retryPath = await createSession(session);
    assert.equal(retryPath, filePath);
  });
});

test('listSessions and hasAnySessions ignore index-only directories', async () => {
  await withTempDataDir(async () => {
    const sampleFilePath = getSessionFilePath('2025-03-03');
    const baseDir = path.dirname(path.dirname(path.dirname(sampleFilePath)));
    const indexDir = path.join(baseDir, '.index');
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(
      path.join(indexDir, 'session-orphan.json'),
      JSON.stringify({
        id: 'session-orphan',
        path: path.join(baseDir, '2025', '03', '20250303-matmetrics-session-orphan.md'),
      }),
      'utf-8'
    );

    const sessions = await listSessions();
    assert.deepEqual(sessions, []);
    assert.equal(await hasAnySessions(), false);
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
