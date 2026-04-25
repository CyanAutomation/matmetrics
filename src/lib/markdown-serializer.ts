import matter from 'gray-matter';
import { JudoSession, EffortLevel, SessionCategory } from './types';

const SESSION_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
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
    ...(session.videoUrl && { videoUrl: session.videoUrl }),
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
  content += '## Session Description\n\n';
  if (session.description) {
    content += session.description;
  }
  content += '\n\n';

  // Notes section
  content += '## Notes\n\n';
  if (session.notes) {
    content += session.notes;
  }
  content += '\n';

  // Use gray-matter to create the complete markdown with frontmatter
  const file = matter.stringify(content, frontmatter);
  return file;
}

/**
 * Parse a markdown string (with YAML frontmatter) into a JudoSession
 * Throws if markdown is invalid or missing required fields
 *
 * Frontmatter is canonical. Title is informational and may be edited manually.
 */
export function markdownToSession(markdown: string): JudoSession {
  const { data, content } = matter(markdown);
  const normalizedContent = content.replace(/\r\n?/g, '\n');

  const id = validateId(data.id);
  const date = validateDate(data.date);
  const effort = validateEffort(data.effort);
  const category = validateCategory(data.category);
  const duration = validateDuration(data.duration);
  const videoUrl = validateVideoUrl(data.videoUrl);

  validateTitlePresence(normalizedContent);
  validateRequiredSections(normalizedContent);

  // Parse techniques from markdown content
  const techniques = extractTechniques(normalizedContent);

  // Parse description and notes from markdown content
  const { description, notes } = extractContentSections(normalizedContent);

  const session: JudoSession = {
    id,
    date,
    effort,
    category,
    techniques,
    ...(description && { description }),
    ...(notes && { notes }),
    ...(duration !== undefined && { duration }),
    ...(videoUrl !== undefined && { videoUrl }),
  };

  return session;
}

function validateId(value: unknown): string {
  if (!value || typeof value !== 'string') {
    throw new Error('Missing or invalid "id" in frontmatter');
  }
  return value;
}

function validateDate(value: unknown): string {
  if (!value || typeof value !== 'string') {
    throw new Error('Missing or invalid "date" in frontmatter');
  }
  if (!SESSION_DATE_REGEX.test(value)) {
    throw new Error('Invalid "date" in frontmatter: must be YYYY-MM-DD');
  }

  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValidDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day;

  if (!isValidDate) {
    throw new Error('Invalid "date" in frontmatter: must be YYYY-MM-DD');
  }

  return value;
}

function isEffortLevel(value: number): value is EffortLevel {
  return value >= 1 && value <= 5;
}

function validateEffort(value: unknown): EffortLevel {
  if (
    value === undefined ||
    typeof value !== 'number' ||
    !Number.isInteger(value)
  ) {
    throw new Error('Missing or invalid "effort" in frontmatter');
  }
  if (!isEffortLevel(value)) {
    throw new Error('Invalid "effort" in frontmatter: must be between 1 and 5');
  }

  return value;
}

function validateCategory(value: unknown): SessionCategory {
  if (!value || typeof value !== 'string') {
    throw new Error('Missing or invalid "category" in frontmatter');
  }

  switch (value) {
    case 'Technical':
    case 'Randori':
    case 'Shiai':
      return value;
    default:
      throw new Error(
        'Invalid "category" in frontmatter: must be one of Technical, Randori, Shiai'
      );
  }
}

function validateDuration(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      'Invalid "duration" in frontmatter: must be a non-negative integer'
    );
  }

  return value;
}

function validateVideoUrl(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(
      'Invalid "videoUrl" in frontmatter: expected a valid absolute URL'
    );
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(
      'Invalid "videoUrl" in frontmatter: expected a valid absolute URL'
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      'Invalid "videoUrl" in frontmatter: protocol must be http or https'
    );
  }

  // Remove brackets for IPv6 addresses (URL.hostname includes them)
  const host = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.20.') ||
    host.startsWith('172.21.') ||
    host.startsWith('172.22.') ||
    host.startsWith('172.23.') ||
    host.startsWith('172.24.') ||
    host.startsWith('172.25.') ||
    host.startsWith('172.26.') ||
    host.startsWith('172.27.') ||
    host.startsWith('172.28.') ||
    host.startsWith('172.29.') ||
    host.startsWith('172.30.') ||
    host.startsWith('172.31.') ||
    host.startsWith('192.168.') ||
    host === '169.254.169.254'
  ) {
    throw new Error(
      'Invalid "videoUrl" in frontmatter: private or internal network addresses are not allowed'
    );
  }

  return parsedUrl.toString();
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

function validateRequiredSections(content: string): void {
  const requiredHeadings = [
    '## Techniques Practiced',
    '## Session Description',
    '## Notes',
  ];

  const discoveredHeadings = getSectionHeadingsOutsideFencedCodeBlocks(content);
  const missing = requiredHeadings
    .filter((heading) => !discoveredHeadings.has(heading))
    .map((heading) => heading.replace('## ', ''));

  if (missing.length > 0) {
    throw new Error(
      `markdown content is missing required sections: ${missing.join(', ')}`
    );
  }
}

function getSectionHeadingsOutsideFencedCodeBlocks(
  content: string
): Set<string> {
  const sectionHeadings = new Set([
    '## Techniques Practiced',
    '## Session Description',
    '## Notes',
  ]);
  const found = new Set<string>();
  const lines = content.split('\n');

  let inFencedCodeBlock = false;

  for (const line of lines) {
    if (isFencedCodeDelimiter(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    if (!inFencedCodeBlock && sectionHeadings.has(line)) {
      found.add(line);
    }
  }

  return found;
}

function isFencedCodeDelimiter(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

function validateTitlePresence(content: string): void {
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

  if (!titleLine.startsWith('# ')) {
    throw new Error(
      `Markdown content must begin with a level-1 title. Got: "${titleLine}"`
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
      recovered.videoUrl === session.videoUrl &&
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
