import type { UIExtension } from '@/lib/plugins/types';

export const KNOWN_PLUGIN_CAPABILITIES = ['tag_mutation'] as const;

export type KnownPluginCapability = (typeof KNOWN_PLUGIN_CAPABILITIES)[number];

const dashboardComponentCapabilityRequirements = {
  tag_manager: 'tag_mutation',
} as const satisfies Record<string, KnownPluginCapability>;

const sessionActionCapabilityRequirements = {
  'tag-session': 'tag_mutation',
} as const satisfies Record<string, KnownPluginCapability>;

const settingsPanelCapabilityRequirements = {
  tag_settings: 'tag_mutation',
} as const satisfies Record<string, KnownPluginCapability>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasStringComponentConfig = (
  config: unknown
): config is { component: string } =>
  isObjectRecord(config) && typeof config.component === 'string';

const hasStringActionIdConfig = (
  config: unknown
): config is { actionId: string } =>
  isObjectRecord(config) && typeof config.actionId === 'string';

export const getRequiredCapabilityForExtension = (
  extension: UIExtension
): KnownPluginCapability | null => {
  switch (extension.type) {
    case 'dashboard_tab':
      if (!hasStringComponentConfig(extension.config)) {
        return null;
      }

      return (
        dashboardComponentCapabilityRequirements[extension.config.component] ?? null
      );
    case 'session_action':
      if (!hasStringActionIdConfig(extension.config)) {
        return null;
      }

      return sessionActionCapabilityRequirements[extension.config.actionId] ?? null;
    case 'settings_panel':
      if (!hasStringComponentConfig(extension.config)) {
        return null;
      }

      return settingsPanelCapabilityRequirements[extension.config.component] ?? null;
    default:
      return null;
  }
};

export const hasCapability = (
  capabilities: readonly string[] | undefined,
  requiredCapability: KnownPluginCapability
): boolean => capabilities?.includes(requiredCapability) ?? false;
