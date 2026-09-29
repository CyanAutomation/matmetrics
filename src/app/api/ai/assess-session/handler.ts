import { NextRequest, NextResponse } from 'next/server';
import {
  aiApiError,
  classifyAiError,
  getAiErrorProviderStatus,
} from '@/lib/ai-api-error';
import {
  AI_REQUEST_BODY_MAX_BYTES,
} from '@/lib/ai-request-limits';
import {
  assessSessionWithJev,
  type SessionAssessment,
  type SessionAssessmentInput,
} from '@/lib/jev-client';
import { parseAssessSessionInput } from '@/lib/assess-session-request';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';

type Assess = (input: SessionAssessmentInput) => Promise<SessionAssessment>;

export function createAssessSessionPost(assess: Assess = assessSessionWithJev) {
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
      const validated = parseAssessSessionInput(parsed.value);
      if (!validated.ok) {
        const error = aiApiError(validated.code);
        return NextResponse.json(error.body, { status: validated.status });
      }

      const assessment = await assess(validated.input);
      return NextResponse.json({ assessment });
    } catch (error) {
      const code = classifyAiError(error);
      const providerStatus = getAiErrorProviderStatus(error);
      console.error('Error assessing session', {
        code,
        ...(providerStatus === undefined ? {} : { providerStatus }),
      });
      const response = aiApiError(code, { providerStatus });
      return NextResponse.json(response.body, { status: response.status });
    }
  };
}
