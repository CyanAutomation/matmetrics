export type PluginContext = {
  register?: (extensionId: string) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('tag-manager-dashboard-tab');
};
