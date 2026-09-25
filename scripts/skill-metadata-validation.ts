import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export type SkillDiagnostic = {
  path: string;
  severity: 'error' | 'warning';
  message: string;
};

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const MARKDOWN_LINK_RE = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g;

function repoRelativePath(repoRoot: string, filePath: string): string {
  return relative(repoRoot, filePath).split(sep).join('/');
}

function parseTopLevelMetadata(frontMatter: string): Map<string, string> {
  const metadata = new Map<string, string>();

  for (const line of frontMatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const unquotedValue =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;

    metadata.set(key, unquotedValue);
  }

  return metadata;
}

function findMarkdownFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

function checkMarkdownLinks(
  markdownPath: string,
  repoRoot: string
): SkillDiagnostic[] {
  const content = readFileSync(markdownPath, 'utf8');
  const diagnostics: SkillDiagnostic[] = [];
  const relativeMarkdownPath = repoRelativePath(repoRoot, markdownPath);

  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const rawDestination = match[1].startsWith('<')
      ? match[1].slice(1, -1)
      : match[1];
    const destination = rawDestination.trim();

    if (
      destination.length === 0 ||
      destination.startsWith('#') ||
      destination.startsWith('//') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
    ) {
      continue;
    }

    const localPath = destination.split(/[?#]/, 1)[0];
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(localPath);
    } catch {
      decodedPath = localPath;
    }

    const targetPath = decodedPath.startsWith('/')
      ? resolve(repoRoot, `.${decodedPath}`)
      : resolve(dirname(markdownPath), decodedPath);

    if (!existsSync(targetPath)) {
      const line = content.slice(0, match.index).split('\n').length;
      diagnostics.push({
        path: relativeMarkdownPath,
        severity: 'error',
        message: `Broken local Markdown link on line ${line}: ${destination}`,
      });
    }
  }

  return diagnostics;
}

function validateSkillDirectory(
  skillDirectory: string,
  folderName: string,
  repoRoot: string
): SkillDiagnostic[] {
  const skillPath = join(skillDirectory, 'SKILL.md');
  const relativeSkillPath = repoRelativePath(repoRoot, skillPath);
  const diagnostics: SkillDiagnostic[] = [];

  if (!existsSync(skillPath)) {
    return [
      {
        path: relativeSkillPath,
        severity: 'error',
        message: 'Skill directory is missing SKILL.md.',
      },
    ];
  }

  const content = readFileSync(skillPath, 'utf8');
  const match = content.match(FRONT_MATTER_RE);

  if (!match) {
    diagnostics.push({
      path: relativeSkillPath,
      severity: 'error',
      message: 'Missing YAML frontmatter at the beginning of SKILL.md.',
    });
  } else {
    const metadata = parseTopLevelMetadata(match[1]);
    const name = metadata.get('name');
    const description = metadata.get('description');

    if (!name) {
      diagnostics.push({
        path: relativeSkillPath,
        severity: 'error',
        message: 'Missing required top-level metadata field: name.',
      });
    } else if (name !== folderName) {
      diagnostics.push({
        path: relativeSkillPath,
        severity: 'error',
        message: `Metadata name "${name}" does not match skill folder "${folderName}".`,
      });
    }

    if (!description) {
      diagnostics.push({
        path: relativeSkillPath,
        severity: 'error',
        message: 'Missing required top-level metadata field: description.',
      });
    }

    if (!metadata.get('license')) {
      diagnostics.push({
        path: relativeSkillPath,
        severity: 'warning',
        message: 'Metadata field license is recommended.',
      });
    }
  }

  for (const markdownPath of findMarkdownFiles(skillDirectory)) {
    diagnostics.push(...checkMarkdownLinks(markdownPath, repoRoot));
  }

  return diagnostics;
}

export function validateSkills(
  skillsRoot: string,
  repoRoot: string
): SkillDiagnostic[] {
  if (!existsSync(skillsRoot)) {
    return [
      {
        path: repoRelativePath(repoRoot, skillsRoot),
        severity: 'error',
        message: 'Skills directory does not exist.',
      },
    ];
  }

  const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (skillDirectories.length === 0) {
    return [
      {
        path: repoRelativePath(repoRoot, skillsRoot),
        severity: 'error',
        message: 'No skill directories found.',
      },
    ];
  }

  return skillDirectories.flatMap((folderName) =>
    validateSkillDirectory(join(skillsRoot, folderName), folderName, repoRoot)
  );
}
