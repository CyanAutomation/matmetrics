import { NextRequest, NextResponse } from 'next/server';
import { suggestTechniqueTags } from '@/ai/flows/ai-technique-suggester';
import {
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export function createSuggestTechniquesPost(
  suggest: typeof suggestTechniqueTags = suggestTechniqueTags
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

      const suggestions = await suggest({
        description,
      });

      return NextResponse.json({ suggestions });
    } catch (error) {
      console.error('Error suggesting techniques', error);
      return NextResponse.json(
        { error: 'Failed to suggest techniques' },
        { status: 500 }
      );
    }
  };
}

export const POST = createSuggestTechniquesPost();
