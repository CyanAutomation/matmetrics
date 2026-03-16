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
  const techniquesMatch = content.match(
    /## Techniques Practiced\n([\s\S]*?)(?=## |\Z)/
  );
  if (!techniquesMatch) return [];

  const techniqueText = techniquesMatch[1];
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
  const descriptionMatch = content.match(
    /## Session Description\n\n([\s\S]*?)(?=## |\Z)/
  );
  const notesMatch = content.match(/## Notes\n\n([\s\S]*?)$/);

  const description = descriptionMatch
    ? descriptionMatch[1].trim()
    : undefined;
  const notes = notesMatch ? notesMatch[1].trim() : undefined;

  return { description, notes };
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

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}
