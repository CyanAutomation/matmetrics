import tagsPluginManifest from '../../../plugins/tags/plugin.json';

import {
  type DashboardTabExtension,
  type PluginManifest,
  type PluginManifestValidationResult,
  type PluginValidationIssue,
  type ResolvedDashboardTabExtension,
} from '@/lib/plugins/types';

const localPluginManifestSources: unknown[] = [tagsPluginManifest];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const validateDashboardTabExtension = (
  value: unknown,
  path: string
): { extension?: DashboardTabExtension; issues: PluginValidationIssue[] } => {
  const issues: PluginValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      issues: [{ path, message: 'UI extension must be an object.' }],
    };
  }

  const requiredStringFields: Array<keyof DashboardTabExtension> = [
    'type',
    'id',
    'tabId',
    'title',
    'headerTitle',
    'component',
  ];

  for (const field of requiredStringFields) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      issues.push({
        path: `${path}.${field}`,
        message: 'Field must be a non-empty string.',
      });
    }
  }

  if (value.type !== 'dashboard_tab') {
    issues.push({
      path: `${path}.type`,
      message: 'Only uiExtensions of type "dashboard_tab" are supported.',
    });
  }

  if (value.icon != null && typeof value.icon !== 'string') {
    issues.push({
      path: `${path}.icon`,
      message: 'Field must be a string when provided.',
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    extension: {
      type: 'dashboard_tab',
      id: value.id as string,
      tabId: value.tabId as string,
      title: value.title as string,
      headerTitle: value.headerTitle as string,
      component: value.component as string,
      icon: value.icon as string | undefined,
    },
    issues,
  };
};

export const validatePluginManifest = (
  value: unknown
): PluginManifestValidationResult => {
  const issues: PluginValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      isValid: false,
      issues: [
        { path: 'manifest', message: 'Plugin manifest must be an object.' },
      ],
    };
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    issues.push({ path: 'id', message: 'Field must be a non-empty string.' });
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    issues.push({ path: 'name', message: 'Field must be a non-empty string.' });
  }

  if (typeof value.version !== 'string' || value.version.trim().length === 0) {
    issues.push({
      path: 'version',
      message: 'Field must be a non-empty string.',
    });
  }

  if (typeof value.enabled !== 'boolean') {
    issues.push({ path: 'enabled', message: 'Field must be a boolean.' });
  }

  if (!Array.isArray(value.uiExtensions)) {
    issues.push({
      path: 'uiExtensions',
      message: 'Field must be an array of UI extensions.',
    });
  }

  const uiExtensions: DashboardTabExtension[] = [];
  if (Array.isArray(value.uiExtensions)) {
    value.uiExtensions.forEach((extensionValue, index) => {
      const result = validateDashboardTabExtension(
        extensionValue,
        `uiExtensions[${index}]`
      );
      if (result.extension) {
        uiExtensions.push(result.extension);
      }
      issues.push(...result.issues);
    });
  }

  if (issues.length > 0) {
    return { isValid: false, issues };
  }

  return {
    isValid: true,
    manifest: {
      id: value.id as string,
      name: value.name as string,
      version: value.version as string,
      enabled: value.enabled as boolean,
      uiExtensions,
    },
  };
};

export const getLocalPluginManifestCandidates = (): unknown[] =>
  localPluginManifestSources;

export const loadPluginManifests = (): PluginManifest[] =>
  getLocalPluginManifestCandidates()
    .map(validatePluginManifest)
    .flatMap((result) => (result.isValid ? [result.manifest] : []));

export const loadEnabledDashboardTabExtensions =
  (): ResolvedDashboardTabExtension[] =>
    loadPluginManifests()
      .filter((manifest) => manifest.enabled)
      .flatMap((manifest) =>
        manifest.uiExtensions
          .filter((extension) => extension.type === 'dashboard_tab')
          .map((extension) => ({
            pluginId: manifest.id,
            extension,
          }))
      );
