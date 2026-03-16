import assert from 'node:assert/strict';
import { getGitHubSessionPath } from './github-storage';
import { getSessionBlobPath } from './vercel-blob-storage';
import type { JudoSession } from './types';

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2025-03-14',
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}

function runSanitizationRegression() {
  const cases: Array<{ id: string; expected: string }> = [
    { id: 'id/with/slash', expected: 'id-with-slash' },
    { id: 'id with spaces', expected: 'id-with-spaces' },
    { id: 'id-☃-ユニコード', expected: 'id--------' },
    { id: 'id.!@#$%^&*()[]{}', expected: 'id---------------' },
  ];

  for (const testCase of cases) {
    const session = makeSession(testCase.id);
    const githubPath = getGitHubSessionPath(session);
    const blobPath = getSessionBlobPath(session.date, undefined, session.id);

    assert.equal(
      githubPath,
      `sessions/2025/03/20250314-matmetrics-${testCase.expected}.md`
    );
    assert.equal(
      blobPath,
      `sessions/2025/03/20250314-matmetrics-${testCase.expected}.md`
    );
  }

  const overlyLongSessionId = 'a'.repeat(101);
  assert.throws(() => getGitHubSessionPath(makeSession(overlyLongSessionId)), {
    message: 'Session ID exceeds maximum allowed length of 100 characters',
  });
}

runSanitizationRegression();
