import { NextRequest, NextResponse } from 'next/server';
import {
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { callCloudflareAi } from '@/lib/cloudflare-ai-client';

type SuggestFunction = (input: { description: string }) => Promise<string[]>;

async function suggestTechniquesWithCloudflare(input: {
  description: string;
}): Promise<string[]> {
  const systemMessage = {
    role: 'system' as const,
    content: `You are an expert in Judo technique nomenclature. Your task is to extract and suggest official Judo technique names from practice descriptions.

Rules:
- Use proper Kodokan hyphenation (e.g., "O-soto-gari", not "Osoto Gari")
- Return only valid Judo technique names
- Return the result as a JSON array of strings
- If no techniques are mentioned, return an empty array`,
  };

  const userMessage = {
    role: 'user' as const,
    content: `Suggest Judo technique tags from this description: ${input.description}`,
  };

  const response = await callCloudflareAi({
    messages: [systemMessage, userMessage],
    maxTokens: 4096, // Increased for reasoning models + longer descriptions
  });

  try {
    // Try to parse the entire response as JSON first
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // If direct parsing fails, try to extract JSON array from the text
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        if (Array.isArray(extracted) && extracted.every((item) => typeof item === 'string')) {
          return extracted;
        }
      } catch {
        // Fall through to empty array
      }
    }
  }
  
  return [];
}

export function createSuggestTechniquesPost(
  suggest: SuggestFunction = suggestTechniquesWithCloudflare
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
