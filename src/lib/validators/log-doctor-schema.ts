/**
 * Zod schema for log-doctor fix API request
 */

import { z } from 'zod';
import { isSafeLogPath } from './path-validators';

export const logDoctorFixOptionsSchema = z.object({
  normalizeFrontmatter: z.boolean().default(true),
  enforceSectionOrder: z.boolean().default(true),
  preserveUserContent: z.boolean().default(true),
});

export const logDoctorFixRequestSchema = z.object({
  owner: z.string().trim().refine(val => val.length > 0, {
    message: 'Missing owner or repo',
  }),
  repo: z.string().trim().refine(val => val.length > 0, {
    message: 'Missing owner or repo',
  }),
  branch: z.string().trim().refine(val => val.length > 0, {
    message: 'Branch cannot be empty when provided',
  }).optional(),
  mode: z.enum(['dry-run', 'apply']).default('dry-run'),
  paths: z
    .array(z.string())
    .refine(
      (paths) => paths.filter((path) => isSafeLogPath(path)).length > 0,
      'At least one file path must be selected'
    )
    .transform((paths) => paths.filter((path) => isSafeLogPath(path))),
  options: logDoctorFixOptionsSchema.optional().default({}),
  confirmApply: z.boolean().default(false),
});

/**
 * Extended validation for apply mode requirements
 */
export const applyModeConstraints = {
  maxFiles: 25,
  requiresConfirmation: true,
} as const;

export type LogDoctorFixRequest = z.infer<typeof logDoctorFixRequestSchema>;
export type LogDoctorFixOptions = z.infer<typeof logDoctorFixOptionsSchema>;
