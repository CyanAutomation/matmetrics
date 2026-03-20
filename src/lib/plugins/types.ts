export type DashboardTabExtensionType = 'dashboard_tab';
export type MenuItemExtensionType = 'menu_item';
export type SessionActionExtensionType = 'session_action';
export type SettingsPanelExtensionType = 'settings_panel';

export type UIExtensionType =
  | DashboardTabExtensionType
  | MenuItemExtensionType
  | SessionActionExtensionType
  | SettingsPanelExtensionType;

export type DashboardTabExtension = {
  type: DashboardTabExtensionType;
  id: string;
  title: string;
  config: {
    tabId: string;
    headerTitle: string;
    component: string;
    icon?: string;
  };
};

export type MenuItemExtension = {
  type: MenuItemExtensionType;
  id: string;
  title: string;
  config: {
    route: string;
    location: string;
  };
};

export type SessionActionExtension = {
  type: SessionActionExtensionType;
  id: string;
  title: string;
  config: {
    actionId: string;
    component: string;
  };
};

export type SettingsPanelExtension = {
  type: SettingsPanelExtensionType;
  id: string;
  title: string;
  config: {
    section: string;
    component: string;
  };
};

export type UnknownUIExtension = {
  type: string;
  id: string;
  title: string;
  config: Record<string, unknown>;
};

export type UIExtension =
  | DashboardTabExtension
  | MenuItemExtension
  | SessionActionExtension
  | SettingsPanelExtension
  | UnknownUIExtension;

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  settings?: Record<string, unknown>;
  enabled: boolean;
  uiExtensions: UIExtension[];
};

export type PluginValidationSeverity = 'error' | 'warning' | 'info';

export type PluginValidationIssue = {
  severity: PluginValidationSeverity;
  path: string;
  message: string;
};

export type PluginManifestValidationSuccess = {
  isValid: true;
  manifest: PluginManifest;
  issues: PluginValidationIssue[];
};

export type PluginManifestValidationFailure = {
  isValid: false;
  issues: PluginValidationIssue[];
};

export type PluginManifestValidationResult =
  | PluginManifestValidationSuccess
  | PluginManifestValidationFailure;

export type ResolvedDashboardTabExtension = {
  pluginId: string;
  extension: DashboardTabExtension;
};
