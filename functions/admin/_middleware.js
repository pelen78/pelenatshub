import { authenticate } from '../../server/auth.js';

export async function onRequest({ request, env, next }) {
  // Access authenticates the canonical host. Send www visitors there first.
  const url = new URL(request.url);
  if (url.hostname === 'www.pelenlab.com' && ['GET', 'HEAD'].includes(request.method)) {
    url.protocol = 'https:';
    url.hostname = 'pelenlab.com';
    url.port = '';
    return Response.redirect(url.href, 302);
  }
  const identity = await authenticate(request, env);
  if (identity.error) return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Teacher dashboard</title><style>body{font:18px system-ui;max-width:620px;margin:12vh auto;padding:24px;background:#edf0f8;color:#142758}a{color:inherit}</style><h1>Teacher dashboard</h1><p>${identity.error}</p><p><a href="/">Back to hub</a></p></html>`, { status: identity.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
  return secureResponse(await next());
}

export function secureResponse(upstream) {
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  return response;
}
