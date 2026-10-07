import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequest } from '../functions/_middleware.js';

const env = { GITHUB_TOKEN: 'test-only-server-secret' };
const origin = 'https://pelenlab.com';
const cookieName = '__Host-pelenhub-class';
async function visit(path, options = {}, configuration = env) {
  let reached = false;
  const response = await onRequest({
    request: new Request(new URL(path, origin), options), env: configuration,
    next: async () => { reached = true; return new Response('RESOURCE', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' } }); }
  });
  return { response, reached };
}
async function login(code = '1953', next = '/', configuration = env, headers = {}) {
  return visit('/__class_access', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ code, next }).toString()
  }, configuration);
}
const cookieFrom = response => response.headers.get('set-cookie').split(';')[0];

test('tasks, subject resources and direct downloads require the code on first visit', async () => {
  const routes = JSON.parse(await readFile(new URL('../_routes.json', import.meta.url)));
  assert.deepEqual(routes.include, ['/*']);
  assert.deepEqual(routes.exclude, []);
  for (const path of ['/assignments/example/', '/comp-apps/test.html', '/makerspace/test.html', '/ap-cs-principles/syllabus.pdf', '/resources/example.docx', '/games/test.html', '/resources/example.zip', '/index/other', '/index.html/other']) {
    const { response, reached } = await visit(path);
    assert.equal(reached, false, path);
    assert.equal(response.status, 401, path);
    assert.match(await response.text(), /Enter class code/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('the hub and subject tabs are public without unlocking tasks or showing a second code dialog', async () => {
  for (const path of ['/', '/index', '/index.html', '/?subject=MakerSpace', '/#resources']) {
    for (const method of ['GET', 'HEAD']) {
      const { response, reached } = await visit(path, { method }, {});
      assert.equal(reached, true, path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.has('set-cookie'), false);
    }
  }
  assert.equal((await visit('/resources/today-class.html')).reached, false);
  const hub = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!hub.includes('id="gate"'));
  assert.ok(!hub.includes('pelenhub-unlocked'));
});

test('wrong code stays locked; correct code returns to the requested resource', async () => {
  const wrong = await login('0000', '/assignments/example/');
  assert.equal(wrong.response.status, 403);
  assert.equal(wrong.response.headers.has('set-cookie'), false);
  assert.match(await wrong.response.text(), /That code is not right/);
  const { response } = await login('1953', '/assignments/example/?view=full#crop');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/assignments/example/?view=full#crop');
  const cookie = response.headers.get('set-cookie');
  for (const attribute of ['Path=/', 'Max-Age=31536000', 'Secure', 'HttpOnly', 'SameSite=Lax']) assert.ok(cookie.includes(attribute));
  assert.ok(!cookie.includes('test-only-server-secret'));
  assert.ok(!cookie.includes('1953'));
});

test('one accepted code unlocks later visits across subjects and downloads without a public cache', async () => {
  const Cookie = cookieFrom((await login()).response);
  for (const path of ['/assignments/example/', '/makerspace/test.html', '/resources/test.pdf', '/games/example/']) {
    const { response, reached } = await visit(path, { headers: { Cookie } });
    assert.equal(reached, true);
    assert.equal(await response.text(), 'RESOURCE');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('vary'), /Cookie/);
  }
});

test('forged, duplicate, expired and previous-code cookies cannot unlock resources', async () => {
  const Cookie = cookieFrom((await login()).response);
  const pieces = Cookie.split('.');
  const expired = [...pieces]; expired[1] = '9466848000';
  const forged = `${Cookie.slice(0, -5)}xxxxx`;
  for (const invalid of [`${cookieName}=1`, forged, Cookie + '; ' + Cookie, expired.join('.'), 'pelenhub-unlocked=1']) {
    assert.equal((await visit('/resources/test.pdf', { headers: { Cookie: invalid } })).reached, false);
  }
  const token = Cookie.slice(cookieName.length + 1);
  const [version, , nonce] = token.split('.');
  const payload = `${version}.${Math.floor(Date.now() / 1000) - 10}.${nonce}`;
  const bytes = new TextEncoder();
  const derived = await crypto.subtle.digest('SHA-256', bytes.encode(`pelenhub/class-access/v1\0${env.GITHUB_TOKEN}`));
  const key = await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = Buffer.from(await crypto.subtle.sign('HMAC', key, bytes.encode(`${payload}\0${1953}`))).toString('base64url');
  assert.equal((await visit('/resources/test.pdf', { headers: { Cookie: `${cookieName}=${payload}.${mac}` } })).reached, false);
  assert.equal((await visit('/resources/test.pdf', { headers: { Cookie } }, { ...env, CLASS_CODE: '4321' })).reached, false);
});

test('teacher authentication and publication polling retain their existing handlers', async () => {
  for (const path of ['/admin', '/admin/', '/admin/app.js', '/api/admin/state', '/publication.json', '/cdn-cgi/access/login']) {
    assert.equal((await visit(path, {}, {})).reached, true);
  }
  for (const path of ['/administrator', '/api/admin-other', '/publication.json/other']) assert.equal((await visit(path)).reached, false);
});

test('rejects cross-origin and malformed submissions and unsafe redirect targets', async () => {
  assert.equal((await login('1953', '/', env, { Origin: 'https://other.example' })).response.status, 403);
  assert.equal((await login('1953', '/', env, { 'Content-Type': 'application/json' })).response.status, 400);
  assert.equal((await login('1953', 'x'.repeat(5000))).response.status, 400);
  for (const next of ['https://other.example', '//other.example/path', '/\\other.example', '/__class_access', '/%0a/../../__class_access']) {
    assert.equal((await login('1953', next)).response.headers.get('location'), '/');
  }
  const { response } = await visit('/resources/test.pdf?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E');
  assert.ok(!(await response.text()).includes('<script>alert(1)'));
});

test('missing server configuration fails closed and HEAD reveals no content', async () => {
  assert.equal((await visit('/resources/test.pdf', {}, {})).response.status, 503);
  const { response, reached } = await visit('/resources/test.pdf', { method: 'HEAD' });
  assert.equal(reached, false);
  assert.equal(response.status, 401);
  assert.equal(await response.text(), '');
  assert.equal((await visit('/', { method: 'POST' })).response.status, 401);
});

test('www visits use the same canonical browser access cookie', async () => {
  const { response, reached } = await visit('https://www.pelenlab.com/assignments/example/?a=1');
  assert.equal(reached, false);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), origin + '/assignments/example/?a=1');
});
