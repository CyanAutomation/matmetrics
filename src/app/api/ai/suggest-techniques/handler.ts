import { NextRequest, NextResponse } from 'next/server';
import {
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { callCloudflareAi } from '@/lib/cloudflare-ai-client';
import { verifyTechniqueCandidatesWithJev } from '@/lib/jev-client';
import {
  aiApiError,
  classifyAiError,
  getAiErrorProviderStatus,
} from '@/lib/ai-api-error';

type SuggestFunction = (input: { description: string }) => Promise<string[]>;
type VerifyFunction = (input: {
  description: string;
  candidates: string[];
}) => Promise<string[]>;
type VerificationStatus =
  | 'verified'
  | 'not_configured'
  | 'unavailable'
  | 'not_needed';

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
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
    ) {
      return parsed;
    }
  } catch {
    // If direct parsing fails, try to extract JSON array from the text
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        if (
          Array.isArray(extracted) &&
          extracted.every((item) => typeof item === 'string')
        ) {
          return extracted;
        }
      } catch {
        // Fall through to empty array
      }
    }
  }

  return [];
}

async function verifySuggestionsWithJevIfConfigured(input: {
  description: string;
  candidates: string[];
}): Promise<string[]> {
  if (!process.env.OPENROUTER_API_KEY) return input.candidates;
  return verifyTechniqueCandidatesWithJev(input.description, input.candidates);
}

export function createSuggestTechniquesPost(
  suggest: SuggestFunction = suggestTechniquesWithCloudflare,
  verify: VerifyFunction = verifySuggestionsWithJevIfConfigured
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

      const candidates = await suggest({
        description,
      });
      let suggestions = candidates;
      let verificationStatus: VerificationStatus =
        candidates.length === 0 ? 'not_needed' : 'verified';
      if (candidates.length > 0) {
        if (
          verify === verifySuggestionsWithJevIfConfigured &&
          !process.env.OPENROUTER_API_KEY
        ) {
          verificationStatus = 'not_configured';
        } else {
          try {
            suggestions = await verify({ description, candidates });
          } catch {
            // Verification is optional. Keep the generated candidates usable,
            // but tell the user to review them before saving.
            verificationStatus = 'unavailable';
            console.warn(
              'Technique suggestions returned without the optional accuracy check'
            );
          }
        }
      }

      return NextResponse.json({ suggestions, verificationStatus });
    } catch (error) {
      const code = classifyAiError(error);
      const providerStatus = getAiErrorProviderStatus(error);
      console.error('Error suggesting techniques', {
        code,
        ...(providerStatus === undefined ? {} : { providerStatus }),
      });
      const response = aiApiError(code, { providerStatus });
      return NextResponse.json(response.body, { status: response.status });
    }
  };
}
