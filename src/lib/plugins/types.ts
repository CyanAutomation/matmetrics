export const MAX_PLUGIN_ID_LENGTH = 120;

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

export type PluginUILayoutVariant = 'standard' | 'wide' | (string & {});

export type PluginUIContractState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'destructive';

export type PluginUIContract = {
  layoutVariant: PluginUILayoutVariant;
  requiredUxStates: PluginUIContractState[];
  designTokenVariants?: string[];
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  owner?: string;
  capabilities?: string[];
  author?: string;
  homepage?: string;
  settings?: Record<string, unknown>;
  enabled: boolean;
  minVersion?: string;
  maturity?: PluginManifestMaturityMetadata;
  uiContract?: PluginUIContract;
  uiExtensions: UIExtension[];
};

export type PluginMaturityTier = 'bronze' | 'silver' | 'gold';

export type PluginMaturityUxCriterion =
  | 'loadingStatePresent'
  | 'errorStateWithRecovery'
  | 'emptyStateWithCta'
  | 'destructiveActionSafety';

export type PluginMaturityEvidenceSource = 'explicit' | 'heuristic' | 'none';

export type PluginManifestMaturityEvidence = {
  testFiles?: string[];
  uxCriteria?: Partial<Record<PluginMaturityUxCriterion, string[]>>;
};

export type PluginManifestMaturityMetadata = {
  tier?: PluginMaturityTier;
  notes?: string;
  lastReviewedAt?: string;
  uxStates?: {
    loading?: boolean;
    error?: boolean;
    empty?: boolean;
    destructiveAction?: boolean;
  };
  uxCriteria?: {
    loadingStatePresent?: boolean;
    errorStateWithRecovery?: boolean;
    emptyStateWithCta?: boolean;
    destructiveActionSafety?: {
      relevant?: boolean;
      confirmation?: boolean;
      cancellation?: boolean;
    };
  };
  evidence?: PluginManifestMaturityEvidence;
};

export type PluginMaturityCategory =
  | 'contract_metadata'
  | 'runtime_integration'
  | 'feature_quality'
  | 'test_coverage'
  | 'operability_docs';

export type PluginMaturityCategoryScore = {
  label: string;
  earned: number;
  possible: number;
};

export type PluginMaturityScorecard = {
  score: number;
  tier: PluginMaturityTier;
  categoryScores: Record<PluginMaturityCategory, PluginMaturityCategoryScore>;
  reasons: string[];
  nextActions: string[];
  evidence: string[];
  verificationDetails: {
    testEvidenceSource: PluginMaturityEvidenceSource;
    testEvidenceFiles: string[];
    readmeSections: string[];
    uxCriteria: Record<
      PluginMaturityUxCriterion,
      {
        label: string;
        relevant: boolean;
        declared: boolean;
        verified: boolean;
        source: PluginMaturityEvidenceSource;
        files: string[];
      }
    >;
  };
  declaredTier?: PluginMaturityTier;
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

export type PluginRuntimeWarningCode =
  | 'dashboard_tab_renderer_unresolved'
  | 'dashboard_tab_missing_capability'
  | 'dashboard_tab_surface_layout_variant_unknown'
  | 'dashboard_tab_required_ux_state_helper_missing'
  | 'dashboard_tab_design_token_variants_missing';

export type PluginRuntimeWarning = PluginValidationIssue & {
  code: PluginRuntimeWarningCode;
  pluginId: string;
  extensionId: string;
  componentId?: string;
};
export type ResolvedDashboardTabExtension = {
  pluginId: string;
  capabilities: string[];
  extension: DashboardTabExtension;
  uiContract?: PluginUIContract;
};
