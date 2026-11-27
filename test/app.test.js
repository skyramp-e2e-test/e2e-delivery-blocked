'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { createApp } = require('../src/app');

// Dispatches one request straight into the Express app (no socket, no port)
// and resolves with the status and parsed JSON body it answers with.
function inject(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(null);
    req.method = method;
    req.url = url;
    const payload = body === undefined ? '' : JSON.stringify(body);
    req.headers = payload
      ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }
      : {};
    if (payload) req.push(payload);
    req.push(null);

    const res = new ServerResponse(req);
    const chunks = [];
    res.write = (chunk, encoding) => {
      chunks.push(Buffer.from(chunk, encoding));
      return true;
    };
    res.end = (chunk, encoding) => {
      if (chunk) chunks.push(Buffer.from(chunk, encoding));
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : undefined });
      return res;
    };
    app(req, res, reject);
  });
}

function newApp() {
  return createApp({ itemsUrl: 'http://items.invalid/unused' });
}

function postTag(app, name) {
  return inject(app, 'POST', '/api/tags', { name });
}

async function listTags(app) {
  const res = await inject(app, 'GET', '/api/tags');
  assert.equal(res.status, 200);
  return res.body;
}

test('POST /api/tags rejects a 51-character name with 400 and stores nothing', async () => {
  const app = newApp();
  const before = await listTags(app);
  const res = await postTag(app, 'a'.repeat(51));
  assert.equal(res.status, 400);
  const body = res.body;
  assert.equal(typeof body.error, 'string');
  assert.match(body.error, /too long/i);
  assert.deepEqual(await listTags(app), before);
});

test('POST /api/tags accepts a name of exactly 50 characters', async () => {
  const app = newApp();
  const res = await postTag(app, 'b'.repeat(50));
  assert.equal(res.status, 201);
  const body = res.body;
  assert.equal(body.name, 'b'.repeat(50));
  const tags = await listTags(app);
  assert.deepEqual(tags.filter((t) => t.name === 'b'.repeat(50)), [{ id: body.id, name: 'b'.repeat(50) }]);
});

test('POST /api/tags applies the 50-character limit to the trimmed name', async () => {
  const app = newApp();
  const accepted = await postTag(app, '  ' + 'c'.repeat(50) + '  ');
  assert.equal(accepted.status, 201);
  const created = accepted.body;
  assert.equal(created.name, 'c'.repeat(50));

  const rejected = await postTag(app, ' ' + 'd'.repeat(51) + ' ');
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /too long/i);

  const tags = await listTags(app);
  assert.deepEqual(tags, [{ id: created.id, name: 'c'.repeat(50) }]);
  assert.equal(tags.some((t) => t.name.includes('d')), false);
});

test('POST /api/tags rejects a 1000-character name and later creates still work', async () => {
  const app = newApp();
  const before = await listTags(app);
  const rejected = await postTag(app, 'x'.repeat(1000));
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /too long/i);

  const accepted = await postTag(app, 'ok');
  assert.equal(accepted.status, 201);
  const created = accepted.body;
  assert.equal(created.name, 'ok');

  const after = await listTags(app);
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after.slice(before.length), [{ id: created.id, name: 'ok' }]);
});
