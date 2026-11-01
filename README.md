# Berserk Web — Engine Lab

A chessboard.js website for playing against the Berserk chess engine in the browser. The engine runs locally in a Web Worker through WebAssembly; no remote engine API or API key is required.

## Run locally

The website requires HTTP or HTTPS because browsers restrict Web Workers and WebAssembly when opening an HTML file directly.

\`\`\`bash
python -m http.server 8000
\`\`\`

Open \`http://localhost:8000\`. The checked-in WebAssembly bundle is loaded from \`engine/\`, so no Rust toolchain or API key is required to play locally.

## Browser engine files

- \`index.html\` — page layout
- \`style.css\` — styling
- \`engine/app.js\` — chessboard and game UI
- \`engine/engine.js\` — promise-based Web Worker adapter used by this site
- \`engine/engine-worker.js\` — structured-message WASM worker
- \`engine/uci-worker.js\` — UCI-compatible module worker for browser integrations
- \`engine/berserk.js\` and \`engine/berserk_bg.wasm\` — matching wasm-bindgen loader and WASM binary
- \`engine.ts\` — standalone TypeScript adapter for other web apps that want to use the hosted Berserk engine without copying the WASM bundle into their own repository

The WASM file is tracked with Git LFS. A normal Git checkout may show the small LFS pointer instead of the actual binary. The adapter and worker use GitHub's LFS media endpoint to download the real WASM file.

## Use Berserk in another web app (no local engine folder required)

Copy the root-level \`engine.ts\` file into your TypeScript web project. You do **not** need to copy the 64.5 MB WASM file, \`berserk.js\`, or an \`engine/\` directory into the consuming project.

The adapter loads the official worker from this repository through a same-origin Blob worker bootstrap. The official worker then imports its matching \`berserk.js\` loader and downloads the WASM binary from the GitHub LFS media URL.

Example:

\`\`\`ts
import { engine } from "./engine";

const unsubscribe = engine.subscribe(({ status, progress, error }) => {
  console.log("Berserk:", status, Math.round(progress * 100) + "%", error ?? "");
});

// Six-field FEN. This is the normal starting chess position.
const startFen =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

try {
  const result = await engine.search(startFen, 1000, 3);

  console.log("Best move:", result.bestmove);
  console.log("Depth:", result.depth);
  console.log("Candidates:", result.candidates);
} catch (error) {
  console.error("Berserk failed:", error);
}

// Call this when the page/component no longer needs the engine.
unsubscribe();
engine.terminate();
\`\`\`

### Integration notes

- \`engine.search(fen, milliseconds, multiPV)\` starts the engine automatically if it has not started yet.
- Search time is clamped to 100–10,000 ms and MultiPV is clamped to 1–8.
- The first load requires an internet connection to fetch the official worker, JavaScript loader, and WASM binary. The browser may cache these resources.
- Serve the app over HTTPS (or localhost). The app's Content Security Policy must permit a \`blob:\` worker and requests/imports from \`raw.githubusercontent.com\` and \`media.githubusercontent.com\` as applicable to its \`worker-src\`, \`script-src\`, and \`connect-src\` rules.
- Browser extensions can have stricter remote-code policies. For an extension, package the worker and loader with the extension if its policy does not permit remotely imported worker modules.

**Important repository distinction:** the consuming app does not need an \`engine/\` folder, but the \`engine/\` directory in this Berserk-web repository must remain. The hosted worker imports \`engine/berserk.js\`, and that loader needs to stay alongside the published WASM asset. Do not delete or move those canonical files.

## Integrate Berserk as a UCI worker

For integrations that need a UCI message interface, use \`engine/uci-worker.js\`. It accepts standard UCI strings through \`postMessage\` and replies with UCI strings. It supports:

- \`uci\`, \`isready\`, \`ucinewgame\`
- \`position startpos [moves ...]\`
- \`position fen <six-field-FEN> [moves ...]\`
- \`setoption name MultiPV value N\` (1–8)
- \`go movetime N\`, \`go depth N\`, and \`go nodes N\`

Example from an extension page or another module-capable browser context where the worker assets are packaged or served locally:

\`\`\`js
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
\`\`\`

For arrow display, the host extension must read each \`info ... multipv N ... pv <uci-moves>\` line and draw an arrow from the first UCI move (for example, \`e2e4\` means e2 → e4). Berserk supplies the analysis lines; the extension's board UI is responsible for rendering them. The worker is an ES module worker, so the host extension must load it with \`{ type: "module" }\` and make the engine assets available to that worker.

The WASM search currently runs synchronously inside its worker and completes according to the requested time/depth limit; \`stop\` cannot interrupt a search already in progress. Keep requested search limits bounded.

## Board tools and move review

- Right-click and drag on the board to draw an arrow; press Escape or use Clear arrows to remove annotations.
- While Berserk is thinking, drag one of your pieces to queue a premove. The premove is played automatically if it is still legal after the engine move.
- The Move quality panel grades both sides' moves using Berserk's evaluations before and after each move. It shows the evaluation change and approximate centipawn loss; short analysis times can make the grade fluctuate.

## Cloudflare website endpoint

The \`berserk-web\` Cloudflare Worker proxies the GitHub Pages website (it does not run the engine server). Open:

\`https://berserk-web.akatsuki-x-pain12.workers.dev/\`

The engine still runs locally in the browser through WebAssembly, so the site does not need a Cloudflare Container for chess play. The separate container-backed native API remains unavailable on the account's current Workers plan.

## Build and deployment

GitHub Actions checks out Git LFS, validates the WASM magic header and binary size, syntax-checks both browser workers, then publishes the complete \`engine/\` directory to GitHub Pages.
