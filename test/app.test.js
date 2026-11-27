'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { createApp } = require('../src/app');

// Sends one request straight into the Express app, without opening a port.
function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new net.Socket());
    req.method = method;
    req.url = url;
    req.headers = {};
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload) {
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(payload.length);
      req.push(payload);
    }
    req.push(null);

    const res = new http.ServerResponse(req);
    res.end = (chunk) => {
      const text = chunk === undefined ? '' : chunk.toString();
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : undefined });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function newApp() {
  // The items service is only reached by /api/overview, which these tests do not call.
  return createApp({ itemsUrl: 'http://127.0.0.1:1/unused' });
}

function postTag(app, body) {
  return request(app, 'POST', '/api/tags', body);
}

async function listTags(app) {
  const res = await request(app, 'GET', '/api/tags');
  assert.equal(res.status, 200);
  return res.body;
}

test('POST /api/tags refuses a name over 50 characters', async () => {
  const app = newApp();
  for (const name of ['a'.repeat(51), 'a'.repeat(10000)]) {
    const res = await postTag(app, { name });
    assert.equal(res.status, 400, `length ${name.length}`);
    assert.deepEqual(res.body, { error: 'name is too long' });
  }
  assert.deepEqual(await listTags(app), []);
});

test('POST /api/tags accepts a name of exactly 50 characters', async () => {
  const app = newApp();
  const name = 'a'.repeat(50);
  const res = await postTag(app, { name });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { id: 1, name });
  assert.deepEqual(await listTags(app), [{ id: 1, name }]);
});

test('POST /api/tags measures the limit on the trimmed name', async () => {
  const app = newApp();
  const ok = await postTag(app, { name: '  ' + 'b'.repeat(50) + '  ' });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body, { id: 1, name: 'b'.repeat(50) });

  const tooLong = await postTag(app, { name: '  ' + 'b'.repeat(51) + '  ' });
  assert.equal(tooLong.status, 400);
  assert.deepEqual(tooLong.body, { error: 'name is too long' });

  assert.deepEqual(await listTags(app), [{ id: 1, name: 'b'.repeat(50) }]);
});

test('POST /api/tags with a name over 50 characters stores nothing', async () => {
  const app = newApp();
  assert.equal((await postTag(app, { name: 'keep' })).status, 201);
  const before = await listTags(app);

  const res = await postTag(app, { name: 'a'.repeat(51) });
  assert.equal(res.status, 400);

  const after = await listTags(app);
  assert.deepEqual(after, before);
  assert.deepEqual(after, [{ id: 1, name: 'keep' }]);

  // The refused request did not use up an id either.
  const next = await postTag(app, { name: 'next' });
  assert.deepEqual(next.body, { id: 2, name: 'next' });
});

test('POST /api/tags creates a short tag with the trimmed name and lists it', async () => {
  const app = newApp();
  const res = await postTag(app, { name: '  urgent ' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { id: 1, name: 'urgent' });
  assert.deepEqual(await listTags(app), [{ id: 1, name: 'urgent' }]);
});
