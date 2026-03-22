import matter from 'gray-matter';
import { JudoSession, EffortLevel, SessionCategory } from './types';

/**
 * Convert a JudoSession to a markdown string with YAML frontmatter
 * Format:
 * ---
 * id: "..."
 * date: "2026-03-16"
 * effort: 3
 * category: "Technical"
 * duration: 90
 * ---
 *
 * # 2026-03-16 - Judo Session: Technical
 *
 * ## Techniques Practiced
 * - Technique 1
 * - Technique 2
 *
 * ## Session Description
 *
 * [description text here]
 *
 * ## Notes
 *
 * [notes text here]
 */
export function sessionToMarkdown(session: JudoSession): string {
  const frontmatter = {
    id: session.id,
    date: session.date,
    effort: session.effort,
    category: session.category,
    ...(session.duration !== undefined && { duration: session.duration }),
  };

  let content = `# ${session.date} - Judo Session: ${session.category}\n\n`;

  // Techniques section
  content += '## Techniques Practiced\n';
  if (session.techniques.length > 0) {
    content += session.techniques.map((t) => `- ${t}`).join('\n');
  } else {
    content += '- (none recorded)\n';
  }
  content += '\n\n';

  // Description section
  if (session.description) {
    content += '## Session Description\n\n';
    content += session.description;
    content += '\n\n';
  }

  // Notes section
  if (session.notes) {
    content += '## Notes\n\n';
    content += session.notes;
    content += '\n';
  }

  // Use gray-matter to create the complete markdown with frontmatter
  const file = matter.stringify(content, frontmatter);
  return file;
}

/**
 * Parse a markdown string (with YAML frontmatter) into a JudoSession
 * Throws if markdown is invalid or missing required fields
 * 
 * Title must match format: # YYYY-MM-DD - Judo Session: Category
 */
export function markdownToSession(markdown: string): JudoSession {
  const { data, content } = matter(markdown);
  const normalizedContent = content.replace(/\r\n?/g, '\n');

  // Validate required fields from frontmatter
  if (!data.id || typeof data.id !== 'string') {
    throw new Error('Missing or invalid "id" in frontmatter');
  }
  if (!data.date || typeof data.date !== 'string') {
    throw new Error('Missing or invalid "date" in frontmatter');
  }
  if (data.effort === undefined || typeof data.effort !== 'number') {
    throw new Error('Missing or invalid "effort" in frontmatter');
  }
  if (!data.category || typeof data.category !== 'string') {
    throw new Error('Missing or invalid "category" in frontmatter');
  }

  validateTitleFormat(normalizedContent, data.date, data.category);

  // Parse techniques from markdown content
  const techniques = extractTechniques(normalizedContent);

  // Parse description and notes from markdown content
  const { description, notes } = extractContentSections(normalizedContent);

  const session: JudoSession = {
    id: data.id,
    date: data.date,
    effort: data.effort as EffortLevel,
    category: data.category as SessionCategory,
    techniques,
    ...(description && { description }),
    ...(notes && { notes }),
    ...(data.duration !== undefined && { duration: data.duration }),
  };

  return session;
}

/**
 * Extract techniques list from markdown content (## Techniques Practiced section)
 */
function extractTechniques(content: string): string[] {
  const techniqueText = extractSectionContent(content, 'Techniques Practiced');
  if (!techniqueText) return [];

  const lines = techniqueText.split('\n');
  const techniques: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const technique = trimmed.slice(2).trim();
      // Ignore placeholder "(none recorded)"
      if (technique !== '(none recorded)') {
        techniques.push(technique);
      }
    }
  }

  return techniques;
}

/**
 * Extract description and notes from markdown content
 */
function extractContentSections(content: string): {
  description: string | undefined;
  notes: string | undefined;
} {
  const description = extractSectionContent(
    content,
    'Session Description'
  )?.trim();
  const notes = extractSectionContent(content, 'Notes')?.trim();

  return { description, notes };
}

/**
 * Extract section body content for a markdown heading.
 * Handles optional blank line after heading and end-of-file boundaries
 * with or without trailing newlines.
 */
function extractSectionContent(
  content: string,
  heading: string
): string | undefined {
  const sectionHeadings = [
    '## Techniques Practiced',
    '## Session Description',
    '## Notes',
  ];
  const targetHeading = `## ${heading}`;
  const lines = content.split('\n');

  let inFencedCodeBlock = false;
  let headingLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isFencedCodeDelimiter(lines[i])) {
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    if (!inFencedCodeBlock && lines[i] === targetHeading) {
      headingLineIndex = i;
      break;
    }
  }

  if (headingLineIndex === -1) {
    return undefined;
  }

  let sectionStartIndex = headingLineIndex + 1;
  if (sectionStartIndex < lines.length && lines[sectionStartIndex] === '') {
    sectionStartIndex += 1;
  }

  const sectionLines: string[] = [];
  inFencedCodeBlock = false;

  for (let i = sectionStartIndex; i < lines.length; i++) {
    const line = lines[i];

    if (isFencedCodeDelimiter(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      sectionLines.push(line);
      continue;
    }

    if (
      !inFencedCodeBlock &&
      sectionHeadings.includes(line) &&
      line !== targetHeading
    ) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join('\n').trimEnd();
}

function isFencedCodeDelimiter(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

function validateTitleFormat(
  content: string,
  expectedDate: string,
  expectedCategory: string
): void {
  const lines = content.split('\n');

  // Find the first non-empty line (the title)
  let titleLine: string | undefined;
  for (const line of lines) {
    if (line.trim()) {
      titleLine = line;
      break;
    }
  }

  if (!titleLine) {
    throw new Error('Markdown content has no title');
  }

  const titleRegex = /^# (\d{4}-\d{2}-\d{2}) - Judo Session: (.+)$/;
  const match = titleLine.match(titleRegex);

  if (!match) {
    throw new Error(
      `Title must match format "# YYYY-MM-DD - Judo Session: Category". Got: "${titleLine}"`
    );
  }

  const [, titleDate, titleCategory] = match;

  if (titleDate !== expectedDate) {
    throw new Error(
      `Title date "${titleDate}" does not match frontmatter date "${expectedDate}"`
    );
  }

  if (titleCategory !== expectedCategory) {
    throw new Error(
      `Title category "${titleCategory}" does not match frontmatter category "${expectedCategory}"`
    );
  }
}

/**
 * Validate that a JudoSession can roundtrip through markdown
 * Returns true if session -> markdown -> session produces equivalent data
 */
export function validateRoundtrip(session: JudoSession): boolean {
  try {
    const markdown = sessionToMarkdown(session);
    const recovered = markdownToSession(markdown);

    // Deep equality check
    return (
      recovered.id === session.id &&
      recovered.date === session.date &&
      recovered.effort === session.effort &&
      recovered.category === session.category &&
      recovered.duration === session.duration &&
      arraysEqual(recovered.techniques, session.techniques) &&
      recovered.description === session.description &&
      recovered.notes === session.notes
    );
  } catch {
    return false;
  }
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}
