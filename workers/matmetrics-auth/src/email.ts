import { env, waitUntil } from 'cloudflare:workers';
import { Resend } from 'resend';

export type AuthEmailKind = 'verification' | 'password-reset';

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

async function deliverAuthEmail(
  kind: AuthEmailKind,
  email: string,
  url: string,
  token: string
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.MATMETRICS_AUTH_EMAIL_FROM) {
    console.error('Better Auth email delivery is not configured', { kind });
    return;
  }

  let link: URL;
  try {
    link = new URL(url);
  } catch {
    console.error('Better Auth email link URL is invalid', { kind });
    return;
  }
  const isLocalHttp =
    link.protocol === 'http:' &&
    (link.hostname === 'localhost' || link.hostname === '127.0.0.1');
  if (link.protocol !== 'https:' && !isLocalHttp) {
    console.error('Better Auth email link URL is not secure', { kind });
    return;
  }

  const content = getEmailContent(kind, url);
  try {
    const { error } = await new Resend(env.RESEND_API_KEY).emails.send(
      {
        from: env.MATMETRICS_AUTH_EMAIL_FROM,
        to: email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      },
      { idempotencyKey: await makeIdempotencyKey(kind, token) }
    );
    if (error) {
      console.error('Better Auth email delivery failed', {
        kind,
        error: safeErrorCode(error),
      });
    }
  } catch (error) {
    console.error('Better Auth email delivery failed', {
      kind,
      error: safeErrorCode(error),
    });
  }
}

export function queueAuthEmail(
  kind: AuthEmailKind,
  email: string,
  url: string,
  token: string
): void {
  waitUntil(deliverAuthEmail(kind, email, url, token));
}
