// fallow-ignore-file unused-export
// CRITICAL: Cross-language contract with Cloudflare Worker (workers/matmetrics-data/src/index.ts).
// Exports BackgroundJobResult and isBackgroundJobResult are used by:
// - log-doctor plugin (use-file-validation-controller.ts)
// - background-job-store.server.ts (Worker response validation)
// - background-jobs.test.ts
// DO NOT REMOVE without verifying Worker code and updating both TypeScript and Worker in lockstep.
// See AGENTS.md "Cross-Language Contracts" section for full contract documentation.

import { z } from 'zod';

/**
 * Background Job Type Contract
 * =============================
 *
 * This module defines the TypeScript representation of background jobs that are
 * queued and executed by the matmetrics-data Cloudflare Worker.
 *
 * The types defined here MUST match the Worker definitions in:
 * - workers/matmetrics-data/src/index.ts (JobType, JobStatus, JobPayload, StoredJob)
 *
 * Any changes to the type structure, enum values, or validation rules must be
 * reflected in both TypeScript and the Worker to maintain the contract.
 */

export const BACKGROUND_JOB_TYPES = [
  'log-doctor-scan',
  'github-health',
] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];

/**
 * Validates and parses a background job request payload.
 * Used in route handlers to validate incoming requests before queuing.
 */
export const backgroundJobRequestSchema = z.object({
  type: z.enum(BACKGROUND_JOB_TYPES),
  config: z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1),
    branch: z.string().trim().min(1).optional(),
  }),
});

/**
 * TypeScript representation of a background job request.
 * Used in server-side functions to type-check job payloads before queuing.
 */
export type BackgroundJobRequest = z.infer<typeof backgroundJobRequestSchema>;

export const BACKGROUND_JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;

export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

/**
 * Full background job result object returned from the Worker.
 * Includes metadata, status, and optional result/error fields.
 */
export type BackgroundJobResult = {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  result?: unknown;
  error?: string;
};

/**
 * Type guard to safely check if a value is a valid BackgroundJobResult.
 * Used in response handlers to validate Worker responses.
 */
export function isBackgroundJobResult(
  value: unknown
): value is BackgroundJobResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    (BACKGROUND_JOB_TYPES as readonly string[]).includes(candidate.type) &&
    typeof candidate.status === 'string' &&
    (BACKGROUND_JOB_STATUSES as readonly string[]).includes(candidate.status) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.attempts === 'number'
  );
}
