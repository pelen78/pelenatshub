import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { authenticate } from '../server/auth.js';
import { onRequest } from '../functions/api/admin/_middleware.js';
const env = { GITHUB_TOKEN: 'not-a-real-token', ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com', ACCESS_AUD: 'test-audience', ADMIN_EMAILS: 'teacher@example.com,personal@example.com' };
const keys = await generateKeyPair('RS256');
async function token(email, options = {}) {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'RS256' }).setIssuer(options.issuer || 'https://school.cloudflareaccess.com').setAudience(options.audience || env.ACCESS_AUD).setExpirationTime(options.expires || '1h').sign(keys.privateKey);
}
const verify = (jwt, _, options) => jwtVerify(jwt, keys.publicKey, options);
const request = value => new Request('https://pelenlab.com/api/admin/state', { headers: value ? { 'Cf-Access-Jwt-Assertion': value } : {} });
test('both authorized emails pass cryptographic JWT verification', async () => {
  for (const email of ['teacher@example.com', 'personal@example.com']) assert.equal((await authenticate(request(await token(email)), env, verify)).email, email);
});
test('unconfigured, missing, forged, expired and wrong-audience sessions fail closed', async () => {
  assert.equal((await authenticate(request(), {})).status, 503);
  assert.equal((await authenticate(request(), env)).status, 401);
  assert.equal((await authenticate(request('forged'), env, verify)).status, 401);
  assert.equal((await authenticate(request(await token('other@example.com')), env, verify)).status, 403);
  for (const options of [{ audience: 'other' }, { issuer: 'https://evil.example' }, { expires: 946684800 }]) assert.equal((await authenticate(request(await token('teacher@example.com', options)), env, verify)).status, 401);
});
test('unauthenticated API requests cannot reach GitHub handler', async () => {
  let called = false;
  const response = await onRequest({ request: request(), env, data: {}, next: () => { called = true; } });
  assert.equal(response.status, 401); assert.equal(called, false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
