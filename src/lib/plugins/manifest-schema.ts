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
});

export type PluginManifestSchema = z.infer<typeof pluginManifestSchema>;
export type PluginExtensionBaseSchema = z.infer<
  typeof pluginExtensionBaseSchema
>;
