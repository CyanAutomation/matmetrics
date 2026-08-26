import { NextRequest, NextResponse } from 'next/server';
import { proxyGoFunction } from '@/lib/go-function-proxy';
import { validateGitHubRoute } from '@/lib/github-route-helpers';

/**
 * POST /api/github/validate
 * Test GitHub credentials
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateGitHubRoute(request, { parseMode: 'loose' });
    if (!validation.ok) {
      return validation.response;
    }

    return proxyGoFunction(request, {
      path: '/api/go/github/validate',
      method: 'POST',
      body: validation.config,
    });
  } catch (error) {
    console.error('Error validating GitHub credentials', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Validation failed: ${message}` },
      { status: 500 }
    );
  }
}
