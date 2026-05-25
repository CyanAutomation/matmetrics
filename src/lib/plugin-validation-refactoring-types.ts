/**
 * Intermediate types for plugin UI contract validation refactoring.
 * These types help flatten nested loops and clarify data flow.
 */

export type RequirementKey =
  | 'loadingState'
  | 'errorState'
  | 'emptyState'
  | 'successState'
  | 'destructiveConfirmation'
  | 'singleTopLevelPageShell'
  | 'primaryContentSections';

export type PluginValidationContext = {
  /** Plugin ID from manifest */
  pluginId: string;

  /** Component ID from UI extension config */
  componentId: string;

  /** Absolute path to entry file */
  entryPath: string;

  /** Requirements to check for this component */
  requiredChecks: RequirementKey[];

  /** Collected violations during validation */
  violations: string[];
};

export type PrimitiveUsage = Record<RequirementKey, boolean>;

export type ComponentValidationResult = {
  /** Plugin ID being validated */
  pluginId: string;

  /** Component ID being validated */
  componentId: string;

  /** Requirements that were met */
  met: RequirementKey[];

  /** Requirements that were not met */
  missing: RequirementKey[];

  /** Detailed violation messages */
  violations: string[];

  /** Source file path where violations were detected */
  sourcePath: string;
};

export type ValidationJob = {
  /** Plugin ID from manifest */
  pluginId: string;

  /** Component ID from extension config */
  componentId: string;

  /** Requirement to validate */
  requirement: RequirementKey;

  /** Entry point file path to validate */
  entryPath: string;
};

export type ValidationReport = {
  /** Total plugins validated */
  totalPlugins: number;

  /** Total components validated */
  totalComponents: number;

  /** Component results organized by plugin */
  results: ComponentValidationResult[];

  /** Summary of all violations */
  violations: Array<{
    pluginId: string;
    componentId: string;
    requirement: RequirementKey;
    details: string;
  }>;

  /** Whether validation passed overall */
  passed: boolean;
};
