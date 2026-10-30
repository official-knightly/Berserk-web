# Berserk Web — Engine Lab

A chessboard.js website for playing against the Berserk chess engine in the browser. The engine runs locally in a Web Worker through WebAssembly; no remote engine API or API key is required.

## Run locally

The website requires HTTP or HTTPS because browsers restrict Web Workers and WebAssembly when opening an HTML file directly.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The browser worker in `engine-worker.js` imports `./engine/berserk.js`, initializes the generated WebAssembly module, and exposes the Berserk engine to the existing game UI.

## WebAssembly files

- `engine/berserk_bg.wasm` — the actual Berserk WebAssembly binary, stored with Git LFS
- `engine/README.md` — binary and generation notes
- The deployment workflow runs `wasm-bindgen` 0.2.129 with `--target web` and generates `berserk.js`, TypeScript declarations, and the matching WASM output into `dist/engine/`
- The generated loader and WASM are deployed together, so the worker's relative import resolves correctly

The deployment workflow checks out Git LFS objects, verifies the expected binary size and WebAssembly v1 header, and fails clearly if the real LFS object is missing or invalid.

## Project files

- `index.html` — page layout
- `style.css` — styling
- `app.js` — chessboard and game UI
- `engine.js` — Web Worker-backed engine adapter
- `engine-worker.js` — WASM engine worker
- `engine/` — Berserk WebAssembly engine binary and integration notes
