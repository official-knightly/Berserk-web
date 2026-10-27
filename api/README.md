# Berserk Web — Engine API

This API service lives in the **Berserk Web** repository, separately from the engine source. It runs the native Berserk executable through UCI. The website can continue using its existing WebAssembly engine; this API is for other websites and developers who need an HTTPS engine endpoint.

## API

- `GET /health`
- `POST /v1/bestmove`
- `POST /v1/analyse`

Example request:

```json
{
  "fen": "startpos",
  "moves": ["e2e4", "e7e5"],
  "movetime": 1000
}
```

`moves` are UCI moves; `movetime` is milliseconds (default 1000, maximum controlled by `MAX_MOVETIME`, default 5000).

## Deploy with Docker

Build from the **Berserk Web repository root**:

```sh
docker build -f api/Dockerfile -t berserk-web-api .
docker run --rm -p 8787:8787 berserk-web-api
```

Then test `http://localhost:8787/health`.

For public deployment, use a Docker-capable host, set `ALLOWED_ORIGINS` to the exact website origin, and add authentication/rate limits before sharing it publicly. A static GitHub Pages deployment cannot run this native API process; it needs a separate container-capable service.
