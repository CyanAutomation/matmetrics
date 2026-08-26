import type {
  PluginMaturityCategory,
  PluginMaturityTier,
} from '@/lib/plugins/types';

export const MATURITY_CATEGORY_LABELS: Record<PluginMaturityCategory, string> =
  {
    contract_metadata: 'Contract & Metadata',
    runtime_integration: 'Runtime Integration',
    feature_quality: 'Feature Quality',
    test_coverage: 'Test Coverage',
    operability_docs: 'Operability & Docs',
  };

export const MATURITY_CATEGORY_MAXIMUMS: Record<
  PluginMaturityCategory,
  number
> = {
  contract_metadata: 20,
  runtime_integration: 20,
  feature_quality: 25,
  test_coverage: 20,
  operability_docs: 15,
};

/**
 * Converts a string to a valid PluginMaturityTier.
 * Used when loading published scorecards or manifest tier declarations.
 */
export const parseMaturityTier = (value: string): PluginMaturityTier =>
  value === 'gold' || value === 'silver' || value === 'bronze'
    ? value
    : 'bronze';
