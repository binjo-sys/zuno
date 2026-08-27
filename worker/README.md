# ZUNO API

Cloudflare Worker backend for ZUNO messaging.

## Endpoints

- `GET /health` — API health check
- `GET /api/users?q=` — user search
- `GET /api/messages?room=` — recent room history
- `POST /api/messages` — persist and broadcast a message
- `GET /api/ws?room=` — hibernatable WebSocket connection

## Cloudflare setup

Create a D1 database named `zuno-db`, then put its real ID in `worker/wrangler.toml` in place of the placeholder. Apply `worker/schema.sql` with Wrangler and deploy the Worker.

Do not put API keys or database credentials in Git. Use Cloudflare secrets for sensitive values.
