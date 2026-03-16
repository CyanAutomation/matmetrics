import { NextRequest, NextResponse } from 'next/server';
import { validateGitHubCredentials, isGitHubConfigured } from '@/lib/github-storage';
import { GitHubConfig } from '@/lib/types';

/**
 * POST /api/github/validate
 * Test GitHub credentials
 */
export async function POST(request: NextRequest) {
  try {
    if (!isGitHubConfigured()) {
      return NextResponse.json(
        { success: false, message: 'GITHUB_TOKEN environment variable not configured' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const config: GitHubConfig = {
      owner: typeof body.owner === 'string' ? body.owner.trim() : '',
      repo: typeof body.repo === 'string' ? body.repo.trim() : '',
      branch: typeof body.branch === 'string' ? body.branch.trim() : undefined,
    };

    // Validate config
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

    // Test credentials
    const result = await validateGitHubCredentials(config);

    return NextResponse.json(result, { status: result.success ? 200 : 401 });
  } catch (error) {
    console.error('Error validating GitHub credentials', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Validation failed: ${message}` },
      { status: 500 }
    );
  }
}
