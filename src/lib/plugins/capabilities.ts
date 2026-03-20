import type { UIExtension } from '@/lib/plugins/types';

export const KNOWN_PLUGIN_CAPABILITIES = ['tag_mutation'] as const;

export type KnownPluginCapability = (typeof KNOWN_PLUGIN_CAPABILITIES)[number];

const dashboardComponentCapabilityRequirements: Record<
  string,
  KnownPluginCapability
> = {
  tag_manager: 'tag_mutation',
};

const sessionActionCapabilityRequirements: Record<
  string,
  KnownPluginCapability
> = {
  'tag-session': 'tag_mutation',
};

const settingsPanelCapabilityRequirements: Record<
  string,
  KnownPluginCapability
> = {
  tag_settings: 'tag_mutation',
};

export const getRequiredCapabilityForExtension = (
  extension: UIExtension
): KnownPluginCapability | null => {
  switch (extension.type) {
    case 'dashboard_tab':
      return (
        dashboardComponentCapabilityRequirements[extension.config.component] ??
        null
      );
    case 'session_action':
      return (
        sessionActionCapabilityRequirements[extension.config.actionId] ?? null
      );
    case 'settings_panel':
      return (
        settingsPanelCapabilityRequirements[extension.config.component] ?? null
      );
    default:
      return null;
  }
};

export const hasCapability = (
  capabilities: readonly string[] | undefined,
  requiredCapability: KnownPluginCapability
): boolean => capabilities?.includes(requiredCapability) ?? false;
