'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Socket } = require('node:net');
const { createApp } = require('../src/app');

// Hands one request straight to the Express app, without opening a port.
function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(new Socket());
    req.method = method;
    req.url = url;
    req.headers = {};
    if (body !== undefined) {
      const payload = Buffer.from(JSON.stringify(body));
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(payload.length);
      req.push(payload);
    }
    req.push(null);

    const res = new ServerResponse(req);
    res.end = (chunk) => {
      const text = chunk === undefined ? '' : chunk.toString();
      resolve({ status: res.statusCode, json: async () => JSON.parse(text) });
      return res;
    };
    app(req, res, reject);
  });
}

// The tag endpoints never call the items service, so it gets no real address.
async function withApp(fn) {
  await fn(createApp({ itemsUrl: 'items-service-not-called' }));
}

function postTag(app, name) {
  return request(app, 'POST', '/api/tags', { name });
}

async function listTags(app) {
  const res = await request(app, 'GET', '/api/tags');
  assert.equal(res.status, 200);
  return res.json();
}

test('POST /api/tags rejects names over 50 characters and stores nothing', async () => {
  await withApp(async (app) => {
    assert.deepEqual(await listTags(app), []);

    for (const name of ['a'.repeat(51), 'a'.repeat(1000)]) {
      const res = await postTag(app, name);
      assert.equal(res.status, 400, `length ${name.length}`);
      assert.equal((await res.json()).error, 'name is too long');
    }

    assert.deepEqual(await listTags(app), []);

    const ok = await postTag(app, 'ok');
    assert.equal(ok.status, 201);
    assert.deepEqual(await ok.json(), { id: 1, name: 'ok' });
  });
});

test('POST /api/tags accepts names of 50 and 49 characters', async () => {
  await withApp(async (app) => {
    const fifty = await postTag(app, 'b'.repeat(50));
    assert.equal(fifty.status, 201);
    assert.deepEqual(await fifty.json(), { id: 1, name: 'b'.repeat(50) });

    const fortyNine = await postTag(app, 'c'.repeat(49));
    assert.equal(fortyNine.status, 201);
    assert.deepEqual(await fortyNine.json(), { id: 2, name: 'c'.repeat(49) });

    assert.deepEqual(await listTags(app), [
      { id: 1, name: 'b'.repeat(50) },
      { id: 2, name: 'c'.repeat(49) },
    ]);
  });
});

test('POST /api/tags measures the name length after trimming whitespace', async () => {
  await withApp(async (app) => {
    const padded50 = await postTag(app, '   ' + 'd'.repeat(50) + '  ');
    assert.equal(padded50.status, 201);
    assert.deepEqual(await padded50.json(), { id: 1, name: 'd'.repeat(50) });

    const padded51 = await postTag(app, '  ' + 'e'.repeat(51) + ' ');
    assert.equal(padded51.status, 400);
    assert.equal((await padded51.json()).error, 'name is too long');

    assert.deepEqual(await listTags(app), [{ id: 1, name: 'd'.repeat(50) }]);
  });
});
