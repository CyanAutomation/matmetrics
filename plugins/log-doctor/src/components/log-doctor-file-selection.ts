import type { ScanResult } from './log-doctor-state';

export type InvalidFileSelection = {
  path: string;
  selectId: string;
};

export const getInvalidFiles = (scanResult: ScanResult | null | undefined) =>
  scanResult?.files.filter((file) => file.status === 'invalid') ?? [];

export const buildInvalidFileSelections = (
  invalidFiles: Array<{ path: string }>,
  createId: (path: string, index: number) => string
): InvalidFileSelection[] =>
  invalidFiles.map((file, rowIndex) => ({
    path: file.path,
    selectId: createId(file.path, rowIndex),
  }));

export const filterInvalidFiles = <T extends { path: string }>(
  invalidFiles: T[],
  search: string
): T[] => {
  const normalizedSearch = search.trim().toLowerCase();
  return normalizedSearch
    ? invalidFiles.filter((file) =>
        file.path.toLowerCase().includes(normalizedSearch)
      )
    : invalidFiles;
};

export const toggleSelectedPath = (
  selectedPaths: string[],
  path: string
): string[] =>
  selectedPaths.includes(path)
    ? selectedPaths.filter((item) => item !== path)
    : [...selectedPaths, path];
