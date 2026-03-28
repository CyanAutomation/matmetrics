import { NextRequest, NextResponse } from 'next/server';
import { isGitHubConfigured } from '@/lib/github-storage';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { GitHubConfig } from '@/lib/types';
import { requireAuthenticatedUser } from '@/lib/server-auth';

const MAX_APPLY_FILES = 25;

function isSafeLogPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').trim();
  if (!normalized) return false;
  if (normalized.startsWith('/') || normalized.includes('\0')) return false;
  if (normalized.endsWith('/')) return false;
  if (!normalized.startsWith('data/')) return false;
  if (!normalized.endsWith('.md')) return false;

  const segments = normalized.split('/');
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * POST /api/github/log-doctor/fix
 * Preview or apply markdown normalization fixes.
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

    const mode = body.mode === 'apply' ? 'apply' : 'dry-run';
    const selectedPaths = Array.isArray(body.paths)
      ? body.paths.filter(
          (path: unknown): path is string =>
            typeof path === 'string' && isSafeLogPath(path)
        )
      : [];
    const options = {
      normalizeFrontmatter: body.options?.normalizeFrontmatter !== false,
      enforceSectionOrder: body.options?.enforceSectionOrder !== false,
      preserveUserContent: body.options?.preserveUserContent !== false,
    };
    const confirmApply = body.confirmApply === true;

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

    if (selectedPaths.length === 0) {
      return NextResponse.json(
        { success: false, message: 'At least one file path must be selected' },
        { status: 400 }
      );
    }

    if (mode === 'apply') {
      if (!confirmApply) {
        return NextResponse.json(
          {
            success: false,
            message: 'Apply mode requires explicit confirmation from the UI',
          },
          { status: 400 }
        );
      }

      if (selectedPaths.length > MAX_APPLY_FILES) {
        return NextResponse.json(
          {
            success: false,
            message: `Apply mode is limited to ${MAX_APPLY_FILES} files per request`,
          },
          { status: 400 }
        );
      }
    }

    return proxyGoFunction(request, {
      path: '/api/go/github/log-doctor/fix',
      method: 'POST',
      body: {
        ...config,
        mode,
        paths: selectedPaths,
        options,
        confirmApply,
      },
    });
  } catch (error) {
    console.error('Error in log-doctor fix flow', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Log-doctor fix failed: ${message}` },
      { status: 500 }
    );
  }
}
