import { NextRequest, NextResponse } from 'next/server';
import { isGitHubConfigured } from '@/lib/github-storage';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { GitHubConfig } from '@/lib/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { scanTrainingDataWithNext } from '@/lib/log-doctor-fallback';
import { buildLogDoctorErrorResponse } from './error-response';

/**
 * POST /api/github/log-doctor
 * Diagnose markdown logs in a GitHub repository
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!isGitHubConfigured()) {
      return NextResponse.json(
        {
          success: false,
          message: 'GITHUB_TOKEN environment variable not configured',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const config: GitHubConfig = {
      owner: typeof body.owner === 'string' ? body.owner.trim() : '',
      repo: typeof body.repo === 'string' ? body.repo.trim() : '',
      branch: typeof body.branch === 'string' ? body.branch.trim() : undefined,
    };

    if (!config.owner || !config.repo) {
      return NextResponse.json(
        { success: false, message: 'Missing owner or repo' },
        { status: 400 }
      );
    }

    if (body.branch !== undefined && !config.branch) {
      return NextResponse.json(
        { success: false, message: 'Branch cannot be empty when provided' },
        { status: 400 }
      );
    }

    if (
      !process.env.MATMETRICS_GO_PROXY_BASE_URL &&
      process.env.NODE_ENV !== 'test'
    ) {
      const result = await scanTrainingDataWithNext(config);
      return NextResponse.json(result);
    }

    const proxyResponse = await proxyGoFunction(request, {
      path: '/api/go/github/log-doctor',
      method: 'POST',
      body: config,
    });

    // The Go endpoint is optional in Vercel deployments. If it is present but
    // unavailable, use the equivalent Next.js scan so a maintenance check is
    // still useful instead of failing behind a generic upstream 5xx.
    if (proxyResponse.status >= 500) {
      try {
        return NextResponse.json(await scanTrainingDataWithNext(config));
      } catch (fallbackError) {
        console.error('Next.js log doctor fallback also failed', fallbackError);
      }
    }

    return proxyResponse;
  } catch (error) {
    console.error('Error in log diagnosis', error);
    return buildLogDoctorErrorResponse(error);
  }
}
