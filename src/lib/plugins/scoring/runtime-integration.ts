/**
 * Runtime Integration Scoring
 *
 * Evaluates whether the plugin wires up correctly at runtime:
 * - UI extensions declared in manifest
 * - Entry module (src/index.ts) exists and exports bootstrap
 * - Extension IDs registered in entry module
 * - Components resolved and registered at runtime
 * - No capability/compatibility warnings
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  PluginManifest,
  PluginValidationIssue,
} from '@/lib/plugins/types';
import type { CategoryScoringResult } from './types';
import {
  pushUnique,
  fileExists,
  extractRegisteredPluginComponents,
  getManifestComponentIds,
} from './utils';

export async function scoreRuntimeIntegration(
  manifest: PluginManifest,
  validationIssues: PluginValidationIssue[],
  pluginDirectoryName: string | undefined,
  pluginsRoot: string,
  autoDisabledWithWarnings: string[]
): Promise<CategoryScoringResult> {
  let score = 0;
  const evidence: string[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];
  const blockers: string[] = [];

  const pluginDir = path.join(pluginsRoot, pluginDirectoryName ?? manifest.id);
  const pluginEntryPath = path.join(pluginDir, 'src', 'index.ts');

  // Get component IDs from manifest UI extensions
  const componentIds = getManifestComponentIds(manifest);

  // Get unresolved component warnings
  const unresolvedRuntimeComponentWarnings = validationIssues.filter(
    (issue) =>
      issue.severity === 'warning' &&
      issue.path.includes('.config.component') &&
      issue.message.includes('no dashboard renderer is registered')
  );

  // Score: UI extensions declared (4 points)
  if (manifest.uiExtensions.length > 0) {
    score += 4;
  }

  // Score: Entry module exists (6 points)
  if (await fileExists(pluginEntryPath)) {
    score += 6;
    pushUnique(
      evidence,
      'Plugin entry module exists under plugins/<id>/src/index.ts.'
    );

    const entryContents = await readFile(pluginEntryPath, 'utf8');

    // Score: Extension IDs registered in entry (4 points)
    const hasExtensionRegistrations = manifest.uiExtensions.every((extension) =>
      entryContents.includes(extension.id)
    );
    if (hasExtensionRegistrations) {
      score += 4;
      pushUnique(
        evidence,
        'Plugin entry registers its declared extension ids.'
      );
    } else {
      pushUnique(
        reasons,
        'Plugin entry does not obviously register all declared extensions.'
      );
      pushUnique(
        nextActions,
        'Align plugin entry registration calls with the manifest.'
      );
    }

    // Score: Components resolved at runtime (4 points)
    if (
      componentIds.length === 0 ||
      unresolvedRuntimeComponentWarnings.length === 0
    ) {
      score += 4;
      pushUnique(
        evidence,
        'Declared manifest components resolve to registered renderers after plugin bootstrap.'
      );
    } else {
      pushUnique(
        reasons,
        'Some manifest component ids do not resolve to registered renderers at runtime.'
      );
      pushUnique(
        nextActions,
        'Register each declared manifest component id during plugin bootstrap.'
      );
    }

    // Score: Static entry scan alignment (supplemental signal)
    const registeredPluginComponents =
      extractRegisteredPluginComponents(entryContents);
    const missingComponentRegistrations = componentIds.filter(
      (componentId) => !registeredPluginComponents.includes(componentId)
    );
    if (
      componentIds.length === 0 ||
      missingComponentRegistrations.length === 0
    ) {
      pushUnique(
        evidence,
        'Static plugin-entry scan aligns registerPluginComponent calls with manifest component ids.'
      );
    } else {
      pushUnique(
        reasons,
        'Static plugin-entry scan did not find all manifest component ids (supplemental signal only).'
      );
      pushUnique(
        nextActions,
        'Keep registerPluginComponent calls aligned with manifest component ids for maintainability.'
      );
    }
  } else {
    pushUnique(reasons, 'Plugin entry module is missing.');
    pushUnique(nextActions, 'Add plugins/<id>/src/index.ts for each plugin.');
  }

  // Score: No capability/compatibility warnings (6 points)
  const blockingWarnings = [
    ...validationIssues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => issue.message),
    ...autoDisabledWithWarnings,
  ];
  if (blockingWarnings.length === 0) {
    score += 6;
  } else {
    blockers.push(
      'Plugin has capability or compatibility warnings that reduce safe runtime confidence.'
    );
    pushUnique(
      reasons,
      'Plugin has capability or compatibility warnings that reduce safe runtime confidence.'
    );
    pushUnique(
      nextActions,
      'Resolve manifest warnings before promoting the plugin beyond Bronze.'
    );
  }

  // Clamp score to category maximum (20)
  score = Math.max(0, Math.min(20, score));

  return {
    score,
    evidence,
    reasons,
    nextActions,
    blockers,
  };
}
