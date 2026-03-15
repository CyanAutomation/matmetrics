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
  prompt: `You are an experienced Judo practitioner helping a student write their training diary.

Your task is to take the following raw, informal notes from a Judo practice session and transform them into a well-structured, clear, and terminologically accurate diary entry.

Guidelines:
- **Tone**: Use an informal, personal, and reflective tone. It should feel like a student writing in their own training diary. Avoid being overly optimistic, buoyant, or exaggerated; maintain a neutral and realistic perspective on the session.
- **Terminology**: Use standard, official Judo terminology (e.g., "Osoto Gari", "Uchi Mata", "Kuzushi"). Ensure correct spelling and capitalization.
- **Content**: Maintain all specific details and meaning provided by the user.
- **Structure**: Organize the notes so they flow logically. If the input is just a list, turn it into a few readable, reflective sentences.
- **Focus**: Emphasize the specific techniques practiced and the trainee's honest reflections on what went well or what needs work.

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
