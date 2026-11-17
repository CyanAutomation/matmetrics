export type AuthOriginEnvironment = {
  ENVIRONMENT?: string;
  MATMETRICS_AUTH_PUBLIC_URL?: string;
  MATMETRICS_AUTH_FRONTEND_ORIGIN?: string;
  MATMETRICS_AUTH_ADDITIONAL_FRONTEND_ORIGINS?: string;
  MATMETRICS_AUTH_RP_ID?: string;
};

export type TrustedAuthOriginConfiguration = {
  publicUrl: string;
  frontendOrigin: string;
  rpId: string;
  trustedOrigins: string[];
  passkeyOrigins: string[];
};

function parseExactOrigin(value: string, environment: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Authentication origins must be valid absolute origins');
  }

  const localDevelopmentOrigin =
    environment === 'development' &&
    url.protocol === 'http:' &&
    url.hostname === 'localhost';
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !localDevelopmentOrigin) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Authentication origins must be exact HTTPS origins (localhost HTTP is development-only)');
  }
  return url;
}

function isWithinRelyingParty(hostname: string, rpId: string): boolean {
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

export function getTrustedAuthOriginConfiguration(
  environment: AuthOriginEnvironment
): TrustedAuthOriginConfiguration {
  const mode = environment.ENVIRONMENT;
  if (mode !== 'development' && mode !== 'production') {
    throw new Error('ENVIRONMENT must be explicitly set to development or production');
  }
  const publicUrlValue = environment.MATMETRICS_AUTH_PUBLIC_URL?.trim();
  const frontendOriginValue = environment.MATMETRICS_AUTH_FRONTEND_ORIGIN?.trim();
  const rpId = environment.MATMETRICS_AUTH_RP_ID?.trim().toLowerCase();
  if (!publicUrlValue || !frontendOriginValue || !rpId) {
    throw new Error('Public auth URL, frontend origin, and passkey RP ID are required');
  }
  const publicUrl = parseExactOrigin(publicUrlValue, mode);
  const frontendOrigin = parseExactOrigin(frontendOriginValue, mode);
  if (
    rpId === '*' ||
    !/^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})$/.test(rpId)
  ) {
    throw new Error('Passkey RP ID must be a valid exact domain name');
  }

  const additionalOrigins = (environment.MATMETRICS_AUTH_ADDITIONAL_FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const trustedOrigins = [frontendOrigin.origin];
  for (const value of additionalOrigins) {
    const origin = parseExactOrigin(value, mode);
    if (!isWithinRelyingParty(origin.hostname.toLowerCase(), rpId)) {
      throw new Error(`Frontend origin ${origin.origin} is outside the configured passkey RP ID`);
    }
    if (!trustedOrigins.includes(origin.origin)) trustedOrigins.push(origin.origin);
  }
  if (!isWithinRelyingParty(frontendOrigin.hostname.toLowerCase(), rpId)) {
    throw new Error('Frontend origin is outside the configured passkey RP ID');
  }

  return {
    publicUrl: publicUrl.origin,
    frontendOrigin: frontendOrigin.origin,
    rpId,
    trustedOrigins,
    passkeyOrigins: [...trustedOrigins],
  };
}
