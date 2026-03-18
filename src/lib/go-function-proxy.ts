import { NextRequest, NextResponse } from 'next/server';
import type { GitHubConfig, JudoSession } from '@/lib/types';

type ProxyOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  searchParams?: URLSearchParams;
};

type GitHubConfigLike = Partial<GitHubConfig> | null | undefined;

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

  const response = await fetch(targetURL.toString(), {
    method: options.method || 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
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
