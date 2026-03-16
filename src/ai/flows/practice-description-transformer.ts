'use server';
/**
 * @fileOverview An AI tool that transforms informal Judo practice descriptions into structured, personal training diary entries.
 *
 * - transformPracticeDescription - A function that handles the transformation of Judo practice notes.
 * - TransformPracticeInput - The input type for the transformPracticeDescription function.
 * - TransformPracticeOutput - The return type for the transformPracticeDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TransformPracticeInputSchema = z.object({
  description: z
    .string()
    .describe('The raw, informal description of a Judo practice session.'),
  customPrompt: z
    .string()
    .optional()
    .describe('Optional custom instructions for the AI on how to style the transformed entry.'),
});
export type TransformPracticeInput = z.infer<typeof TransformPracticeInputSchema>;

const TransformPracticeOutputSchema = z.object({
  transformedDescription: z
    .string()
    .describe('A well-structured, terminologically accurate training diary entry with a personal and neutral tone.'),
});
export type TransformPracticeOutput = z.infer<typeof TransformPracticeOutputSchema>;

export async function transformPracticeDescription(
  input: TransformPracticeInput
): Promise<TransformPracticeOutput> {
  return transformPracticeDescriptionFlow(input);
}

const transformPracticePrompt = ai.definePrompt({
  name: 'transformPracticePrompt',
  input: {schema: TransformPracticeInputSchema},
  output: {schema: TransformPracticeOutputSchema},
  prompt: `{{{customPrompt}}}

Description to transform: {{{description}}}`,
});

const transformPracticeDescriptionFlow = ai.defineFlow(
  {
    name: 'transformPracticeDescriptionFlow',
    inputSchema: TransformPracticeInputSchema,
    outputSchema: TransformPracticeOutputSchema,
  },
  async input => {
    // Default fallback prompt if none provided
    const instructions = input.customPrompt || `You are an experienced Judo practitioner helping a student write their training diary. 
    Transform the input into a terminologically accurate diary entry.`;

    const {output} = await transformPracticePrompt({
      ...input,
      customPrompt: instructions
    });
    return output!;
  }
);
