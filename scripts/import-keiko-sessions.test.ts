import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeImport } from './import-keiko-sessions';
import type { JudoSession } from '../src/lib/types';

const session = (id: string, notes = 'same') => ({
  id,
  date: '2026-10-16',
  techniques: ['Uchi mata'],
  effort: 4,
  category: 'Technical',
  notes,
}) as JudoSession;

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
