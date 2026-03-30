import { z } from 'zod';

export const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

export const pluginExtensionBaseSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

const pluginUiContractSchema = z.object({
  layoutVariant: z.string().min(1),
  requiredUxStates: z
    .array(z.enum(['loading', 'error', 'empty', 'destructive']))
    .min(1),
  designTokenVariants: z.array(z.string().min(1)).optional(),
});

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(VERSION_REGEX),
  description: z.string().min(1),
  owner: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  uiExtensions: z.array(pluginExtensionBaseSchema).min(1),
  author: z.string().min(1).optional(),
  homepage: z.string().url().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  minVersion: z
    .string()
    .regex(VERSION_REGEX)
    .optional()
    .describe('Minimum matmetrics version required to run this plugin'),
  uiContract: pluginUiContractSchema.optional(),
  maturity: z
    .object({
      tier: z.enum(['bronze', 'silver', 'gold']).optional(),
      notes: z.string().min(1).optional(),
      lastReviewedAt: z.string().min(1).optional(),
      uxStates: z
        .object({
          loading: z.boolean().optional(),
          error: z.boolean().optional(),
          empty: z.boolean().optional(),
          destructiveAction: z.boolean().optional(),
        })
        .optional(),
      uxCriteria: z
        .object({
          loadingStatePresent: z.boolean().optional(),
          errorStateWithRecovery: z.boolean().optional(),
          emptyStateWithCta: z.boolean().optional(),
          destructiveActionSafety: z
            .object({
              relevant: z.boolean().optional(),
              confirmation: z.boolean().optional(),
              cancellation: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
      evidence: z
        .object({
          testFiles: z.array(z.string().min(1)).optional(),
          uxCriteria: z
            .object({
              loadingStatePresent: z.array(z.string().min(1)).optional(),
              errorStateWithRecovery: z.array(z.string().min(1)).optional(),
              emptyStateWithCta: z.array(z.string().min(1)).optional(),
              destructiveActionSafety: z.array(z.string().min(1)).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type PluginManifestSchema = z.infer<typeof pluginManifestSchema>;
export type PluginExtensionBaseSchema = z.infer<
  typeof pluginExtensionBaseSchema
>;
