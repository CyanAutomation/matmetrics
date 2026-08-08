export const parseReadmeSections = (contents: string): string[] => {
  const headings = new Set<string>();
  for (const match of contents.matchAll(/^##\s+(.+)$/gm)) {
    const heading = match[1]?.trim();
    if (heading) headings.add(heading);
  }
  return [...headings];
};
