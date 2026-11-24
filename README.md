# e2e-delivery-blocked

A small Node.js (Express) tag service used as a target for end-to-end testing, next to e2e-pr-app. Owner: agent d.

Used by UC-13.2: the test adds a ruleset that blocks Testbot's `skyramp-testbot/*` branches here, checks that delivery fails for this repository while e2e-pr-app still gets its tests, then removes the ruleset. The repository itself has no ruleset or branch protection.

| Path | Description |
| --- | --- |
| `GET /health` | Health check |
| `GET /api/tags` | JSON list of tags (kept in memory) |
| `GET /api/tags/:id` | One tag, or `404` |
| `POST /api/tags` | Create a tag. Body: `{"name": "..."}`. Returns `201`, or `400` if `name` is missing |
| `GET /api/overview` | Number of tags, and of items in e2e-pr-app. Returns `502` if that app can't be reached |

No credential is needed. `ITEMS_URL` is e2e-pr-app's items address (default `http://localhost:3000/api/items`; with Compose, port 3000 on the host).

## Start the app

Requires Docker with Compose v2.

```bash
docker compose up --build
```

Then open http://localhost:3200/health. To stop: `docker compose down`.
