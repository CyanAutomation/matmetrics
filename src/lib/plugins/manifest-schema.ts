import { z } from 'zod';

export const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

export const pluginExtensionBaseSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  title: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
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
        })
        .optional(),
    })
    .optional(),
});

export type PluginManifestSchema = z.infer<typeof pluginManifestSchema>;
export type PluginExtensionBaseSchema = z.infer<
  typeof pluginExtensionBaseSchema
>;
