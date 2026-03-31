import { NextRequest, NextResponse } from 'next/server';

import {
  isBlockedNetworkHostname,
  normalizeNetworkHostname,
} from '@/lib/network-safety';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import {
  listSessionsForConfigWithIssues,
  normalizeGitHubConfig,
} from '@/lib/session-storage';
import type { GitHubConfig } from '@/lib/types';
import {
  isAllowedVideoHostname,
  type VideoLinkCheckResult,
} from '@/lib/video-library';

const REQUEST_TIMEOUT_MS = 5000;
const HEAD_FALLBACK_STATUSES = new Set([403, 405, 501]);
const MAX_SESSION_IDS_TO_CHECK = 50;
const MAX_SESSIONS_TO_PROCESS = 100;
const LINK_CHECK_CONCURRENCY = 6;
const MAX_REDIRECT_HOPS = 5;

async function getAllowedDomainsForUser(uid: string): Promise<string[]> {
  if (process.env.MATMETRICS_AUTH_TEST_MODE === 'true') {
    return [];
  }

  const { getFirebaseAdminDb } = await import('@/lib/firebase-admin');
  const snapshot = await getFirebaseAdminDb()
    .collection('users')
    .doc(uid)
    .collection('preferences')
    .doc('app')
    .get();

  if (!snapshot.exists) {
    return [];
  }

  const customAllowedDomains =
    snapshot.data()?.videoLibrary?.customAllowedDomains;
  return Array.isArray(customAllowedDomains)
    ? customAllowedDomains.filter(
        (domain): domain is string => typeof domain === 'string'
      )
    : [];
}

async function fetchVideoUrl(
  url: string,
  method: 'HEAD' | 'GET'
): Promise<Response> {
  return fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function normalizeHostname(hostname: string): string {
  return normalizeNetworkHostname(hostname).replace(/^www\./, '');
}

function validateRedirectHostname(
  hostname: string,
  customAllowedDomains: string[]
): string | null {
  if (isBlockedNetworkHostname(hostname)) {
    return `Blocked network hostname encountered during redirect: ${hostname}`;
  }

  if (!isAllowedVideoHostname(hostname, customAllowedDomains)) {
    return `Disallowed hostname encountered during redirect: ${hostname}`;
  }

  return null;
}

async function fetchWithRedirectTraversal(
  initialUrl: string,
  customAllowedDomains: string[]
): Promise<{
  response: Response;
  resolvedUrl: string;
  resolvedHostname: string;
}> {
  let currentUrl = new URL(initialUrl);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const hostname = normalizeHostname(currentUrl.hostname);
    const blockedReason = validateRedirectHostname(
      hostname,
      customAllowedDomains
    );
    if (blockedReason) {
      throw new Error(blockedReason);
    }

    let response = await fetchVideoUrl(currentUrl.toString(), 'HEAD');
    if (HEAD_FALLBACK_STATUSES.has(response.status)) {
      response = await fetchVideoUrl(currentUrl.toString(), 'GET');
    }

    if (response.status < 300 || response.status >= 400) {
      return {
        response,
        resolvedUrl: currentUrl.toString(),
        resolvedHostname: hostname,
      };
    }

    if (hop === MAX_REDIRECT_HOPS) {
      throw new Error(
        `Redirect limit exceeded (${MAX_REDIRECT_HOPS} hops) for URL: ${initialUrl}`
      );
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(
        `Redirect response missing Location header: ${response.status}`
      );
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new Error('Unexpected redirect traversal state');
}

async function mapWithConcurrencyLimit<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        break;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

async function checkVideoLink(
  sessionId: string,
  url: string,
  hostname: string,
  customAllowedDomains: string[]
): Promise<VideoLinkCheckResult> {
  const checkedAt = new Date().toISOString();

  if (
    isBlockedNetworkHostname(hostname) ||
    !isAllowedVideoHostname(hostname, customAllowedDomains)
  ) {
    return {
      sessionId,
      url,
      hostname,
      status: 'disallowed_domain',
      checkedAt,
      error: `Disallowed hostname: ${hostname}`,
    };
  }

  try {
    const { response, resolvedHostname } = await fetchWithRedirectTraversal(
      url,
      customAllowedDomains
    );

    return {
      sessionId,
      url,
      hostname: resolvedHostname,
      status:
        response.status >= 200 && response.status < 400
          ? 'reachable'
          : 'broken',
      checkedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown fetch failure';
    if (
      /Disallowed hostname encountered during redirect|Blocked network hostname encountered during redirect/.test(
        message
      )
    ) {
      return {
        sessionId,
        url,
        hostname,
        status: 'disallowed_domain',
        checkedAt,
        error: message,
      };
    }

    return {
      sessionId,
      url,
      hostname,
      status: 'check_failed',
      checkedAt,
      error: message,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const body = (await request.json().catch(() => ({}))) as {
      gitHubConfig?: unknown;
      sessionIds?: unknown[];
    };
    const requestedGitHubConfig = normalizeGitHubConfig(
      body.gitHubConfig as GitHubConfig | undefined
    );
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }

    const requestedSessionIds = Array.isArray(body.sessionIds)
      ? Array.from(
          new Set(
            body.sessionIds.filter(
              (sessionId: unknown): sessionId is string =>
                typeof sessionId === 'string'
            )
          )
        ).slice(0, MAX_SESSION_IDS_TO_CHECK)
      : null;

    const { sessions } = await listSessionsForConfigWithIssues(
      authzResult.config
    );
    const customAllowedDomains = await getAllowedDomainsForUser(user.uid);

    const matchingSessions = sessions.filter((session) => {
      if (!session.videoUrl) {
        return false;
      }
      if (!requestedSessionIds) {
        return true;
      }
      return requestedSessionIds.includes(session.id);
    });

    const truncated = matchingSessions.length > MAX_SESSIONS_TO_PROCESS;
    const candidateSessions = matchingSessions.slice(
      0,
      MAX_SESSIONS_TO_PROCESS
    );

    const results = await mapWithConcurrencyLimit(
      candidateSessions,
      LINK_CHECK_CONCURRENCY,
      async (session) => {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(session.videoUrl as string);
        } catch {
          return {
            sessionId: session.id,
            url: session.videoUrl as string,
            hostname: '',
            status: 'check_failed',
            checkedAt: new Date().toISOString(),
            error: 'Invalid stored video URL',
          } satisfies VideoLinkCheckResult;
        }

        const hostname = normalizeHostname(parsedUrl.hostname);
        return checkVideoLink(
          session.id,
          parsedUrl.toString(),
          hostname,
          customAllowedDomains
        );
      }
    );

    return NextResponse.json(
      {
        results,
        processedCount: candidateSessions.length,
        truncated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error checking video links', error);
    return NextResponse.json(
      { error: 'Failed to check video links' },
      { status: 500 }
    );
  }
}
