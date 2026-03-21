import { NextRequest, NextResponse } from 'next/server';
import type { GitHubConfig, JudoSession } from '@/lib/types';

type ProxyOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  searchParams?: URLSearchParams;
};

type GitHubConfigLike = Partial<GitHubConfig> | null | undefined;

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') ||
    normalized.includes('+json')
  );
}

function buildProxyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  const cacheControl = response.headers.get('cache-control');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (cacheControl) {
    headers.set('cache-control', cacheControl);
  }

  return headers;
}

export function shouldProxyGitHubRequests(config: GitHubConfigLike): boolean {
  return !!config && !!process.env.GITHUB_TOKEN;
}

export async function proxyGoFunction(
  request: NextRequest,
  options: ProxyOptions
): Promise<NextResponse> {
  const targetURL = new URL(
    options.path,
    process.env.MATMETRICS_GO_PROXY_BASE_URL || request.nextUrl.origin
  );

  if (options.searchParams) {
    targetURL.search = options.searchParams.toString();
  }

  const headers = new Headers();
  headers.set('content-type', 'application/json');

  const authorization = request.headers.get('authorization');
  if (authorization) {
    headers.set('authorization', authorization);
  }

  const response = await fetch(targetURL.toString(), {
    method: options.method || 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type');

  if (isJsonContentType(contentType)) {
    const payload = await response.json().catch(() => null);
    return NextResponse.json(payload, { status: response.status });
  }

  const rawBody = await response.text().catch(() => '');

  return new NextResponse(rawBody || null, {
    status: response.status,
    headers: buildProxyResponseHeaders(response),
  });
}

export function buildGitHubSearchParams(config: GitHubConfig): URLSearchParams {
  const params = new URLSearchParams({
    owner: config.owner,
    repo: config.repo,
  });

  if (config.branch) {
    params.set('branch', config.branch);
  }

  return params;
}

export function buildGitHubSessionBody(
  session: JudoSession,
  config: GitHubConfig
): Record<string, unknown> {
  return {
    session,
    config,
  };
}

export function buildGitHubDeleteBody(
  id: string,
  config: GitHubConfig
): Record<string, unknown> {
  return {
    id,
    config,
  };
}
