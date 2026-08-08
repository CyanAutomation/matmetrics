import { getDashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';
import { initializePluginComponentRegistry } from '@/lib/plugins/plugin-component-bootstrap';
import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';
import { extractDeclaredComponentIds } from '@/lib/plugins/plugin-contract-gate-utils';

/**
 * Severity policy:
 * We emit renderer-resolution findings as warnings (not errors) so plugin
 * authors can iterate on manifests without hard-failing schema validation.
 * Runtime bootstrap resolution is still treated as the authoritative signal for
 * maturity and runtime confidence scoring.
 */
const RUNTIME_RENDERER_UNRESOLVED_SEVERITY = 'warning';

export const validateManifestComponentRenderers = async (
  manifest: PluginManifest
): Promise<PluginValidationIssue[]> => {
  await initializePluginComponentRegistry();

  return extractDeclaredComponentIds(manifest).flatMap(
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
