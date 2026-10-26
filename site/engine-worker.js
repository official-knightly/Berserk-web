import init, { Engine } from "./engine/berserk.js";

let engineInstance = null;
let initialization = null;

async function ensureEngine() {
  if (!initialization) {
    initialization = (async function () {
      await init();
      engineInstance = new Engine();
      engineInstance.set_threads(1);
      return engineInstance;
    })();
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
      await ensureEngine();
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
    const engine = await ensureEngine();
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