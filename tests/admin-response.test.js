import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, secureResponse } from '../functions/admin/_middleware.js';

test('www dashboard visitors reach the canonical login without serving private assets', async () => {
  for (const path of ['/admin', '/admin/', '/admin/publisher.js']) {
    let served = false;
    const response = await onRequest({
      request: new Request(`https://www.pelenlab.com${path}`), env: {},
      next: () => { served = true; },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `https://pelenlab.com${path}`);
    assert.equal(served, false);
  }
});

test('canonical and preview hosts still require authentication', async () => {
  for (const host of ['pelenlab.com', 'pelenlab.pages.dev']) {
    const response = await onRequest({
      request: new Request(`https://${host}/admin/`), env: {},
      next: () => { throw new Error('Private assets must not be served'); },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Location'), null);
  }
});

test('authenticated admin assets preserve body, status and content type', async () => {
  for (const [body, type, status] of [
    ['<!doctype html><h1>Panel</h1>', 'text/html; charset=utf-8', 200],
    ['body { color: navy; }', 'text/css', 200],
    ['Not found', 'text/plain', 404],
  ]) {
    const upstream = new Response(body, { status, headers: { 'Content-Type': type } });
    const response = secureResponse(upstream);
    assert.equal(await response.text(), body);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Content-Type'), type);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  }
});
