export type DashboardTabExtensionType = 'dashboard_tab';

export type DashboardTabExtension = {
  type: DashboardTabExtensionType;
  id: string;
  tabId: string;
  title: string;
  headerTitle: string;
  icon?: string;
  component: string;
};

export type UIExtension = DashboardTabExtension;

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  uiExtensions: UIExtension[];
};

export type PluginValidationIssue = {
  path: string;
  message: string;
};

export type PluginManifestValidationSuccess = {
  isValid: true;
  manifest: PluginManifest;
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
