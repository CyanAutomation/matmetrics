import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';

test('EOF without trailing newline preserves notes text', () => {
  const markdownWithoutTrailingNewline = `---
id: "edge-no-eof-newline"
date: "2026-03-16"
effort: 3
category: "Technical"
---

# March 16, 2026 - Judo Session: Technical

## Techniques Practiced
- O soto gari

## Session Description

Includes the letter Z in the middle of content.

## Notes

Finishes at file end with Z`;

  const parsed = markdownToSession(markdownWithoutTrailingNewline);

  assert.equal(parsed.notes, 'Finishes at file end with Z');
});

test('CRLF and mixed newline parsing preserve sections', () => {
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

  const mixedParsed = markdownToSession(markdownMixedNewlines);

  assert.deepEqual(mixedParsed.techniques, ['Sasae tsurikomi ashi', 'Ko uchi gari']);
  assert.equal(mixedParsed.description, 'Mixed newline description.');
  assert.equal(mixedParsed.notes, 'Mixed newline notes.');
});

test('Roundtrip preserves techniques/description/notes', () => {
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
