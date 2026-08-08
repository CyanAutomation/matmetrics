/**
 * Feature Quality Scoring
 *
 * Evaluates whether declared UI components are actually present and accessible:
 * - Components declared in manifest
 * - Component files exist (local or shared)
 * - Components registered at runtime
 * - Component implementation quality (inferred from organization)
 */

import path from 'node:path';

import type { PluginManifest } from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';
import {
  pushUnique,
  fileExists,
  componentIdToComponentBasename,
  getManifestComponentIds,
} from './utils';

const toComponentFileName = (componentId: string): string =>
  `${componentIdToComponentBasename(componentId)}.tsx`;

export async function scoreFeatureQuality(
  manifest: PluginManifest,
  pluginDirectoryName: string | undefined,
  pluginsRoot: string,
  registeredPluginComponents: string[]
): Promise<CategoryScoringResult> {
  let score = 0;
  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const blockers: string[] = [];

  const pluginDir = path.join(pluginsRoot, pluginDirectoryName ?? manifest.id);
  const repoRoot = path.dirname(pluginsRoot);
  const pluginComponentsRoot = path.join(pluginDir, 'src', 'components');

  // Get component IDs from manifest
  const componentIds = getManifestComponentIds(manifest);

  // Score: Components declared in manifest (5 points)
  if (componentIds.length > 0) {
    score += 5;
  }

  // Check component resolution
  let resolvedComponentCount = 0;
  const missingComponentEvidence: string[] = [];

  for (const componentId of componentIds) {
    const componentFileName = toComponentFileName(componentId);
    const pluginLocalComponentPath = path.join(
      pluginComponentsRoot,
      componentFileName
    );
    const sharedComponentPath = path.join(
      repoRoot,
      'src',
      'components',
      componentFileName
    );
    const hasRuntimeRegistration =
      registeredPluginComponents.includes(componentId);

    if (
      (await fileExists(pluginLocalComponentPath)) ||
      (await fileExists(sharedComponentPath)) ||
      hasRuntimeRegistration
    ) {
      resolvedComponentCount += 1;
      continue;
    }

    missingComponentEvidence.push(componentId);
  }

  // Score: All components resolved (10 points)
  if (
    resolvedComponentCount === componentIds.length &&
    componentIds.length > 0
  ) {
    score += 10;
    pushUnique(
      evidence,
      'Declared components resolve through plugin-local files, shared components, or runtime registration evidence.'
    );
  } else if (missingComponentEvidence.length > 0) {
    pushUnique(
      reasons,
      'Some declared plugin components could not be resolved from plugin-local files, shared components, or runtime registration.'
    );
    pushUnique(
      nextActions,
      'For each declared component, add plugins/<id>/src/components/<component>.tsx, add src/components/<component>.tsx, or register it in plugins/<id>/src/index.ts.'
    );
  }

  // Clamp score to category maximum (25)
  score = Math.max(0, Math.min(25, score));

  return {
    score,
    evidence,
    reasons,
    nextActions,
    blockers,
  };
}
