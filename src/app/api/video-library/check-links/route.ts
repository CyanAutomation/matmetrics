import { NextRequest, NextResponse } from 'next/server';

import { isBlockedNetworkHostname } from '@/lib/network-safety';
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
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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
    };
  }

  try {
    let response = await fetchVideoUrl(url, 'HEAD');
    if (HEAD_FALLBACK_STATUSES.has(response.status)) {
      response = await fetchVideoUrl(url, 'GET');
    }

    return {
      sessionId,
      url,
      hostname,
      status:
        response.status >= 200 && response.status < 400
          ? 'reachable'
          : 'broken',
      checkedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      sessionId,
      url,
      hostname,
      status: 'check_failed',
      checkedAt,
      error: error instanceof Error ? error.message : 'Unknown fetch failure',
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
      ? body.sessionIds.filter(
          (sessionId: unknown): sessionId is string =>
            typeof sessionId === 'string'
        )
      : null;

    const { sessions } = await listSessionsForConfigWithIssues(
      authzResult.config
    );
    const customAllowedDomains = await getAllowedDomainsForUser(user.uid);

    const candidateSessions = sessions.filter((session) => {
      if (!session.videoUrl) {
        return false;
      }
      if (!requestedSessionIds) {
        return true;
      }
      return requestedSessionIds.includes(session.id);
    });

    const results = await Promise.all(
      candidateSessions.map(async (session) => {
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

        const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
        return checkVideoLink(
          session.id,
          parsedUrl.toString(),
          hostname,
          customAllowedDomains
        );
      })
    );

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error('Error checking video links', error);
    return NextResponse.json(
      { error: 'Failed to check video links' },
      { status: 500 }
    );
  }
}
