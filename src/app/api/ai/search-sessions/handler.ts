import { NextRequest, NextResponse } from 'next/server';
import {
  aiApiError,
  classifyAiError,
  getAiErrorProviderStatus,
} from '@/lib/ai-api-error';
import { AI_REQUEST_BODY_MAX_BYTES } from '@/lib/ai-request-limits';
import {
  rankSessionHistorySearchCandidatesWithJev,
} from '@/lib/jev-client';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import {
  parseSessionHistorySearchRequest,
} from '@/lib/session-history-search-request';
import type {
  SessionHistorySearchCandidate,
  SessionHistorySearchMatch,
} from '@/lib/session-history-search';

type Rank = (
  query: string,
  candidates: SessionHistorySearchCandidate[]
) => Promise<SessionHistorySearchMatch[]>;

export function createSessionHistorySearchPost(
  rank: Rank = rankSessionHistorySearchCandidatesWithJev
) {
  return async function POST(request: NextRequest) {
    try {
      const auth = await requireAuthenticatedUser(request);
      if (auth instanceof NextResponse) return auth;

      const parsed = await parseJsonObjectBody(request, {
        maxBytes: AI_REQUEST_BODY_MAX_BYTES,
      });
      if (!parsed.ok) {
        const error = aiApiError(
          parsed.reason === 'body-too-large'
            ? 'INPUT_TOO_LARGE'
            : 'INVALID_REQUEST'
        );
        return NextResponse.json(error.body, {
          status: parsed.reason === 'body-too-large' ? 413 : 400,
        });
      }

      const validated = parseSessionHistorySearchRequest(parsed.value);
      if (!validated.ok) {
        const error = aiApiError(validated.code);
        return NextResponse.json(error.body, { status: validated.status });
      }

      const matches = await rank(
        validated.input.query,
        validated.input.candidates
      );
      return NextResponse.json({ matches });
    } catch (error) {
      const code = classifyAiError(error);
      const providerStatus = getAiErrorProviderStatus(error);
      console.error('Error searching session history', {
        code,
        ...(providerStatus === undefined ? {} : { providerStatus }),
      });
      const response = aiApiError(code, { providerStatus });
      return NextResponse.json(response.body, { status: response.status });
    }
  };
}
