export type PluginUIType = 'dashboard_tab';

export type PluginUICompositionBlock =
  | 'single_top_level_page_shell'
  | 'primary_content_sectioned'
  | 'destructive_flow_wrapped';

export type PluginUIConformanceRule = {
  requiredCompositionBlocks: PluginUICompositionBlock[];
  compositionPrimitives: {
    pageShell: string;
    primarySections: string[];
    destructiveFlowWrappers: string[];
  };
};

export const PLUGIN_UI_CONFORMANCE_RULES: Record<
  PluginUIType,
  PluginUIConformanceRule
> = {
  dashboard_tab: {
    requiredCompositionBlocks: [
      'single_top_level_page_shell',
      'primary_content_sectioned',
      'destructive_flow_wrapped',
    ],
    compositionPrimitives: {
      pageShell: '@/components/plugins/plugin-page-shell#PluginPageShell',
      primarySections: [
        '@/components/plugins/plugin-kit#PluginFormSection',
        '@/components/plugins/plugin-kit#PluginTableSection',
        '@/components/plugins/plugin-section-card#PluginSectionCard',
      ],
      destructiveFlowWrappers: [
        '@/components/plugins/plugin-confirmation#PluginConfirmationDialog',
        '@/components/plugins/plugin-destructive-action#PluginDestructiveAction',
      ],
    },
  },
};

export const getPluginUiConformanceRules = (
  pluginType: PluginUIType
): PluginUIConformanceRule => PLUGIN_UI_CONFORMANCE_RULES[pluginType];
