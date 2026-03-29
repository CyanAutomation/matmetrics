export const createDomSafePathId = (path: string, rowIndex: number): string => {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const shortHash = (hash >>> 0).toString(36);
  return `select-file-${rowIndex}-${shortHash}`;
  return `select-file-${rowIndex}-${shortHash}`;
};
