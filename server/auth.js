import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();
export async function authenticate(request, env, verify = jwtVerify) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAILS || !env.GITHUB_TOKEN) {
    return { status: 503, error: 'Falta configurar el acceso y la conexión a GitHub en Cloudflare.' };
  }
  const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) return { status: 503, error: 'Configuración de acceso inválida.' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { status: 401, error: 'Entra al panel con tu correo autorizado.' };
  try {
    const issuer = `https://${domain}`;
    if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
    const { payload } = await verify(token, keySets.get(issuer), { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'] });
    if (!payload.exp || typeof payload.email !== 'string' || !env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).includes(payload.email.toLowerCase())) {
      return { status: 403, error: 'Este correo no tiene permiso para publicar.' };
    }
    return { email: payload.email };
  } catch {
    return { status: 401, error: 'Tu sesión venció. Vuelve a entrar al panel.' };
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
