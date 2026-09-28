import { NextRequest, NextResponse } from 'next/server';
import {
  aiApiError,
  classifyAiError,
  getAiErrorProviderStatus,
} from '@/lib/ai-api-error';
import {
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
  exceedsUtf8Limit,
} from '@/lib/ai-request-limits';
import {
  assessSessionWithJev,
  type SessionAssessment,
  type SessionAssessmentInput,
} from '@/lib/jev-client';
import { parseJsonObjectBody } from '@/lib/request-body';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { SESSION_CATEGORIES, type EffortLevel } from '@/lib/types';

type Assess = (input: SessionAssessmentInput) => Promise<SessionAssessment>;

export function createAssessSessionPost(assess: Assess = assessSessionWithJev) {
  return async function POST(request: NextRequest) {
    try {
      const auth = await requireAuthenticatedUser(request);
      if (auth instanceof NextResponse) return auth;
      const parsed = await parseJsonObjectBody(request, {
        maxBytes: AI_REQUEST_BODY_MAX_BYTES,
      });
      if (!parsed.ok)
        return NextResponse.json(
          aiApiError(
            parsed.reason === 'body-too-large'
              ? 'INPUT_TOO_LARGE'
              : 'INVALID_REQUEST'
          ).body,
          { status: parsed.reason === 'body-too-large' ? 413 : 400 }
        );
      const body = parsed.value;
      if (
        typeof body.description !== 'string' ||
        !body.description.trim() ||
        exceedsUtf8Limit(body.description, AI_DESCRIPTION_MAX_BYTES)
      ) {
        return NextResponse.json(aiApiError('INVALID_REQUEST').body, {
          status: 400,
        });
      }
      const notes =
        typeof body.notes === 'string' ? body.notes.trim() : undefined;
      if (notes && exceedsUtf8Limit(notes, AI_DESCRIPTION_MAX_BYTES))
        return NextResponse.json(aiApiError('INPUT_TOO_LARGE').body, {
          status: 413,
        });
      if (
        body.category !== undefined &&
        !SESSION_CATEGORIES.includes(
          body.category as (typeof SESSION_CATEGORIES)[number]
        )
      ) {
        return NextResponse.json(aiApiError('INVALID_REQUEST').body, {
          status: 400,
        });
      }
      if (
        body.effort !== undefined &&
        (typeof body.effort !== 'number' ||
          !Number.isInteger(body.effort) ||
          body.effort < 1 ||
          body.effort > 5)
      ) {
        return NextResponse.json(aiApiError('INVALID_REQUEST').body, {
          status: 400,
        });
      }
      if (
        body.techniques !== undefined &&
        (!Array.isArray(body.techniques) ||
          body.techniques.length > 100 ||
          body.techniques.some((technique) => typeof technique !== 'string'))
      ) {
        return NextResponse.json(aiApiError('INVALID_REQUEST').body, {
          status: 400,
        });
      }
      const assessment = await assess({
        description: body.description.trim(),
        notes,
        ...(body.category === undefined
          ? {}
          : {
              category: body.category as (typeof SESSION_CATEGORIES)[number],
            }),
        ...(body.effort === undefined
          ? {}
          : { effort: body.effort as EffortLevel }),
        ...(body.techniques === undefined
          ? {}
          : {
              techniques: (body.techniques as string[])
                .filter(
                  (technique) =>
                    technique.trim().length > 0 &&
                    technique.trim().length <= 120
                )
                .slice(0, 12),
            }),
      });
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
