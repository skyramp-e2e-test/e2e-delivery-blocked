'use strict';

const express = require('express');

function createApp({ itemsUrl }) {
  const app = express();
  const tags = [];
  let nextId = 1;

  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/tags', (_req, res) => res.json(tags));

  app.get('/api/tags/:id', (req, res) => {
    const tag = tags.find((t) => t.id === Number(req.params.id));
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    res.json(tag);
  });

  app.post('/api/tags', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name is required' });
    const tag = { id: nextId++, name };
    tags.push(tag);
    res.status(201).json(tag);
  });

  // Reads e2e-pr-app's items.
  app.get('/api/overview', async (_req, res) => {
    try {
      const response = await fetch(itemsUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = await response.json();
      res.json({ tags: tags.length, items: items.length });
    } catch (err) {
      console.error('Items service failed:', err.message);
      res.status(502).json({ error: 'items service unavailable' });
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

module.exports = { createApp };
