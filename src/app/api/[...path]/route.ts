import { NextRequest, NextResponse } from 'next/server';

// Keep API implementations in api-handler.ts modules and register them here
// so the API surface is emitted as one Next.js route handler.
import * as assessSession from '../ai/assess-session/api-handler';
import * as suggestTechniques from '../ai/suggest-techniques/api-handler';
import * as transformDescription from '../ai/transform-description/api-handler';
import * as backgroundJob from '../background-jobs/[id]/api-handler';
import * as githubHealth from '../github/health/api-handler';
import * as githubLogDoctorFix from '../github/log-doctor/fix/api-handler';
import * as githubLogDoctor from '../github/log-doctor/api-handler';
import * as githubSyncAll from '../github/sync-all/api-handler';
import * as githubValidate from '../github/validate/api-handler';
import * as backgroundJobExecutor from '../internal/background-jobs/execute/api-handler';
import * as pluginCreate from '../plugins/create/api-handler';
import * as pluginDashboardTabs from '../plugins/discovered-dashboard-tabs/api-handler';
import * as pluginList from '../plugins/list/api-handler';
import * as pluginToggle from '../plugins/toggle/api-handler';
import * as pluginUpdate from '../plugins/update/api-handler';
import * as pluginValidate from '../plugins/validate/api-handler';
import * as preferences from '../preferences/api-handler';
import * as recentReleases from '../releases/recent/api-handler';
import * as sessionById from '../sessions/[id]/api-handler';
import * as sessionCreate from '../sessions/create/api-handler';
import * as sessionList from '../sessions/list/api-handler';
import * as videoLibrary from '../video-library/check-links/api-handler';

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type HandlerContext = { params: Promise<{ id: string }> };
type ApiHandler = (
  request: NextRequest,
  context: HandlerContext
) => Response | Promise<Response>;
type ApiRoute = Partial<Record<ApiMethod, ApiHandler>>;

const routes: Record<string, ApiRoute> = {
  '/api/ai/assess-session': { POST: assessSession.POST },
  '/api/ai/suggest-techniques': { POST: suggestTechniques.POST },
  '/api/ai/transform-description': { POST: transformDescription.POST },
  '/api/github/health': { POST: githubHealth.POST },
  '/api/github/log-doctor': { POST: githubLogDoctor.POST },
  '/api/github/log-doctor/fix': { POST: githubLogDoctorFix.POST },
  '/api/github/sync-all': { POST: githubSyncAll.POST },
  '/api/github/validate': { POST: githubValidate.POST },
  '/api/internal/background-jobs/execute': {
    POST: backgroundJobExecutor.POST,
  },
  '/api/plugins/create': { POST: pluginCreate.POST },
  '/api/plugins/discovered-dashboard-tabs': {
    GET: pluginDashboardTabs.GET,
  },
  '/api/plugins/list': { GET: pluginList.GET },
  '/api/plugins/toggle': { POST: pluginToggle.POST },
  '/api/plugins/update': { POST: pluginUpdate.POST },
  '/api/plugins/validate': { POST: pluginValidate.POST },
  '/api/preferences': { GET: preferences.GET, PUT: preferences.PUT },
  '/api/releases/recent': { GET: recentReleases.GET },
  '/api/sessions/create': { POST: sessionCreate.POST },
  '/api/sessions/list': { GET: sessionList.GET },
  '/api/video-library/check-links': { POST: videoLibrary.POST },
};

const dynamicRoutes: Array<{ pattern: RegExp; handlers: ApiRoute }> = [
  {
    pattern: /^\/api\/background-jobs\/([^/]+)$/i,
    handlers: { GET: backgroundJob.GET },
  },
  {
    pattern: /^\/api\/sessions\/([^/]+)$/i,
    handlers: {
      GET: sessionById.GET,
      PUT: sessionById.PUT,
      DELETE: sessionById.DELETE,
    },
  },
];

type RouteResolution =
  | { kind: 'found'; handlers: ApiRoute; id?: string }
  | { kind: 'bad-parameter' }
  | { kind: 'missing' };

function normalizePathname(pathname: string): string {
  const withoutTrailingSlashes = pathname.replace(/\/+$/, '');
  return withoutTrailingSlashes || '/';
}

function resolveRoute(pathname: string): RouteResolution {
  const normalizedPath = normalizePathname(pathname);
  const exactRoute = routes[normalizedPath.toLowerCase()];
  if (exactRoute) return { kind: 'found', handlers: exactRoute };

  for (const dynamicRoute of dynamicRoutes) {
    const match = normalizedPath.match(dynamicRoute.pattern);
    if (!match) continue;

    try {
      return {
        kind: 'found',
        handlers: dynamicRoute.handlers,
        id: decodeURIComponent(match[1]),
      };
    } catch {
      return { kind: 'bad-parameter' };
    }
  }

  return { kind: 'missing' };
}

function getAllowedMethods(handlers: ApiRoute): string {
  return ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']
    .filter((method) => {
      if (method === 'OPTIONS') return true;
      if (method === 'HEAD') return Boolean(handlers.GET);
      return Boolean(handlers[method as ApiMethod]);
    })
    .join(', ');
}

function methodNotAllowed(handlers: ApiRoute): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: getAllowedMethods(handlers) },
  });
}

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function dispatch(
  request: NextRequest,
  method: ApiMethod | 'HEAD' | 'OPTIONS'
): Promise<Response> {
  const resolution = resolveRoute(request.nextUrl.pathname);
  if (resolution.kind === 'missing') {
    const response = NextResponse.json({ error: 'Not found' }, { status: 404 });
    return method === 'HEAD' ? withoutBody(response) : response;
  }
  if (resolution.kind === 'bad-parameter') {
    const response = NextResponse.json(
      { error: 'Invalid path parameter' },
      { status: 400 }
    );
    return method === 'HEAD' ? withoutBody(response) : response;
  }

  const { handlers, id } = resolution;
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: getAllowedMethods(handlers) },
    });
  }

  const handler = method === 'HEAD' ? handlers.GET : handlers[method];
  if (!handler) {
    const response = methodNotAllowed(handlers);
    return method === 'HEAD' ? withoutBody(response) : response;
  }

  const response = await handler(request, {
    params: Promise.resolve({ id: id ?? '' }),
  });
  if (method === 'HEAD') {
    return withoutBody(response);
  }
  return response;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export const GET = (request: NextRequest) => dispatch(request, 'GET');
export const POST = (request: NextRequest) => dispatch(request, 'POST');
export const PUT = (request: NextRequest) => dispatch(request, 'PUT');
export const PATCH = (request: NextRequest) => dispatch(request, 'PATCH');
export const DELETE = (request: NextRequest) => dispatch(request, 'DELETE');
export const HEAD = (request: NextRequest) => dispatch(request, 'HEAD');
export const OPTIONS = (request: NextRequest) => dispatch(request, 'OPTIONS');
