# Berserk Web — Engine API

This API lives entirely in the **Berserk-web** repository. It runs the native Berserk engine from the existing `berserk engine/` source directory using UCI. It does not depend on the separate `Berserk-api` repository.

## Endpoints

- `GET /health`
- `POST /v1/bestmove`
- `POST /v1/analyse`

Example JSON request:

```json
{
  "fen": "startpos",
  "moves": ["e2e4", "e7e5"],
  "movetime": 1000
}
```

Moves are UCI strings. `movetime` is milliseconds; the engine API caps it using `MAX_MOVETIME` (default 5000 ms). The native engine process is serialized so concurrent requests cannot interleave UCI commands.

## Cloudflare deployment

The Worker in `api/worker.mjs` is an HTTP adapter; the actual chess search runs in the native engine inside the container built from `api/Dockerfile`. It does not return fake moves.

### Requirements

- Cloudflare Workers **Paid** plan with Cloudflare Containers access enabled.
- Node.js 20+ and npm.
- Docker or a compatible container runtime for local testing.

### Deploy

From the repository root:

```sh
npm install
npm run deploy
```

The first container deployment can take several minutes. After deployment, test the URL shown by Wrangler:

```sh
curl https://berserk-engine-api.<your-workers-subdomain>.workers.dev/health
curl -X POST https://berserk-engine-api.<your-workers-subdomain>.workers.dev/v1/bestmove \
  -H 'content-type: application/json' \
  -d '{"fen":"startpos","moves":[],"movetime":1000}'
```

### Local Docker test

From the repository root:

```sh
docker build -f api/Dockerfile -t berserk-web-api .
docker run --rm -p 8787:8787 berserk-web-api
```

Then test `http://localhost:8787/health`.

## Important

A static GitHub Pages site cannot run a native executable. The website's existing WebAssembly engine and this public HTTPS API are separate integrations: the website can use its in-browser engine, while other developers call the API. Do not publish this API as production-ready until the native build succeeds and both health and best-move requests have been tested. Set allowed website origins and add rate limiting/authentication before exposing it to untrusted public traffic.
