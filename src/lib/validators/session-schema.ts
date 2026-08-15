/**
 * Zod schema for session validation
 */

import { z } from 'zod';
import { validateDate } from './date';
import { validateTechniques } from './techniques';
import { validateVideoUrl } from './video-url';

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
  .union([z.string(), z.undefined()])
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
  });

/**
 * Description with type checking
 */
const descriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .superRefine((val, ctx) => {
    if (val !== undefined && val !== null && typeof val !== 'string') {
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
  .union([z.string(), z.null(), z.undefined()])
  .optional()
  .superRefine((val, ctx) => {
    if (val !== undefined && val !== null && typeof val !== 'string') {
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
  .number({ invalid_type_error: 'Invalid effort level (must be an integer 1-5)' })
  .int({ message: 'Invalid effort level (must be an integer 1-5)' })
  .refine((val) => val >= 1 && val <= 5, {
    message: 'Invalid effort level (must be an integer 1-5)',
  })
  .transform((val) => val as 1 | 2 | 3 | 4 | 5);

/**
 * Duration validation with exact error message match
 */
const durationSchema = z
  .number({ invalid_type_error: 'Invalid duration: expected a non-negative integer' })
  .int({ message: 'Invalid duration: expected a non-negative integer' })
  .nonnegative({ message: 'Invalid duration: expected a non-negative integer' })
  .optional();

/**
 * Complete session validation schema
 */
export const sessionFieldsSchema = z.object({
  date: dateSchema,
  effort: effortSchema,
  category: z.enum(['Technical', 'Randori', 'Shiai'], {
    errorMap: () => ({ message: 'Invalid category' }),
  }),
  techniques: techniquesSchema,
  description: descriptionSchema,
  notes: notesSchema,
  videoUrl: videoUrlSchema,
  duration: durationSchema,
});

export type SessionFields = z.infer<typeof sessionFieldsSchema>;
