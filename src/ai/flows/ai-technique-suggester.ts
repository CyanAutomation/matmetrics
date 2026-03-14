'use server';
/**
 * @fileOverview An AI tool that suggests official Judo technique tags based on a free-text description.
 *
 * - suggestTechniqueTags - A function that handles the suggestion of Judo technique tags.
 * - SuggestTechniqueTagsInput - The input type for the suggestTechniqueTags function.
 * - SuggestTechniqueTagsOutput - The return type for the suggestTechniqueTags function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTechniqueTagsInputSchema = z.object({
  description: z
    .string()
    .describe('A free-text description of the techniques practiced during a Judo session.'),
});
export type SuggestTechniqueTagsInput = z.infer<typeof SuggestTechniqueTagsInputSchema>;

const SuggestTechniqueTagsOutputSchema = z
  .array(z.string())
  .describe('A list of suggested official Judo technique tags based on the input description.');
export type SuggestTechniqueTagsOutput = z.infer<typeof SuggestTechniqueTagsOutputSchema>;

export async function suggestTechniqueTags(
  input: SuggestTechniqueTagsInput
): Promise<SuggestTechniqueTagsOutput> {
  return suggestTechniqueTagsFlow(input);
}

const suggestTechniqueTagsPrompt = ai.definePrompt({
  name: 'suggestTechniqueTagsPrompt',
  input: {schema: SuggestTechniqueTagsInputSchema},
  output: {schema: SuggestTechniqueTagsOutputSchema},
  prompt: `You are an expert in Judo techniques. Analyze the following free-text description of a Judo session and identify all official Judo techniques that are mentioned or clearly implied. Return these techniques as a JSON array of strings.

Ensure that the suggested techniques are widely recognized and standard Judo terms.

If the description does not mention any specific Judo techniques, return an empty array.

Description: {{{description}}}`,
});

const suggestTechniqueTagsFlow = ai.defineFlow(
  {
    name: 'suggestTechniqueTagsFlow',
    inputSchema: SuggestTechniqueTagsInputSchema,
    outputSchema: SuggestTechniqueTagsOutputSchema,
  },
  async input => {
    const {output} = await suggestTechniqueTagsPrompt(input);
    return output!;
  }
);
