'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { ServerResponse } = require('node:http');
const { createApp } = require('../src/app');

// Drives the Express app in this process: no socket is opened and no request
// leaves the process. The tag routes never call the items service.
function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = url;
    req.headers = payload
      ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }
      : {};
    const res = new ServerResponse(req);
    const chunks = [];
    res.write = (chunk) => {
      chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, json: async () => JSON.parse(text) });
      return res;
    };
    app.handle(req, res, reject);
  });
}

async function withApp(fn) {
  await fn(createApp({ itemsUrl: 'http://items.invalid/api/items' }));
}

function postTag(app, body) {
  return request(app, 'POST', '/api/tags', body);
}

async function listTags(app) {
  const res = await request(app, 'GET', '/api/tags');
  assert.equal(res.status, 200);
  return res.json();
}

test('POST /api/tags rejects a 51-character name and stores nothing', async () => {
  await withApp(async (app) => {
    await postTag(app, { name: 'seed' });
    const before = await listTags(app);
    const name = 'a'.repeat(51);
    const res = await postTag(app, { name });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'name is too long' });
    const after = await listTags(app);
    assert.deepEqual(after, before);
    assert.equal(after.some((t) => t.name === name), false);
  });
});

test('POST /api/tags accepts a name of exactly 50 characters', async () => {
  await withApp(async (app) => {
    const name = 'b'.repeat(50);
    const res = await postTag(app, { name });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.deepEqual(created, { id: 1, name });
    assert.deepEqual(await listTags(app), [{ id: 1, name }]);
  });
});

test('POST /api/tags measures length after trimming surrounding whitespace', async () => {
  await withApp(async (app) => {
    const res = await postTag(app, { name: '  ' + 'c'.repeat(50) + '  ' });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: 1, name: 'c'.repeat(50) });
    assert.deepEqual(await listTags(app), [{ id: 1, name: 'c'.repeat(50) }]);
  });
});

test('POST /api/tags rejects a 1000-character name and stores nothing', async () => {
  await withApp(async (app) => {
    await postTag(app, { name: 'seed' });
    const before = await listTags(app);
    const res = await postTag(app, { name: 'x'.repeat(1000) });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'name is too long' });
    assert.deepEqual(await listTags(app), before);
  });
});

test('POST /api/tags accepts a name of 50 emoji characters', async () => {
  await withApp(async (app) => {
    const name = '😀'.repeat(50);
    const res = await postTag(app, { name });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: 1, name });
    assert.deepEqual(await listTags(app), [{ id: 1, name }]);
  });
});

test('POST /api/tags still stores a short trimmed name with increasing ids', async () => {
  await withApp(async (app) => {
    const first = await postTag(app, { name: '  urgent ' });
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { id: 1, name: 'urgent' });
    const second = await postTag(app, { name: 'later' });
    assert.equal(second.status, 201);
    assert.deepEqual(await second.json(), { id: 2, name: 'later' });
    assert.deepEqual(await listTags(app), [
      { id: 1, name: 'urgent' },
      { id: 2, name: 'later' },
    ]);
  });
});
