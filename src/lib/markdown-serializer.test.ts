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

# 2026-03-16 - Judo Session: Technical

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
    '# 2026-03-19 - Judo Session: Technical',
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
    '# 2026-03-20 - Judo Session: Technical\r\n\r\n' +
    '## Techniques Practiced\n' +
    '- Sasae tsurikomi ashi\r\n' +
    '- Ko uchi gari\n\n' +
    '## Session Description\r\n\r\n' +
    'Mixed newline description.\n\n' +
    '## Notes\r\n\r\n' +
    'Mixed newline notes.';

  const mixedParsed = markdownToSession(markdownMixedNewlines);

  assert.deepEqual(mixedParsed.techniques, [
    'Sasae tsurikomi ashi',
    'Ko uchi gari',
  ]);
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
    '# 2026-03-21 - Judo Session: Technical',
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

test('Roundtrip preserves videoUrl when present', () => {
  const session = {
    id: 'video-roundtrip',
    date: '2026-03-23',
    effort: 3 as const,
    category: 'Technical' as const,
    techniques: ['Uchi mata'],
    description: 'With video.',
    notes: 'Video linked.',
    videoUrl: 'https://example.com/videos/123',
  };

  const markdown = sessionToMarkdown(session);
  const parsed = markdownToSession(markdown);

  assert.equal(parsed.videoUrl, 'https://example.com/videos/123');
});

test('markdown without videoUrl still parses', () => {
  const markdownWithoutVideoUrl = `---
id: "no-video"
date: "2026-03-23"
effort: 2
category: "Technical"
---

# 2026-03-23 - Judo Session: Technical

## Techniques Practiced
- O soto gari

## Session Description

No video URL in frontmatter.

## Notes

Older file format.`;

  const parsed = markdownToSession(markdownWithoutVideoUrl);

  assert.equal(parsed.videoUrl, undefined);
  assert.deepEqual(parsed.techniques, ['O soto gari']);
});

test('serializer always emits description and notes headings', () => {
  const markdown = sessionToMarkdown({
    id: 'always-sections',
    date: '2026-03-22',
    effort: 3,
    category: 'Technical',
    techniques: [],
  });

  assert.match(markdown, /## Session Description/);
  assert.match(markdown, /## Notes/);
});

test('title may differ from frontmatter and still parse', () => {
  const markdownWithEditedTitle = `---
id: "edited-title"
date: "2026-03-22"
effort: 3
category: "Technical"
---

# Tuesday drilling session

## Techniques Practiced
- Seoi nage

## Session Description

Worked entries and kuzushi.

## Notes

Keep left elbow higher.`;

  const parsed = markdownToSession(markdownWithEditedTitle);

  assert.equal(parsed.date, '2026-03-22');
  assert.equal(parsed.category, 'Technical');
  assert.deepEqual(parsed.techniques, ['Seoi nage']);
});

test('Description and notes preserve embedded "## " strings in paragraphs', () => {
  const markdownWithEmbeddedHashes = `---
id: "edge-embedded-hashes"
date: "2026-03-22"
effort: 3
category: "Technical"
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Seoi nage

## Session Description

This line includes a literal token: ## not-a-heading.
Another line keeps ## Session Description as plain text content.

## Notes

Keep ## Notes literal in notes text too.
And retain ## Techniques Practiced as inline text.`;

  const parsed = markdownToSession(markdownWithEmbeddedHashes);

  assert.equal(
    parsed.description,
    [
      'This line includes a literal token: ## not-a-heading.',
      'Another line keeps ## Session Description as plain text content.',
    ].join('\n')
  );
  assert.equal(
    parsed.notes,
    [
      'Keep ## Notes literal in notes text too.',
      'And retain ## Techniques Practiced as inline text.',
    ].join('\n')
  );
});

test('Description and notes preserve fenced code blocks with "## " lines', () => {
  const markdownWithFencedCode = `---
id: "edge-fenced-code"
date: "2026-03-22"
effort: 4
category: "Technical"
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Tomoe nage

## Session Description

\`\`\`md
## Notes
console.log("inside description");
\`\`\`
After code fence in description.

## Notes

\`\`\`text
## Session Description
note_code();
\`\`\`
After code fence in notes.`;

  const parsed = markdownToSession(markdownWithFencedCode);

  assert.equal(
    parsed.description,
    [
      '```md',
      '## Notes',
      'console.log("inside description");',
      '```',
      'After code fence in description.',
    ].join('\n')
  );
  assert.equal(
    parsed.notes,
    [
      '```text',
      '## Session Description',
      'note_code();',
      '```',
      'After code fence in notes.',
    ].join('\n')
  );
});

test('title must still be a level-1 heading', () => {
  const markdownWithoutH1 = `---
id: "missing-h1"
date: "2026-03-22"
effort: 4
category: "Technical"
---

Tuesday drilling session

## Techniques Practiced
- Tomoe nage

## Session Description

Description.

## Notes

Notes.`;

  assert.throws(
    () => markdownToSession(markdownWithoutH1),
    /must begin with a level-1 title/
  );
});

test('invalid date frontmatter values are rejected', () => {
  const markdownWithImpossibleDate = `---
id: "invalid-date"
date: "2026-02-30"
effort: 3
category: "Technical"
---

# 2026-02-30 - Judo Session: Technical

## Techniques Practiced
- Uchi mata

## Session Description

Description.

## Notes

Notes.`;

  assert.throws(
    () => markdownToSession(markdownWithImpossibleDate),
    /Invalid "date" in frontmatter: must be YYYY-MM-DD/
  );
});

test('invalid effort frontmatter values are rejected', () => {
  const markdownWithOutOfBoundsEffort = `---
id: "invalid-effort"
date: "2026-03-22"
effort: 6
category: "Technical"
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Uchi mata

## Session Description

Description.

## Notes

Notes.`;

  assert.throws(
    () => markdownToSession(markdownWithOutOfBoundsEffort),
    /Invalid "effort" in frontmatter: must be between 1 and 5/
  );
});

test('invalid category frontmatter values are rejected', () => {
  const markdownWithInvalidCategory = `---
id: "invalid-category"
date: "2026-03-22"
effort: 3
category: "Sparring"
---

# 2026-03-22 - Judo Session: Sparring

## Techniques Practiced
- Uchi mata

## Session Description

Description.

## Notes

Notes.`;

  assert.throws(
    () => markdownToSession(markdownWithInvalidCategory),
    /Invalid "category" in frontmatter: must be one of Technical, Randori, Shiai/
  );
});

test('invalid duration frontmatter values are rejected', () => {
  const markdownWithNegativeDuration = `---
id: "invalid-duration"
date: "2026-03-22"
effort: 3
category: "Technical"
duration: -1
---

# 2026-03-22 - Judo Session: Technical

## Techniques Practiced
- Uchi mata

## Session Description

Description.

## Notes

Notes.`;

  assert.throws(
    () => markdownToSession(markdownWithNegativeDuration),
    /Invalid "duration" in frontmatter: must be a non-negative integer/
  );
});
