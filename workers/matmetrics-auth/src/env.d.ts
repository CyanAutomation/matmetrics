declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    MATMETRICS_AUTH_CONTEXT_SECRET: string;
    MATMETRICS_AUTH_PUBLIC_URL: string;
    MATMETRICS_AUTH_FRONTEND_ORIGIN: string;
    MATMETRICS_AUTH_RP_ID: string;
    MATMETRICS_AUTH_ISSUER: string;
    MATMETRICS_AUTH_AUDIENCE: string;
  }
}
