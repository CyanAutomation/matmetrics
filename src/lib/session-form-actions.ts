export function addTechnique(
  techniques: string[],
  candidate: string
): string[] {
  const normalized = candidate.trim();
  if (!normalized || techniques.includes(normalized)) return techniques;
  return [...techniques, normalized];
}

export function removeTechnique(
  techniques: string[],
  technique: string
): string[] {
  return techniques.filter((entry) => entry !== technique);
}

export function mergeSuggestedTechniques(
  techniques: string[],
  suggestions: string[]
): string[] {
  return Array.from(new Set([...techniques, ...suggestions]));
}
