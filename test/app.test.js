'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');
const { createApp } = require('../src/app');

// Sends one request through the Express app in this process (no socket, no
// network) and resolves with { status, json() } once the app ends the response.
function dispatch(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = Readable.from(payload ? [payload] : []);
    req.method = method;
    req.url = url;
    req.headers = payload
      ? { 'content-type': 'application/json', 'content-length': String(payload.length) }
      : {};
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.connection = req.socket = { remoteAddress: '127.0.0.1', encrypted: false };

    const res = new http.ServerResponse(req);
    const chunks = [];
    res.write = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = (chunk) => {
      if (chunk && typeof chunk !== 'function') chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, json: async () => JSON.parse(text) });
      return res;
    };

    app.handle(req, res, reject);
  });
}

// Each call gets a fresh app, so the in-memory tag list and id counter start empty.
async function withServer(fn) {
  await fn(createApp({ itemsUrl: 'http://items.invalid/unused' }));
}

function postTag(app, name) {
  return dispatch(app, 'POST', '/api/tags', { name });
}

async function listTags(app) {
  const res = await dispatch(app, 'GET', '/api/tags');
  assert.equal(res.status, 200);
  return res.json();
}

test('POST /api/tags rejects names over 50 characters and stores nothing', async () => {
  await withServer(async (base) => {
    assert.deepEqual(await listTags(base), []);

    const tooLong = [
      'a'.repeat(51),
      'a'.repeat(10000),
      'a'.repeat(25) + ' '.repeat(10) + 'a'.repeat(25),
    ];
    for (const name of tooLong) {
      const res = await postTag(base, name);
      assert.equal(res.status, 400, `name of length ${name.length}`);
      assert.match((await res.json()).error, /too long/i);
      assert.deepEqual(await listTags(base), []);
    }

    const ok = await postTag(base, 'ok');
    assert.equal(ok.status, 201);
    assert.deepEqual(await ok.json(), { id: 1, name: 'ok' });
    assert.deepEqual(await listTags(base), [{ id: 1, name: 'ok' }]);
  });
});

test('POST /api/tags accepts names of exactly 50 and of 49 characters', async () => {
  await withServer(async (base) => {
    const fifty = 'a'.repeat(50);
    const res50 = await postTag(base, fifty);
    assert.equal(res50.status, 201);
    assert.deepEqual(await res50.json(), { id: 1, name: fifty });

    const fortyNine = 'b'.repeat(49);
    const res49 = await postTag(base, fortyNine);
    assert.equal(res49.status, 201);
    assert.deepEqual(await res49.json(), { id: 2, name: fortyNine });

    assert.deepEqual(await listTags(base), [
      { id: 1, name: fifty },
      { id: 2, name: fortyNine },
    ]);
  });
});

test('POST /api/tags counts the length of the trimmed name', async () => {
  await withServer(async (base) => {
    const fifty = 'a'.repeat(50);
    const padded = await postTag(base, '   ' + fifty + '   ');
    assert.equal(padded.status, 201);
    assert.deepEqual(await padded.json(), { id: 1, name: fifty });

    const over = await postTag(base, ' ' + 'a'.repeat(51) + ' ');
    assert.equal(over.status, 400);
    assert.match((await over.json()).error, /too long/i);
    assert.deepEqual(await listTags(base), [{ id: 1, name: fifty }]);
  });
});
