import { type ZodIssue } from 'zod';

import {
  pluginManifestSchema,
  type PluginManifestSchema,
} from '@/lib/plugins/manifest-schema';
import type {
  PluginManifestValidationResult,
  PluginValidationIssue,
  PluginValidationSeverity,
  UIExtension,
  UIExtensionType,
} from '@/lib/plugins/types';

type ValidateManifestOptions = {
  allowExperimentalTypes?: boolean;
};

const knownExtensionTypes: UIExtensionType[] = [
  'dashboard_tab',
  'menu_item',
  'session_action',
  'settings_panel',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const makeIssue = (
  severity: PluginValidationSeverity,
  path: string,
  message: string
): PluginValidationIssue => ({ severity, path, message });

const zodIssuesToValidationIssues = (
  issues: ZodIssue[]
): PluginValidationIssue[] =>
  issues.map((issue) =>
    makeIssue(
      'error',
      issue.path.length > 0 ? issue.path.join('.') : 'manifest',
      issue.message
    )
  );

const requireNonEmptyString = (
  value: unknown,
  path: string,
  label: string
): PluginValidationIssue[] =>
  typeof value === 'string' && value.trim().length > 0
    ? []
    : [makeIssue('error', path, `${label} must be a non-empty string.`)];

const validateKnownExtension = (
  extension: UIExtension,
  index: number
): PluginValidationIssue[] => {
  const basePath = `uiExtensions[${index}]`;

  switch (extension.type) {
    case 'dashboard_tab':
      return [
        ...requireNonEmptyString(
          extension.config.tabId,
          `${basePath}.config.tabId`,
          'Dashboard tab id'
        ),
        ...requireNonEmptyString(
          extension.config.headerTitle,
          `${basePath}.config.headerTitle`,
          'Dashboard tab header title'
        ),
        ...requireNonEmptyString(
          extension.config.component,
          `${basePath}.config.component`,
          'Dashboard tab component'
        ),
      ];
    case 'menu_item':
      return [
        ...requireNonEmptyString(
          extension.config.route,
          `${basePath}.config.route`,
          'Menu item route'
        ),
        ...requireNonEmptyString(
          extension.config.location,
          `${basePath}.config.location`,
          'Menu item location'
        ),
      ];
    case 'session_action':
      return [
        ...requireNonEmptyString(
          extension.config.actionId,
          `${basePath}.config.actionId`,
          'Session action id'
        ),
        ...requireNonEmptyString(
          extension.config.component,
          `${basePath}.config.component`,
          'Session action component'
        ),
      ];
    case 'settings_panel':
      return [
        ...requireNonEmptyString(
          extension.config.section,
          `${basePath}.config.section`,
          'Settings panel section'
        ),
        ...requireNonEmptyString(
          extension.config.component,
          `${basePath}.config.component`,
          'Settings panel component'
        ),
      ];
    default:
      return [];
  }
};

export const validatePluginManifest = (
  value: unknown,
  options: ValidateManifestOptions = {}
): PluginManifestValidationResult => {
  const parsed = pluginManifestSchema.safeParse(value);

  if (!parsed.success) {
    return {
      isValid: false,
      issues: zodIssuesToValidationIssues(parsed.error.issues),
    };
  }

  const manifest = parsed.data as PluginManifestSchema;
  const issues: PluginValidationIssue[] = [];

  const seenExtensionIds = new Set<string>();

  manifest.uiExtensions.forEach((extension, index) => {
    const extensionPath = `uiExtensions[${index}]`;

    if (seenExtensionIds.has(extension.id)) {
      issues.push(
        makeIssue(
          'error',
          `${extensionPath}.id`,
          `Duplicate extension id "${extension.id}".`
        )
      );
    } else {
      seenExtensionIds.add(extension.id);
    }

    if (!knownExtensionTypes.includes(extension.type as UIExtensionType)) {
      if (!options.allowExperimentalTypes) {
        issues.push(
          makeIssue(
            'warning',
            `${extensionPath}.type`,
            `Unknown extension type "${extension.type}".`
          )
        );
      } else {
        issues.push(
          makeIssue(
            'info',
            `${extensionPath}.type`,
            `Experimental extension type "${extension.type}" accepted.`
          )
        );
      }

      return;
    }

    issues.push(
      ...validateKnownExtension(extension as UIExtension, index).filter(
        (issue) => issue.severity === 'error'
      )
    );
  });

  const hasErrors = issues.some((issue) => issue.severity === 'error');

  if (hasErrors) {
    return { isValid: false, issues };
  }

  const normalizedManifest = {
    ...manifest,
    enabled: manifest.enabled ?? true,
  };

  return {
    isValid: true,
    manifest: normalizedManifest,
    issues,
  };
};

export const isManifestValidationError = (
  issue: PluginValidationIssue
): boolean => issue.severity === 'error';

export const isManifestLike = (
  value: unknown
): value is Record<string, unknown> => isRecord(value);
