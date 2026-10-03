import { auth } from './auth';

export default {
  fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/healthz') {
      return Promise.resolve(
        Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
      );
    }
    return auth.handler(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
