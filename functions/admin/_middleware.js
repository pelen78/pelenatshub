import { authenticate } from '../../server/auth.js';

export async function onRequest({ request, env, next }) {
  const identity = await authenticate(request, env);
  if (identity.error) return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Panel de profesor</title><style>body{font:18px system-ui;max-width:620px;margin:12vh auto;padding:24px;background:#edf0f8;color:#142758}a{color:inherit}</style><h1>Panel de profesor</h1><p>${identity.error}</p><p><a href="/">Volver al hub</a></p></html>`, { status: identity.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
  const response = new Response(await next());
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  return response;
}
