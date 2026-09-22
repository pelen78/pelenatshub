import { authenticate, json } from '../../../server/auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const identity = await authenticate(request, env);
  if (identity.error) return json({ error: identity.error }, identity.status);
  const expectedOrigin = env.PUBLIC_ORIGIN || 'https://pelenlab.com';
  if (new URL(request.url).origin !== expectedOrigin) return json({ error: 'Publicación permitida solo desde el sitio principal.' }, 403);
  if (request.method !== 'GET' && (request.headers.get('Origin') !== expectedOrigin || request.headers.get('X-Hub-Request') !== '1')) {
    return json({ error: 'Solicitud no autorizada.' }, 403);
  }
  context.data.identity = identity;
  return context.next();
}
