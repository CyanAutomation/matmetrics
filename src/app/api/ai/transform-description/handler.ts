import { NextRequest, NextResponse } from 'next/server';
import {
  AI_CUSTOM_PROMPT_MAX_BYTES,
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import {
  aiApiError,
  classifyAiError,
  InvalidAiResponseError,
} from '@/lib/ai-api-error';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { callCloudflareAi } from '@/lib/cloudflare-ai-client';
import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/ai-prompts';
import { normalizeAiProse } from '@/lib/ai-output-normalization';

export const TRANSFORM_DESCRIPTION_FORMAT_INSTRUCTION = `INVARIANT OUTPUT FORMAT:
Return plain prose only: no title, heading, Markdown, asterisks, emphasis, bullet lists, or code fences. Begin immediately with the session narrative. Do not append an "Overall" conclusion or any reflection not supported by the user's input. These requirements override any conflicting output-format direction above.`;

type TransformFunction = (input: {
  description: string;
  customPrompt?: string;
}) => Promise<{ transformedDescription: string }>;

export async function transformDescriptionWithCloudflare(input: {
  description: string;
  customPrompt?: string;
}): Promise<{ transformedDescription: string }> {
  const selectedPrompt = input.customPrompt ?? DEFAULT_TRANSFORMER_PROMPT;
  const systemPrompt = `${selectedPrompt}\n\n${TRANSFORM_DESCRIPTION_FORMAT_INSTRUCTION}`;

  const systemMessage = {
    role: 'system' as const,
    content: systemPrompt,
  };

  const userMessage = {
    role: 'user' as const,
    content: input.description,
  };

  const providerOutput = await callCloudflareAi({
    messages: [systemMessage, userMessage],
    maxTokens: 4096, // Increased for reasoning models + longer descriptions
  });
  const transformedDescription = normalizeAiProse(providerOutput);

  if (!transformedDescription) {
    throw new InvalidAiResponseError();
  }

  return { transformedDescription };
}

export function createTransformDescriptionPost(
  transform: TransformFunction = transformDescriptionWithCloudflare
) {
  return async function POST(request: NextRequest) {
    try {
      const authResult = await requireAuthenticatedUser(request);
      if (authResult instanceof NextResponse) {
        return authResult;
      }

      const parsed = await parseJsonObjectBody(request, {
        maxBytes: AI_REQUEST_BODY_MAX_BYTES,
      });
      if (!parsed.ok) {
        const response = aiApiError(
          parsed.reason === 'body-too-large'
            ? 'INPUT_TOO_LARGE'
            : 'INVALID_REQUEST'
        );
        return NextResponse.json(response.body, { status: response.status });
      }
      const body = parsed.value;

      if (
        typeof body?.description !== 'string' ||
        body.description.trim() === ''
      ) {
        const response = aiApiError('INVALID_REQUEST');
        return NextResponse.json(response.body, { status: response.status });
      }

      const description = body.description.trim();
      if (exceedsUtf8Limit(description, AI_DESCRIPTION_MAX_BYTES)) {
        const response = aiApiError('INPUT_TOO_LARGE');
        return NextResponse.json(response.body, { status: response.status });
      }

      const customPrompt =
        typeof body.customPrompt === 'string' && body.customPrompt.trim()
          ? body.customPrompt.trim()
          : undefined;
      if (
        customPrompt !== undefined &&
        exceedsUtf8Limit(customPrompt, AI_CUSTOM_PROMPT_MAX_BYTES)
      ) {
        const response = aiApiError('INPUT_TOO_LARGE');
        return NextResponse.json(response.body, { status: response.status });
      }

      const result = await transform({
        description,
        customPrompt,
      });

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error transforming description', error);
      const response = aiApiError(classifyAiError(error));
      return NextResponse.json(response.body, { status: response.status });
    }
  };
}
