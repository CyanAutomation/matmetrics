import type { PluginManifest } from '@/lib/plugins/types';

export const COMPONENT_REGISTRATION_PATTERN =
  /registerPluginComponent(?:\?\.|\.)?\(\s*['\"]([^'\"]+)['\"]/g;

export const UX_STATE_EVIDENCE_CRITERIA = {
  loading: 'loadingStatePresent',
  error: 'errorStateWithRecovery',
  empty: 'emptyStateWithCta',
  destructive: 'destructiveActionSafety',
} as const;

export const TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

export const toComponentFileName = (componentId: string): string =>
  `${componentId.trim().toLowerCase().replace(/_/g, '-')}.tsx`;

export const extractRuntimeRegisteredComponentIds = (
  source: string
): Set<string> => {
  const ids = new Set<string>();
  for (const match of source.matchAll(COMPONENT_REGISTRATION_PATTERN)) {
    const componentId = match[1]?.trim();
    if (componentId) ids.add(componentId);
  }
  return ids;
};

export const extractDeclaredComponentIds = (
  manifest: Pick<PluginManifest, 'uiExtensions'>
) =>
  manifest.uiExtensions.flatMap((extension, index) => {
    const maybeComponent =
      'component' in extension.config ? extension.config.component : undefined;
    if (typeof maybeComponent !== 'string' || !maybeComponent.trim()) return [];
    return [
      {
        extensionId: extension.id,
        componentId: maybeComponent,
        path: `uiExtensions[${index}].config.component`,
      },
    ];
  });

export const hasRequiredReadmeSections = (content: string): boolean =>
  /^#{1,6}\s*ui ownership\b/im.test(content) &&
  /^#{1,6}\s*usage\b/im.test(content) &&
  /^#{1,6}\s*verification\b/im.test(content);

export const isDisallowedEntrypointComponentImport = (
  source: string
): boolean =>
  source.startsWith('@/components/') &&
  !source.startsWith('@/components/plugins/') &&
  !source.startsWith('@/components/ui/');

export const extractDisallowedEntrypointComponentImports = (
  source: string
): string[] => {
  const imports = new Set<string>();
  const pattern =
    /^import\s+[\s\S]*?from\s+['"](@\/components\/[^'"]+)['"];?$/gm;
  for (const match of source.matchAll(pattern)) {
    const importSource = match[1]?.trim();
    if (importSource && isDisallowedEntrypointComponentImport(importSource)) {
      imports.add(importSource);
    }
  }
  return [...imports].sort((a, b) => a.localeCompare(b));
};
