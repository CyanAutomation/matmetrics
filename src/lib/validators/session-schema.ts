/**
 * Zod schema for session validation
 */

import { z } from 'zod';
import { validateDate } from './date';
import { validateTechniques } from './techniques';
import { validateVideoUrl } from './video-url';
import { SESSION_CATEGORIES } from '../types';

/**
 * Custom Zod refinement that uses existing date validator
 */
const dateSchema = z.string().superRefine((val, ctx) => {
  const result = validateDate(val);
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: result.error,
    });
  }
});

/**
 * Custom Zod refinement that uses existing techniques validator
 */
const techniquesSchema = z.unknown().superRefine((val, ctx) => {
  const result = validateTechniques(val);
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: result.error,
    });
  }
});

/**
 * Video URL with type checking before validation
 */
const videoUrlSchema = z
  .unknown()
  .optional()
  .superRefine((val, ctx) => {
    // Type check - reject non-string, non-undefined values
    if (val !== undefined && typeof val !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid videoUrl: expected a string',
      });
      return;
    }

    const result = validateVideoUrl(val);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error,
      });
    }
  })
  .transform((val) => (typeof val === 'string' ? val : undefined));

/**
 * Description with type checking
 */
const descriptionSchema = z
  .unknown()
  .optional()
  .superRefine((val, ctx) => {
    if (val !== undefined && typeof val !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid description: expected a string',
      });
    }
  })
  .transform((val) => (typeof val === 'string' ? val : undefined));

/**
 * Notes with type checking
 */
const notesSchema = z
  .unknown()
  .optional()
  .superRefine((val, ctx) => {
    if (val !== undefined && typeof val !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid notes: expected a string',
      });
    }
  })
  .transform((val) => (typeof val === 'string' ? val : undefined));

/**
 * Effort level validation with exact error message match
 */
const effortSchema = z
  .unknown()
  .superRefine((val, ctx) => {
    // Type check - reject non-number values
    if (typeof val !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid effort level (must be an integer 1-5)',
      });
      return;
    }

    // Check if integer and in range [1, 5]
    if (!Number.isInteger(val) || val < 1 || val > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid effort level (must be an integer 1-5)',
      });
    }
  })
  .transform((val) => val as 1 | 2 | 3 | 4 | 5);

/**
 * Duration validation with exact error message match
 */
const invalidDurationMessage =
  'Invalid duration: expected a non-negative integer';
const durationSchema = z
  .unknown()
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined) {
      return;
    }

    if (typeof val !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: invalidDurationMessage,
      });
      return;
    }

    if (!Number.isInteger(val) || val < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: invalidDurationMessage,
      });
    }
  })
  .transform((val) => val as number | undefined);

/**
 * Category validation with custom error message
 */
const categorySchema = z
  .unknown()
  .superRefine((val, ctx) => {
    // Type check - reject non-string values
    if (typeof val !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid category',
      });
      return;
    }

    // Check if string is a valid category
    if (!SESSION_CATEGORIES.includes(val as any)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid category',
      });
    }
  })
  .transform((val) => val as (typeof SESSION_CATEGORIES)[number]);

export const sessionFieldsSchema = z.object({
  date: dateSchema,
  effort: effortSchema,
  category: categorySchema,
  techniques: techniquesSchema,
  description: descriptionSchema,
  notes: notesSchema,
  videoUrl: videoUrlSchema,
  duration: durationSchema,
});

export type SessionFields = z.infer<typeof sessionFieldsSchema>;
