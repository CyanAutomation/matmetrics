/**
 * Removes a small set of presentation artifacts that models sometimes add to
 * otherwise plain prose. It deliberately avoids broad Markdown parsing so
 * punctuation and paragraph structure remain intact.
 */
export function normalizeAiProse(output: string): string {
  const lines = output.replace(/\r\n?/g, '\n').split('\n');

  const withoutPresentationLines = lines.filter((line, index) => {
    const trimmed = line.trim();

    if (/^`{3,}(?:\w+)?$/.test(trimmed)) return false;
    if (/^#{1,6}\s+\S/.test(trimmed)) return false;

    // A short, fully emphasized first line is normally a generated title.
    if (
      index === lines.findIndex((candidate) => candidate.trim() !== '') &&
      trimmed.length <= 100 &&
      !/[.!?]$/.test(trimmed) &&
      /^(?:\*\*|__)[^\n]+(?:\*\*|__)$/.test(trimmed)
    ) {
      return false;
    }

    return true;
  });

  return withoutPresentationLines
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .trim();
}
