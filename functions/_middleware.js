// The hub is public; one class-code check covers tasks, resources and downloads.
// Teacher administration keeps its existing Cloudflare Access authentication.
const COOKIE = '__Host-pelenhub-class';
const LIFETIME = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function isTeacherPath(path) {
  return path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
}
function code(env) { return String(env.CLASS_CODE || '1953'); }
async function signingKey(env) {
  // A dedicated secret can be supplied. Otherwise derive a separate signing key
  // from the existing server-only deployment secret; never send that secret out.
  const secret = env.CLASS_ACCESS_SECRET || env.GITHUB_TOKEN;
  if (!secret) return null;
  const derived = await crypto.subtle.digest('SHA-256', encoder.encode(`pelenhub/class-access/v1\0${secret}`));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signature(key, payload, env) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${payload}\0${code(env)}`)));
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid signature');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function validCookie(request, key, env) {
  const values = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return false;
  const token = values[0].slice(COOKIE.length + 1);
  const [version, expires, nonce, mac, extra] = token.split('.');
  if (extra || version !== 'v1' || !/^\d{10}$/.test(expires || '') || !/^[a-f0-9-]{36}$/.test(nonce || '')) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Number(expires) <= now || Number(expires) > now + LIFETIME + 60) return false;
  try {
    return await crypto.subtle.verify('HMAC', key, decode(mac || ''), encoder.encode(`${version}.${expires}.${nonce}\0${code(env)}`));
  } catch { return false; }
}
async function cookie(key, env) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + LIFETIME}.${crypto.randomUUID()}`;
  const token = `${payload}.${base64url(await signature(key, payload, env))}`;
  return `${COOKIE}=${token}; Path=/; Max-Age=${LIFETIME}; Secure; HttpOnly; SameSite=Lax`;
}
function privateResponse(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function safeDestination(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n\0]/.test(value)) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname === '/__class_access') return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
function gate(destination, error = '', status = 401) {
  return privateResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Class access · Pelen Hub</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#edf1fa;color:#14203a;font-family:Nunito,system-ui,sans-serif}.box{width:min(100%,410px);background:#fff;border:1px solid #d4daea;border-top:5px solid #f3b700;border-radius:14px;padding:30px;box-shadow:0 12px 40px #12275c14}.brand{color:#0e7c8b;letter-spacing:.16em;font-size:12px;font-weight:800}h1{font-size:28px;line-height:1.15;color:#12275c;margin:20px 0 12px}p{line-height:1.55;color:#5c6b88}label{display:block;font-weight:700;margin:22px 0 8px}input{width:100%;border:2px solid #cbd3e5;border-radius:8px;padding:12px;font:25px ui-monospace,monospace;letter-spacing:.45em;text-align:center}input:focus{outline:3px solid #f3b700;outline-offset:2px}button{width:100%;padding:13px;border:0;border-radius:8px;background:#12275c;color:white;font:700 16px Nunito,system-ui,sans-serif;cursor:pointer}.error{color:#9f1239;min-height:24px;margin:10px 0}.teacher{display:block;margin-top:22px;color:#0e7c8b;font-size:13px;text-align:center}</style></head><body>
<main class="box"><div class="brand">PELEN HUB · ROOM LB6</div><h1>Enter class code</h1><p>Type the code your teacher gave you. We’ll remember this browser for your next visit.</p><form action="/__class_access" method="post"><input type="hidden" name="next" value="${escape(destination)}"><label for="class-code">Class code</label><input id="class-code" name="code" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required autofocus><p class="error" role="alert">${escape(error)}</p><button type="submit">Enter</button></form><a class="teacher" href="/admin/">Teacher sign in</a></main>
<script>if(location.hash){const n=document.querySelector('input[name="next"]');if(!n.value.includes('#'))n.value+=location.hash;}</script></body></html>`, status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'", 'Referrer-Policy': 'same-origin' });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.hostname === 'www.pelenlab.com' && ['GET', 'HEAD'].includes(request.method)) {
    url.hostname = 'pelenlab.com'; url.protocol = 'https:'; url.port = '';
    return Response.redirect(url.href, 302);
  }
  // Publication status is non-content metadata used by the teacher dashboard.
  if (isTeacherPath(url.pathname) || url.pathname.startsWith('/cdn-cgi/') || url.pathname === '/publication.json') return context.next();
  // Browsing the hub and its subject tabs never grants access to any resource.
  if (['GET', 'HEAD'].includes(request.method) && ['/', '/index', '/index.html'].includes(url.pathname)) return context.next();
  const key = await signingKey(env);
  if (!key) return privateResponse('Class access is temporarily unavailable. Please contact your teacher.', 503, { 'Content-Type': 'text/plain; charset=utf-8' });
  if (url.pathname === '/__class_access') {
    if (request.method !== 'POST') return gate('/');
    if (request.headers.get('Origin') !== url.origin) return privateResponse('Invalid request origin.', 403);
    if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type') || '') || Number(request.headers.get('Content-Length') || 0) > 4096) return privateResponse('Invalid request.', 400);
    const body = await request.text();
    if (body.length > 4096) return privateResponse('Invalid request.', 400);
    const form = new URLSearchParams(body);
    const destination = safeDestination(form.get('next'), url.origin);
    if (form.getAll('code').length !== 1 || form.get('code')?.trim() !== code(env)) return gate(destination, 'That code is not right. Try again.', 403);
    return privateResponse(null, 303, { Location: destination, 'Set-Cookie': await cookie(key, env) });
  }
  if (!await validCookie(request, key, env)) {
    if (!['GET', 'HEAD'].includes(request.method)) return privateResponse('Enter the class code first.', 401);
    const response = gate(url.pathname + url.search);
    return request.method === 'HEAD' ? new Response(null, response) : response;
  }
  const response = await context.next();
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'private, no-store');
  secured.headers.append('Vary', 'Cookie');
  // Rolling expiry: regular visitors do not have to enter the code every year.
  secured.headers.append('Set-Cookie', await cookie(key, env));
  return secured;
}
