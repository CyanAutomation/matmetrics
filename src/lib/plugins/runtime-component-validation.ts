import { getDashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';
import { initializePluginComponentRegistry } from '@/lib/plugins/plugin-component-bootstrap';
import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';

type DeclaredManifestComponent = {
  componentId: string;
  extensionId: string;
  path: string;
};

/**
 * Severity policy:
 * We emit renderer-resolution findings as warnings (not errors) so plugin
 * authors can iterate on manifests without hard-failing schema validation.
 * Runtime bootstrap resolution is still treated as the authoritative signal for
 * maturity and runtime confidence scoring.
 */
const RUNTIME_RENDERER_UNRESOLVED_SEVERITY = 'warning';

const extractDeclaredManifestComponents = (
  manifest: PluginManifest
): DeclaredManifestComponent[] =>
  manifest.uiExtensions.flatMap((extension, index) => {
    const maybeComponent =
      'component' in extension.config ? extension.config.component : undefined;
    if (
      typeof maybeComponent !== 'string' ||
      maybeComponent.trim().length === 0
    ) {
      return [];
    }

    return [
      {
        componentId: maybeComponent,
        extensionId: extension.id,
        path: `uiExtensions[${index}].config.component`,
      },
    ];
  });

export const validateManifestComponentRenderers = async (
  manifest: PluginManifest
): Promise<PluginValidationIssue[]> => {
  void initializePluginComponentRegistry();

  return extractDeclaredManifestComponents(manifest).flatMap(
    ({ componentId, extensionId, path }) =>
      getDashboardTabRenderer(componentId)
        ? []
        : [
            {
              severity: RUNTIME_RENDERER_UNRESOLVED_SEVERITY,
              path,
              message: `Extension "${extensionId}" declares component "${componentId}" but no dashboard renderer is registered after plugin bootstrap.`,
            } satisfies PluginValidationIssue,
          ]
  );
};
