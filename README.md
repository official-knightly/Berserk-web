# Berserk Web — Engine Lab

A chessboard.js website for playing against the bundled Berserk chess engine.

## Run locally

The site runs the Rust engine in a Web Worker through WebAssembly. No API key or remote engine service is
required. Serve this directory over HTTP (opening `index.html` directly will block workers and WebAssembly):

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The checked-in WebAssembly bundle is loaded from `engine/`, so no Rust
toolchain or API key is required to play locally.

## Project files

- `index.html` — page layout
- `style.css` — styling
- `engine/app.js` — chessboard and game UI
- `engine/engine.js` — Web Worker-backed engine adapter
- `engine/engine-worker.js` — WASM engine worker
- `engine/berserk_bg.wasm` — bundled Berserk engine binary (tracked with Git LFS)
