import { env, waitUntil } from 'cloudflare:workers';
import { Resend } from 'resend';

export type AuthEmailKind = 'verification' | 'password-reset';

const MAX_EMAIL_SEND_ATTEMPTS = 3;
const EMAIL_RETRY_DELAYS_MS = [250, 1_000] as const;
const EMAIL_SEND_TIMEOUT_MS = 5_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getEmailContent(kind: AuthEmailKind, url: string) {
  const isVerification = kind === 'verification';
  const title = isVerification
    ? 'Verify your email'
    : 'Set or reset your password';
  const action = isVerification ? 'Verify email' : 'Set password';
  const message = isVerification
    ? 'Verify your email to finish setting up your MatMetrics account.'
    : 'Use this secure link to set or reset your MatMetrics password.';
  const subject = isVerification
    ? 'Verify your email for MatMetrics'
    : 'Set or reset your MatMetrics password';
  const safeUrl = escapeHtml(url);
  const footer =
    'This link expires in one hour. If you did not request this, you can ignore this email.';
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + title + '</title></head>',
    '<body style="margin:0;background:#f5f5f5;color:#171717;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5"><tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff"><tr><td style="padding:32px">',
    '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#171717">' +
      title +
      '</h1>',
    '<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#404040">' +
      message +
      '</p>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#171717" style="background-color:#171717">',
    '<a href="' +
      safeUrl +
      '" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:16px;line-height:1.4;text-decoration:none">' +
      action +
      '</a></td></tr></table>',
    '<p style="margin:24px 0 8px;font-size:14px;line-height:1.5;color:#555555">' +
      footer +
      '</p>',
    '<p style="margin:0;font-size:14px;line-height:1.5;color:#555555">If the button does not work, copy this link into your browser:<br>',
    '<a href="' +
      safeUrl +
      '" style="color:#174ea6;word-break:break-all">' +
      safeUrl +
      '</a></p></td></tr></table></td></tr></table></body></html>',
  ].join('');
  const text = subject + ': ' + url + '\n\n' + footer;

  return { subject, html, text };
}

function safeErrorCode(error: unknown): number | string {
  if (!error || typeof error !== 'object') return 'unknown';
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  if ('name' in error && typeof error.name === 'string') return error.name;
  return 'unknown';
}

function isSecureOrigin(url: URL): boolean {
  const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
    url.hostname
  );
  return url.protocol === 'https:' || (isLoopback && url.protocol === 'http:');
}

function hasTrustedAuthOriginConfiguration(): boolean {
  try {
    const publicUrl = new URL(env.MATMETRICS_AUTH_PUBLIC_URL);
    const frontendOrigin = new URL(env.MATMETRICS_AUTH_FRONTEND_ORIGIN);
    return (
      publicUrl.origin === frontendOrigin.origin &&
      publicUrl.pathname === '/' &&
      !publicUrl.search &&
      !publicUrl.hash &&
      !publicUrl.username &&
      !publicUrl.password &&
      frontendOrigin.pathname === '/' &&
      !frontendOrigin.search &&
      !frontendOrigin.hash &&
      !frontendOrigin.username &&
      !frontendOrigin.password &&
      isSecureOrigin(publicUrl)
    );
  } catch {
    return false;
  }
}

function errorStatusCode(error: unknown): number | null {
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return null;
}

function isRetryable(error: unknown): boolean {
  const statusCode = errorStatusCode(error);
  return statusCode === null || statusCode === 429 || statusCode >= 500;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function hasAuthEmailConfiguration(): boolean {
  return Boolean(
    env.RESEND_API_KEY?.trim() &&
      env.MATMETRICS_AUTH_EMAIL_FROM?.trim() &&
      hasTrustedAuthOriginConfiguration()
  );
}

export function isSafeAuthEmailUrl(value: string): boolean {
  let link: URL;
  let configuredOrigin: URL;
  try {
    link = new URL(value);
    configuredOrigin = new URL(env.MATMETRICS_AUTH_PUBLIC_URL);
  } catch {
    return false;
  }

  const secureProtocol =
    link.protocol === 'https:' ||
    (isSecureOrigin(configuredOrigin) &&
      configuredOrigin.protocol === 'http:' &&
      link.protocol === 'http:');
  const redirectUrl =
    link.searchParams.get('callbackURL') ??
    link.searchParams.get('redirectTo');
  if (redirectUrl) {
    try {
      const redirect = new URL(redirectUrl, configuredOrigin);
      if (redirect.origin !== configuredOrigin.origin || !isSecureOrigin(redirect)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return (
    secureProtocol &&
    link.origin === configuredOrigin.origin &&
    !link.username &&
    !link.password
  );
}

async function makeIdempotencyKey(
  kind: AuthEmailKind,
  token: string
): Promise<string> {
  const bytes = new TextEncoder().encode(kind + ':' + token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const suffix = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return 'matmetrics-' + kind + '-' + suffix;
}

export async function deliverAuthEmail(
  kind: AuthEmailKind,
  email: string,
  url: string,
  token: string
): Promise<void> {
  if (!hasAuthEmailConfiguration()) {
    console.error('Better Auth email delivery is not configured', { kind });
    return;
  }

  if (!isSafeAuthEmailUrl(url)) {
    console.error('Better Auth email link URL is invalid or untrusted', {
      kind,
    });
    return;
  }

  const content = getEmailContent(kind, url);
  const resend = new Resend(env.RESEND_API_KEY);
  const idempotencyKey = await makeIdempotencyKey(kind, token);
  let finalError: unknown;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_EMAIL_SEND_ATTEMPTS; attempt += 1) {
    attemptsMade = attempt;
    try {
      const { error } = await resend.emails.send(
        {
          from: env.MATMETRICS_AUTH_EMAIL_FROM,
          to: email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        },
        {
          idempotencyKey,
          signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
        }
      );
      if (!error) return;
      finalError = error;
      if (!isRetryable(error) || attempt === MAX_EMAIL_SEND_ATTEMPTS) break;
    } catch (error) {
      finalError = error;
      if (!isRetryable(error) || attempt === MAX_EMAIL_SEND_ATTEMPTS) break;
    }

    await delay(EMAIL_RETRY_DELAYS_MS[attempt - 1]);
  }

  console.error('Better Auth email delivery failed', {
    kind,
    attempts: attemptsMade,
    error: safeErrorCode(finalError),
  });
}

export function queueAuthEmail(
  kind: AuthEmailKind,
  email: string,
  url: string,
  token: string
): void {
  waitUntil(deliverAuthEmail(kind, email, url, token));
}
