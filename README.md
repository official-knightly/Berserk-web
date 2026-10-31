# Berserk Web — Engine Lab

A chessboard.js website for playing against the Berserk chess engine in the browser. The engine runs locally in a Web Worker through WebAssembly; no remote engine API or API key is required.

## Run locally

The website requires HTTP or HTTPS because browsers restrict Web Workers and WebAssembly when opening an HTML file directly.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The checked-in WebAssembly bundle is loaded from `engine/`, so no Rust toolchain or API key is required to play locally.

## Browser engine files

- `index.html` — page layout
- `style.css` — styling
- `engine/app.js` — chessboard and game UI
- `engine/engine.js` — promise-based Web Worker adapter used by this site
- `engine/engine-worker.js` — structured-message WASM worker used by this site
- `engine/uci-worker.js` — UCI-compatible module worker for browser integrations
- `engine/berserk.js` and `engine/berserk_bg.wasm` — matching wasm-bindgen loader and WASM binary

The WASM file is tracked with Git LFS. Do not replace it with the 133-byte LFS pointer text or a WASM binary generated for a different wasm-bindgen interface.

## Integrate Berserk into a browser extension

The UCI worker accepts standard UCI strings through `postMessage` and replies with UCI strings. It supports:

- `uci`, `isready`, `ucinewgame`
- `position startpos [moves ...]`
- `position fen <six-field-FEN> [moves ...]`
- `setoption name MultiPV value N` (1–8)
- `go movetime N`, `go depth N`, and `go nodes N`

Example from an extension page or another module-capable browser context:

```js
const worker = new Worker(
  chrome.runtime.getURL("engine/uci-worker.js"),
  { type: "module" }
);

worker.onmessage = ({ data }) => {
  // UCI info lines contain depth, multipv rank, score and pv.
  // The first move after "pv" is the candidate arrow's from/to squares.
  console.log(data);
};

worker.postMessage("uci");
worker.postMessage("isready");
worker.postMessage("setoption name MultiPV value 3");
worker.postMessage("position startpos");
worker.postMessage("go movetime 1000");
```

For arrow display, the host extension must read each `info ... multipv N ... pv <uci-moves>` line and draw an arrow from the first UCI move (for example, `e2e4` means e2 → e4). Berserk supplies the analysis lines; the extension's board UI is responsible for rendering them. The worker is an ES module worker, so the host extension must load it with `{ type: "module" }` and make the engine assets available to that worker.

The WASM search currently runs synchronously inside its worker and completes according to the requested time/depth limit; `stop` cannot interrupt a search already in progress. Keep requested search limits bounded.

## Build and deployment

GitHub Actions checks out Git LFS, validates the WASM magic header and binary size, syntax-checks both browser workers, then publishes the complete `engine/` directory to GitHub Pages.
