import assert from 'node:assert/strict';
import test from 'node:test';
import {
  markdownToSession,
  sessionToMarkdown,
  validateMarkdownParserEdgeCases,
} from './markdown-serializer';

test('validateMarkdownParserEdgeCases remains true', () => {
  assert.equal(validateMarkdownParserEdgeCases(), true);
});

test('markdownToSession parses CRLF section content', () => {
  const markdownWithCrLf = [
    '---',
    'id: "edge-crlf"',
    'date: "2026-03-19"',
    'effort: 2',
    'category: "Technical"',
    '---',
    '',
    '# March 19, 2026 - Judo Session: Technical',
    '',
    '## Techniques Practiced',
    '- Uchi mata',
    '- Harai goshi',
    '',
    '## Session Description',
    '',
    'CRLF description line.',
    '',
    '## Notes',
    '',
    'CRLF notes line.',
  ].join('\r\n');

  const parsed = markdownToSession(markdownWithCrLf);

  assert.deepEqual(parsed.techniques, ['Uchi mata', 'Harai goshi']);
  assert.equal(parsed.description, 'CRLF description line.');
  assert.equal(parsed.notes, 'CRLF notes line.');
});

test('markdownToSession parses mixed newline section content', () => {
  const markdownMixedNewlines =
    '---\r\n' +
    'id: "edge-mixed"\n' +
    'date: "2026-03-20"\r\n' +
    'effort: 4\n' +
    'category: "Technical"\r\n' +
    '---\n\n' +
    '# March 20, 2026 - Judo Session: Technical\r\n\r\n' +
    '## Techniques Practiced\n' +
    '- Sasae tsurikomi ashi\r\n' +
    '- Ko uchi gari\n\n' +
    '## Session Description\r\n\r\n' +
    'Mixed newline description.\n\n' +
    '## Notes\r\n\r\n' +
    'Mixed newline notes.';

  const parsed = markdownToSession(markdownMixedNewlines);

  assert.deepEqual(parsed.techniques, ['Sasae tsurikomi ashi', 'Ko uchi gari']);
  assert.equal(parsed.description, 'Mixed newline description.');
  assert.equal(parsed.notes, 'Mixed newline notes.');
});

test('techniques, description, and notes roundtrip from CRLF input', () => {
  const markdownWithCrLf = [
    '---',
    'id: "edge-roundtrip-crlf"',
    'date: "2026-03-21"',
    'effort: 5',
    'category: "Technical"',
    '---',
    '',
    '# March 21, 2026 - Judo Session: Technical',
    '',
    '## Techniques Practiced',
    '- O soto gari',
    '- Tai otoshi',
    '',
    '## Session Description',
    '',
    'Roundtrip description.',
    '',
    '## Notes',
    '',
    'Roundtrip notes.',
  ].join('\r\n');

  const parsedFromCrLf = markdownToSession(markdownWithCrLf);
  const markdownRoundtrip = sessionToMarkdown(parsedFromCrLf);
  const parsedRoundtrip = markdownToSession(markdownRoundtrip);

  assert.deepEqual(parsedRoundtrip.techniques, ['O soto gari', 'Tai otoshi']);
  assert.equal(parsedRoundtrip.description, 'Roundtrip description.');
  assert.equal(parsedRoundtrip.notes, 'Roundtrip notes.');
});
