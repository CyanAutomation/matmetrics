import { NextRequest, NextResponse } from 'next/server';
import { isGitHubConfigured } from '@/lib/github-storage';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { buildLogDoctorFixErrorResponse } from './error-response';
import {
  logDoctorFixRequestSchema,
  applyModeConstraints,
} from '@/lib/validators/log-doctor-schema';
import { ZodError } from 'zod';

/**
 * POST /api/github/log-doctor/fix
 * Preview or apply markdown normalization fixes.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check - fail fast
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // GitHub configuration check
    if (!isGitHubConfigured()) {
      return NextResponse.json(
        {
          success: false,
          message: 'GITHUB_TOKEN environment variable not configured',
        },
        { status: 400 }
      );
    }

    // Parse and validate request body with Zod schema
    const body = await request.json();
    let validated;

    try {
      validated = logDoctorFixRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        // Return just the message without field prefix for consistency
        return NextResponse.json(
          { success: false, message: firstError.message },
          { status: 400 }
        );
      }
      throw error;
    }

    // Apply-mode specific validation
    if (validated.mode === 'apply') {
      if (!validated.confirmApply) {
        return NextResponse.json(
          {
            success: false,
            message: 'Apply mode requires explicit confirmation from the UI',
          },
          { status: 400 }
        );
      }

      if (validated.paths.length > applyModeConstraints.maxFiles) {
        return NextResponse.json(
          {
            success: false,
            message: `Apply mode is limited to ${applyModeConstraints.maxFiles} files per request`,
          },
          { status: 400 }
        );
      }
    }

    // Proxy to Go backend with validated data
    return proxyGoFunction(request, {
      path: '/api/go/github/log-doctor/fix',
      method: 'POST',
      body: {
        owner: validated.owner,
        repo: validated.repo,
        branch: validated.branch,
        mode: validated.mode,
        paths: validated.paths,
        options: {
          normalizeFrontmatter: validated.options?.normalizeFrontmatter ?? true,
          enforceSectionOrder: validated.options?.enforceSectionOrder ?? true,
          preserveUserContent: validated.options?.preserveUserContent ?? true,
        },
        confirmApply: validated.confirmApply,
      },
    });
  } catch (error) {
    console.error('Error in log-doctor fix flow', error);
    return buildLogDoctorFixErrorResponse(error);
  }
}
