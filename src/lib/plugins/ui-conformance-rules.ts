export type PluginUIType = 'dashboard_tab';

export type PluginUICompositionBlock =
  | 'single_top_level_page_shell'
  | 'primary_content_sectioned'
  | 'destructive_flow_wrapped';

export type PluginUIConformanceRule = {
  requiredCompositionBlocks: PluginUICompositionBlock[];
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
  },
};

export const getPluginUiConformanceRules = (
  pluginType: PluginUIType
): PluginUIConformanceRule => PLUGIN_UI_CONFORMANCE_RULES[pluginType];
