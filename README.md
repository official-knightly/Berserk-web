# Berserk Web — Engine Lab

A chessboard.js website for playing against the bundled Berserk chess engine.

## Run locally

The site runs the Rust engine in a Web Worker through WebAssembly. No API key or remote engine service is
required. Serve this directory over HTTP (opening `index.html` directly will block workers and WebAssembly):

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. GitHub Pages builds the Rust source in `berserk engine/` and publishes the
generated WASM files automatically.

## Project files

- `index.html` — page layout
- `style.css` — styling
- `app.js` — chessboard and game UI
- `engine.js` — Web Worker-backed engine adapter
- `engine-worker.js` — WASM engine worker
- `berserk engine/` — Berserk Rust source
