import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createImporterGatewayRequest,
  parseMarkdownFiles,
  parseSessionExport,
  safeResponseError,
  summarizeImport,
} from './import-keiko-sessions';
import type { JudoSession } from '../src/lib/types';

const session = (id: string, notes = 'same') => ({
  id,
  date: '2026-10-16',
  techniques: ['Uchi mata'],
  effort: 4,
  category: 'Technical',
  notes,
}) as JudoSession;

test('source export parser accepts the GitHub-backed array and markdown export shapes', () => {
  const sourceSession = session('source');
  const issue = { filePath: 'data/invalid.md' };

  assert.deepEqual(parseSessionExport([sourceSession]), {
    sessions: [sourceSession],
    issues: [],
  });
  assert.deepEqual(parseSessionExport({ sessions: [sourceSession], issues: [issue] }), {
    sessions: [sourceSession],
    issues: [issue],
  });
});

test('source export parser normalizes null techniques to an empty array', () => {
  const sourceSession = { ...session('legacy-empty-techniques'), techniques: null } as unknown as JudoSession;

  assert.deepEqual(parseSessionExport([sourceSession]).sessions[0]?.techniques, []);
  assert.deepEqual(
    parseSessionExport({ sessions: [sourceSession], issues: [] }).sessions[0]?.techniques,
    []
  );
});

test('source export parser rejects malformed payloads', () => {
  assert.throws(() => parseSessionExport({ sessions: [] }), /invalid session export/);
});

test('Markdown source reader restores Keiko backup text and reports invalid files', () => {
  const expected = {
    id: 'markdown-source',
    date: '2026-10-16',
    techniques: ['Randori drills\n# heading'],
    effort: 4,
    category: 'Randori',
    description: 'Warm-up\n---\n# heading',
    notes: '[link](https://example.test)',
  } as JudoSession;
  const payload = JSON.stringify({
    techniques: expected.techniques,
    description: expected.description,
    notes: expected.notes,
  });
  const result = parseMarkdownFiles([
    {
      filePath: 'data/2026/10/20261016-matmetrics-markdown-source.md',
      contents: [
        '---',
        'id: "markdown-source"',
        'date: "2026-10-16"',
        'effort: 4',
        'category: "Randori"',
        'keikoBackupVersion: 1',
        `keikoTextPayload: ${JSON.stringify(payload)}`,
        '---',
        '',
        '# 2026-10-16 - Judo Session: Randori',
        '',
        '## Techniques Practiced',
        '- Randori drills \\# heading',
        '',
        '## Session Description',
        '',
        'Warm\\-up',
        '\\-\\-\\-',
        '\\# heading',
        '',
        '## Notes',
        '',
        '\\[link\\]\\(https://example.test\\)',
      ].join('\n'),
    },
    { filePath: 'data/invalid.md', contents: 'not a session' },
  ]);

  assert.deepEqual(result.sessions, [expected]);
  assert.deepEqual(result.issues, [{ filePath: 'data/invalid.md' }]);
});

test('importer gateway request carries the bearer and only the Better Auth session cookie', () => {
  const request = createImporterGatewayRequest(
    new URL('https://matmetrics.example.test'),
    'matmetrics-api-token',
    '__Secure-better-auth.session_token=session-value'
  );
  assert.equal(request.headers.get('authorization'), 'Bearer matmetrics-api-token');
  assert.equal(request.headers.get('cookie'), '__Secure-better-auth.session_token=session-value');
  assert.equal(request.headers.get('origin'), 'https://matmetrics.example.test');
  assert.equal(request.headers.get('sec-fetch-site'), 'same-origin');
});

test('comparison error hints expose only allowlisted authentication errors', async () => {
  assert.equal(
    await safeResponseError(Response.json({ error: 'Session authentication failed' }, { status: 401 })),
    'Session authentication failed'
  );
  assert.equal(
    await safeResponseError(Response.json({ error: 'Invalid access token' }, { status: 401 })),
    'Invalid access token'
  );
  assert.equal(
    await safeResponseError(Response.json({
      error: { code: 'authentication_required', message: 'Invalid access token' },
      requestId: 'request-123',
    }, { status: 401 })),
    'Invalid access token'
  );
  assert.equal(
    await safeResponseError(Response.json({
      error: { code: 'internal_error', message: 'sensitive internal response' },
    }, { status: 500 })),
    null
  );
  assert.equal(
    await safeResponseError(Response.json({ error: 'sensitive internal response' }, { status: 401 })),
    null
  );
});

test('dry-run summary separates parse failures, duplicates, payload mismatches, and importable sessions', () => {
  const result = summarizeImport(
    [session('same'), session('mismatch', 'source'), session('new'), session('dup'), session('dup')],
    [{ filePath: 'bad.md' }],
    [session('same'), session('mismatch', 'existing')]
  );
  assert.deepEqual(result.report, {
    sourceCount: 5,
    parseFailures: 1,
    duplicateIds: 1,
    alreadyPresent: 1,
    payloadMismatches: 1,
    keikoOnly: 0,
    importable: 1,
    imported: 0,
  });
  assert.deepEqual(result.importable.map((item) => item.id), ['new']);
});

test('dry-run summary counts sessions that exist only in Keiko', () => {
  const result = summarizeImport(
    [session('source')],
    [],
    [session('source'), session('keiko-only')]
  );

  assert.equal(result.report.keikoOnly, 1);
});
