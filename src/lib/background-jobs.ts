import { z } from 'zod';

export const BACKGROUND_JOB_TYPES = [
  'log-doctor-scan',
  'github-health',
] as const;

export type BackgroundJobType = (typeof BACKGROUND_JOB_TYPES)[number];

export const backgroundJobRequestSchema = z.object({
  type: z.enum(BACKGROUND_JOB_TYPES),
  config: z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1),
    branch: z.string().trim().min(1).optional(),
  }),
});

export type BackgroundJobRequest = z.infer<typeof backgroundJobRequestSchema>;

export const BACKGROUND_JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;

export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

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

export function isBackgroundJobResult(value: unknown): value is BackgroundJobResult {
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
