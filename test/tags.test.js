'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

// Stand-in for e2e-pr-app's GET /api/items, so /api/overview has items to count.
async function withItemsStub(items, fn) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(items));
  }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/items`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withServer(fn, itemsUrl = 'http://127.0.0.1:9/api/items') {
  const server = createApp({ itemsUrl }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postTag(base, body) {
  const res = await fetch(`${base}/api/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function listTags(base) {
  const res = await fetch(`${base}/api/tags`);
  assert.equal(res.status, 200);
  return res.json();
}

test('POST /api/tags with a 51-character name returns 400 "name is too long" and stores nothing', async () => {
  await withServer(async (base) => {
    await postTag(base, { name: 'existing' });
    const before = await listTags(base);
    const res = await postTag(base, { name: 'a'.repeat(51) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'name is too long' });
    assert.deepEqual(await listTags(base), before);
  });
});

test('POST /api/tags with a 50-character name returns 201 and lists the tag', async () => {
  await withServer(async (base) => {
    const name = 'b'.repeat(50);
    const res = await postTag(base, { name });
    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.deepEqual(res.body, { id: res.body.id, name });
    assert.deepEqual(await listTags(base), [{ id: res.body.id, name }]);
  });
});

test('POST /api/tags with a 500-character name returns 400 "name is too long" and stores nothing', async () => {
  await withServer(async (base) => {
    await postTag(base, { name: 'existing' });
    const before = await listTags(base);
    const res = await postTag(base, { name: 'x'.repeat(500) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'name is too long' });
    assert.deepEqual(await listTags(base), before);
  });
});

test('POST /api/tags applies the limit to the trimmed name: 50 characters with surrounding spaces is accepted', async () => {
  await withServer(async (base) => {
    const name = 'c'.repeat(50);
    const res = await postTag(base, { name: `  ${name}  ` });
    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.deepEqual(res.body, { id: res.body.id, name });
    assert.deepEqual(await listTags(base), [{ id: res.body.id, name }]);
  });
});

test('GET /api/overview keeps the same tag count after a 51-character name is rejected', async () => {
  await withItemsStub([{ id: 1, name: 'Milk' }], async (itemsUrl) => {
    await withServer(async (base) => {
      await postTag(base, { name: 'existing' });
      const before = await (await fetch(`${base}/api/overview`)).json();
      assert.deepEqual(before, { tags: 1, items: 1 });

      const res = await postTag(base, { name: 'a'.repeat(51) });
      assert.equal(res.status, 400);

      const overviewRes = await fetch(`${base}/api/overview`);
      assert.equal(overviewRes.status, 200);
      const after = await overviewRes.json();
      assert.deepEqual(after, { tags: 1, items: 1 });
      assert.equal(after.tags, (await listTags(base)).length);
    }, itemsUrl);
  });
});

test('POST /api/tags with an ordinary short name returns 201 and lists the tag', async () => {
  await withServer(async (base) => {
    const res = await postTag(base, { name: 'urgent' });
    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, 'number');
    assert.deepEqual(res.body, { id: res.body.id, name: 'urgent' });
    assert.deepEqual(await listTags(base), [{ id: res.body.id, name: 'urgent' }]);
  });
});
