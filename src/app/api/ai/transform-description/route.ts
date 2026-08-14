import { NextRequest, NextResponse } from 'next/server';
import { transformPracticeDescription } from '@/ai/flows/practice-description-transformer';
import {
  AI_CUSTOM_PROMPT_MAX_BYTES,
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
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
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: parsed.reason === 'body-too-large' ? 413 : 400 }
        );
      }
      const body = parsed.value;

      if (
        typeof body?.description !== 'string' ||
        body.description.trim() === ''
      ) {
        return NextResponse.json(
          { error: 'Description is required' },
          { status: 400 }
        );
      }

      const description = body.description.trim();
      if (exceedsUtf8Limit(description, AI_DESCRIPTION_MAX_BYTES)) {
        return NextResponse.json(
          { error: 'Description exceeds the maximum length' },
          { status: 400 }
        );
      }

      const customPrompt =
        typeof body.customPrompt === 'string' && body.customPrompt.trim()
          ? body.customPrompt.trim()
          : undefined;
      if (
        customPrompt !== undefined &&
        exceedsUtf8Limit(customPrompt, AI_CUSTOM_PROMPT_MAX_BYTES)
      ) {
        return NextResponse.json(
          { error: 'Custom prompt exceeds the maximum length' },
          { status: 400 }
        );
      }

      const result = await transform({
        description,
        customPrompt,
      });

      return NextResponse.json(result);
    } catch (error) {
      console.error('Error transforming description', error);
      return NextResponse.json(
        { error: 'Failed to transform description' },
        { status: 500 }
      );
    }
  };
}

export const POST = createTransformDescriptionPost();
