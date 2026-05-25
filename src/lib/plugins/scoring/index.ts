/**
 * Plugin Maturity Scoring Module
 *
 * This module exports functions for scoring plugin maturity across 5 categories.
 * Each category scorer returns a CategoryScoringResult containing score, evidence,
 * reasons, next actions, and blockers.
 *
 * REFACTORING PHASE 2A:
 * This is part of a larger refactoring to extract category scorers from the
 * monolithic scorePluginMaturity function (723 LOC, complexity 115).
 *
 * Extracted functions:
 * - scoreContractMetadata() — validates manifest schema and metadata
 * - scoreRuntimeIntegration() — checks plugin bootstrap and component registration
 * - scoreFeatureQuality() — validates component presence and UX criteria
 * - scoreTestCoverage() — scores automated test evidence
 * - scoreOperabilityDocs() — evaluates documentation completeness
 * - determineTier() — pure function for tier assignment (Bronze/Silver/Gold)
 *
 * The new scorePluginMaturity() coordinator function:
 * 1. Collects evidence files and intermediate data
 * 2. Calls all 5 category scorers in parallel
 * 3. Calls determineTier() with structured input
 * 4. Assembles final scorecard
 */

export { scoreContractMetadata } from './contract-metadata';
export { scoreRuntimeIntegration } from './runtime-integration';
export { scoreFeatureQuality } from './feature-quality';
export { scoreTestCoverage } from './test-coverage';
export { scoreOperabilityDocs } from './operability-docs';
export { determineTier } from './determine-tier';

export type { CategoryScoringResult, TierEvaluationResult } from './types';
export type { TestCoverageInput } from './test-coverage';
export type { TierDeterminationInput } from './determine-tier';
