'use server';
/**
 * @fileOverview An AI tool that transforms informal Judo practice descriptions into structured, professional summaries.
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
});
export type TransformPracticeInput = z.infer<typeof TransformPracticeInputSchema>;

const TransformPracticeOutputSchema = z.object({
  transformedDescription: z
    .string()
    .describe('A professionally written, well-structured, and terminologically accurate summary of the Judo practice.'),
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
  prompt: `You are an expert Judo coach and technical writer. 

Your task is to take the following raw, informal description of a Judo practice session and transform it into a professionally written, well-structured, and terminologically accurate summary.

Guidelines:
- Maintain the original meaning and specific details provided by the user.
- Use standard, official Judo terminology (e.g., ensure throw names like "Osoto Gari" or "Uchi Mata" are correctly spelled and capitalized).
- Improve the flow and grammar while keeping it concise.
- Use a professional yet encouraging tone suitable for a training log.
- If the input is very short or list-like, expand it into clear, readable sentences or a well-organized summary.

Description to transform: {{{description}}}`,
});

const transformPracticeDescriptionFlow = ai.defineFlow(
  {
    name: 'transformPracticeDescriptionFlow',
    inputSchema: TransformPracticeInputSchema,
    outputSchema: TransformPracticeOutputSchema,
  },
  async input => {
    const {output} = await transformPracticePrompt(input);
    return output!;
  }
);
