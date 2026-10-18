import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const readmePath = path.join(repositoryRoot, 'README.md');

function hideFencedCode(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (!fence && marker) {
        fence = marker[1][0];
        return '';
      }
      if (fence && marker && marker[1][0] === fence) {
        fence = null;
        return '';
      }
      return fence ? '' : line;
    })
    .join('\n');
}

function githubHeadingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const source = hideFencedCode(markdown);
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const heading = match[1]
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    let slug = heading;
    let suffix = 0;
    while (slugs.has(slug)) {
      suffix += 1;
      slug = `${heading}-${suffix}`;
    }
    slugs.add(slug);
  }
  return slugs;
}

export function validateHeadingStructure(
  markdown: string,
  displayPath = 'README.md'
): string[] {
  const issues = [];
  const source = hideFencedCode(markdown);
  let previousLevel = 0;
  let sawHeading = false;

  for (const [index, line] of source.split('\n').entries()) {
    const heading = line.match(/^(#{1,6})\s+\S/);
    if (!heading) continue;

    const level = heading[1].length;
    if (!sawHeading && level !== 1) {
      issues.push(`${displayPath}:${index + 1}: first heading must be level 1`);
    } else if (sawHeading && level > previousLevel + 1) {
      issues.push(
        `${displayPath}:${index + 1}: heading level skipped from ${previousLevel} to ${level}`
      );
    }

    sawHeading = true;
    previousLevel = level;
  }

  if (!sawHeading) issues.push(`${displayPath}:1: document has no heading`);
  return issues;
}

export async function validateMarkdownLinks(
  markdown: string,
  sourceFilePath: string,
  rootDir: string = repositoryRoot
): Promise<string[]> {
  const sourcePath = path.resolve(sourceFilePath);
  const displayPath = path.relative(rootDir, sourcePath) || path.basename(sourcePath);
  const source = hideFencedCode(markdown);
  const sourceHeadings = githubHeadingSlugs(markdown);
  const issues = [];
  const linkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;

  for (const match of source.matchAll(linkPattern)) {
    const destination = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) continue;

    const line = source.slice(0, match.index).split('\n').length;
    const hashIndex = destination.indexOf('#');
    const pathname = (hashIndex === -1
      ? destination
      : destination.slice(0, hashIndex)
    ).split('?')[0];
    const fragment = hashIndex === -1 ? '' : destination.slice(hashIndex + 1);
    const targetPath = pathname
      ? path.resolve(path.dirname(sourcePath), decodeURIComponent(pathname))
      : sourcePath;

    if (targetPath !== rootDir && !targetPath.startsWith(`${rootDir}${path.sep}`)) {
      issues.push(`${displayPath}:${line}: link escapes repository: ${destination}`);
      continue;
    }

    if (pathname) {
      try {
        await access(targetPath);
      } catch {
        issues.push(`${displayPath}:${line}: missing local link: ${destination}`);
        continue;
      }
    }

    if (!fragment) continue;
    const decodedFragment = decodeURIComponent(fragment);
    const targetIsMarkdown = targetPath.toLowerCase().endsWith('.md');
    if (!targetIsMarkdown && targetPath !== sourcePath) continue;

    let targetHeadings = sourceHeadings;
    if (targetPath !== sourcePath) {
      targetHeadings = githubHeadingSlugs(await readFile(targetPath, 'utf8'));
    }
    if (!targetHeadings.has(decodedFragment)) {
      issues.push(`${displayPath}:${line}: missing heading anchor: ${destination}`);
    }
  }

  return issues;
}

async function main() {
  const markdown = await readFile(readmePath, 'utf8');
  const issues = [
    ...validateHeadingStructure(markdown),
    ...(await validateMarkdownLinks(markdown, readmePath, repositoryRoot)),
  ];

  if (issues.length > 0) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log('README heading structure and local links are valid.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
