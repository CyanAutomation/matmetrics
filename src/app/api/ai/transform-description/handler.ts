import { NextRequest, NextResponse } from 'next/server';
import {
  AI_CUSTOM_PROMPT_MAX_BYTES,
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import { aiApiError, classifyAiError } from '@/lib/ai-api-error';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { callCloudflareAi } from '@/lib/cloudflare-ai-client';
import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/ai-prompts';

type TransformFunction = (input: {
  description: string;
  customPrompt?: string;
}) => Promise<{ transformedDescription: string }>;

async function transformDescriptionWithCloudflare(input: {
  description: string;
  customPrompt?: string;
}): Promise<{ transformedDescription: string }> {
  const systemPrompt = input.customPrompt ?? DEFAULT_TRANSFORMER_PROMPT;

  const systemMessage = {
    role: 'system' as const,
    content: systemPrompt,
  };

  const userMessage = {
    role: 'user' as const,
    content: input.description,
  };

  const transformedDescription = await callCloudflareAi({
    messages: [systemMessage, userMessage],
    maxTokens: 4096, // Increased for reasoning models + longer descriptions
  });

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
