import { NextRequest, NextResponse } from 'next/server';
import { transformPracticeDescription } from '@/ai/flows/practice-description-transformer';
import {
  AI_CUSTOM_PROMPT_MAX_BYTES,
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import { aiApiError, classifyAiError } from '@/lib/ai-api-error';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export function createTransformDescriptionPost(
  transform: typeof transformPracticeDescription = transformPracticeDescription
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
