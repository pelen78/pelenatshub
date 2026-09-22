import test from 'node:test';
import assert from 'node:assert/strict';
import { secureResponse } from '../functions/admin/_middleware.js';

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
