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
 * # March 16, 2026 – Judo Session
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

  // Format the date for display in title (e.g., "March 16, 2026")
  const dateObj = new Date(session.date + 'T00:00:00Z');
  const dateStr = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let content = `# ${dateStr} – Judo Session\n\n`;

  // Techniques section
  content += '## Techniques Practiced\n';
  if (session.techniques.length > 0) {
    content += session.techniques.map(t => `- ${t}`).join('\n');
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
 */
export function markdownToSession(markdown: string): JudoSession {
  const { data, content } = matter(markdown);

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

  // Parse techniques from markdown content
  const techniques = extractTechniques(content);

  // Parse description and notes from markdown content  
  const { description, notes } = extractContentSections(content);

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
function extractContentSections(
  content: string
): { description: string | undefined; notes: string | undefined } {
  const description = extractSectionContent(content, 'Session Description')?.trim();
  const notes = extractSectionContent(content, 'Notes')?.trim();

  return { description, notes };
}

/**
 * Extract section body content for a markdown heading.
 * Handles optional blank line after heading and end-of-file boundaries
 * with or without trailing newlines.
 */
function extractSectionContent(content: string, heading: string): string | undefined {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(
    `## ${escapedHeading}\\n(?:\\n)?([\\s\\S]*?)(?=\\n## |\\s*$)`
  );

  const match = content.match(sectionRegex);
  return match ? match[1].trimEnd() : undefined;
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
  } catch (e) {
    return false;
  }
}

/**
 * Local parser validation helper for edge cases that have broken in production.
 */
export function validateMarkdownParserEdgeCases(): boolean {
  const baseMarkdown = `---
id: "edge-1"
date: "2026-03-16"
effort: 3
category: "Technical"
---

# March 16, 2026 – Judo Session

## Techniques Practiced
- O soto gari

## Session Description

Includes the letter Z in the middle of content.

## Notes

Finishes at file end with Z`;

  const parsedNoTrailingNewline = markdownToSession(baseMarkdown);
  if (
    parsedNoTrailingNewline.techniques[0] !== 'O soto gari' ||
    parsedNoTrailingNewline.description !== 'Includes the letter Z in the middle of content.' ||
    parsedNoTrailingNewline.notes !== 'Finishes at file end with Z'
  ) {
    return false;
  }

  const parsedWithTrailingNewline = markdownToSession(`${baseMarkdown}\n`);
  if (parsedWithTrailingNewline.notes !== 'Finishes at file end with Z') {
    return false;
  }

  const roundtripSession: JudoSession = {
    id: 'edge-roundtrip',
    date: '2026-03-17',
    effort: 4,
    category: 'Technical',
    techniques: ['Uchi mata', 'Tai otoshi'],
    description: 'Roundtrip description with Z marker',
    notes: 'Roundtrip notes ending at file end Z',
  };

  return validateRoundtrip(roundtripSession);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}
