import init, { Engine } from "./berserk.js";

let engineInstance = null;
let initialization = null;

// If the site is served from a place that does not resolve Git LFS (for example
// GitHub Pages deployed straight from a branch), the local .wasm is only a
// ~133-byte pointer file. GitHub's LFS media endpoint serves the real binary
// with CORS enabled, so use it as a fallback.
const FALLBACK_WASM_URL =
  "https://media.githubusercontent.com/media/official-knightly/Berserk-web/main/engine/berserk_bg.wasm";
const MIN_WASM_BYTES = 1024 * 1024;

function looksLikeWasm(bytes) {
  return bytes.byteLength >= MIN_WASM_BYTES &&
    bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

async function downloadBytes(url, cacheMode) {
  const response = await fetch(url, { cache: cacheMode });
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " " + response.statusText);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !response.body.getReader) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = response.body.getReader();
  let buffer = total ? new Uint8Array(total) : null;
  const chunks = [];
  let loaded = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (buffer && loaded + value.byteLength <= buffer.byteLength) {
      buffer.set(value, loaded);
    } else {
      // Unknown or wrong content-length (e.g. transparent compression).
      if (buffer) { chunks.push(buffer.subarray(0, loaded)); buffer = null; }
      chunks.push(value);
    }
    loaded += value.byteLength;
    const now = Date.now();
    if (now - lastReport > 150) {
      lastReport = now;
      self.postMessage({ type: "progress", loaded: loaded, total: total });
    }
  }
  self.postMessage({ type: "progress", loaded: loaded, total: total });
  if (buffer) return loaded === buffer.byteLength ? buffer : buffer.subarray(0, loaded);
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

async function loadWasmBytes(wasmUrl) {
  const urls = [];
  if (wasmUrl) urls.push(wasmUrl);
  if (urls.indexOf(FALLBACK_WASM_URL) === -1) urls.push(FALLBACK_WASM_URL);

  const problems = [];
  for (const url of urls) {
    // "default" lets the browser reuse a good cached copy. If what we got is not
    // a real WASM binary (e.g. a cached LFS pointer), retry once bypassing cache.
    for (const mode of ["default", "reload"]) {
      try {
        const bytes = await downloadBytes(url, mode);
        if (looksLikeWasm(bytes)) return bytes;
        problems.push(url + " returned " + bytes.byteLength + " bytes that are not a WebAssembly binary" +
          (bytes.byteLength < 1024 ? " (likely a Git LFS pointer)" : ""));
      } catch (error) {
        problems.push(url + ": " + (error && error.message ? error.message : String(error)));
        break; // network/HTTP failure: bypassing cache will not help
      }
    }
  }
  throw new Error("Could not load the Berserk WASM. " + problems.join(" | "));
}

async function ensureEngine(wasmUrl) {
  if (!initialization) {
    initialization = (async function () {
      const bytes = await loadWasmBytes(wasmUrl);
      await init({ module_or_path: bytes });
      engineInstance = new Engine();
      engineInstance.set_threads(1);
      return engineInstance;
    })();
    // Allow a later retry instead of caching a failed initialization forever.
    initialization.catch(function () { initialization = null; });
  }
  return initialization;
}

function parseCandidates(lines) {
  let highestDepth = -1;
  const byRank = new Map();
  const pattern = /^info depth (\d+).*?\bmultipv (\d+).*?\bscore (cp|mate) (-?\d+).*?\bpv\s+(.+)$/;

  for (const line of lines) {
    const match = String(line).match(pattern);
    if (!match) continue;
    const depth = Number(match[1]);
    const rank = Number(match[2]);
    const type = match[3];
    const rawScore = Number(match[4]);
    const pv = match[5].trim().split(/\s+/);
    if (!pv.length || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(pv[0])) continue;

    if (depth > highestDepth) {
      highestDepth = depth;
      byRank.clear();
    }
    if (depth !== highestDepth) continue;
    byRank.set(rank, {
      rank: rank,
      depth: depth,
      uci: pv[0],
      pv: pv,
      scoreCp: type === "mate" ? (rawScore > 0 ? 30000 : -30000) : rawScore,
      mate: type === "mate" ? rawScore : null
    });
  }

  return Array.from(byRank.values()).sort(function (a, b) { return a.rank - b.rank; });
}

self.addEventListener("message", async function (event) {
  const message = event.data || {};
  if (message.type === "init") {
    try {
      await ensureEngine(message.wasmUrl);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "init-error",
        error: error && error.message ? error.message : String(error)
      });
    }
    return;
  }

  if (message.type !== "search") return;
  try {
    const engine = await ensureEngine(message.wasmUrl);
    // Drain Rust's buffered UCI output so it cannot grow across repeated moves.
    engine.take_output();
    engine.set_position(message.fen);
    const infoLines = [];
    engine.go_movetime(message.milliseconds, message.multiPV, function (line) {
      const value = String(line);
      if (value.indexOf("info ") === 0) {
        infoLines.push(value);
        self.postMessage({
          type: "info",
          id: message.id,
          context: message.context,
          line: value
        });
      }
    });

    engine.take_output();
    self.postMessage({
      type: "result",
      id: message.id,
      context: message.context,
      bestmove: engine.last_bestmove(),
      scoreCp: engine.last_score(),
      depth: engine.last_depth(),
      nodes: String(engine.last_nodes()),
      candidates: parseCandidates(infoLines)
    });
  } catch (error) {
    self.postMessage({
      type: "search-error",
      id: message.id,
      context: message.context,
      error: error && error.message ? error.message : String(error)
    });
  }
});
