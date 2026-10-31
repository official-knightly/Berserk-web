# Berserk Web — Engine Lab

A chessboard.js website for playing against the Berserk chess engine in the browser. The engine runs locally in a Web Worker through WebAssembly; no remote engine API or API key is required.

## Run locally

The website requires HTTP or HTTPS because browsers restrict Web Workers and WebAssembly when opening an HTML file directly.

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
