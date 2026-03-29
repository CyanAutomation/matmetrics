import { NextResponse } from 'next/server';
import { INVALID_GO_PROXY_BASE_URL_MESSAGE } from '@/lib/go-function-proxy';

export function buildLogDoctorFixErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof Error &&
    error.message === INVALID_GO_PROXY_BASE_URL_MESSAGE
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Log-doctor fix failed: MATMETRICS_GO_PROXY_BASE_URL is invalid. This is a server configuration issue; update the proxy base URL to an absolute URL such as https://host:port.',
      },
      { status: 500 }
    );
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json(
    { success: false, message: `Log-doctor fix failed: ${message}` },
    { status: 500 }
  );
}
