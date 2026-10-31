import init, { Engine } from "./berserk.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let enginePromise;
let engine;
let multiPV = 3;
let currentFen = START_FEN;
let disposed = false;
let queue = Promise.resolve();

function send(line) {
  if (!disposed) self.postMessage(String(line));
}

async function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      await init();
      engine = new Engine();
      engine.set_threads(1);
      engine.set_position(START_FEN);
      return engine;
    })();
  }
  return enginePromise;
}

function parsePosition(command) {
  const tokens = command.trim().split(/\s+/);
  let fen;
  let moveStart = -1;

  if (tokens[1] === "startpos") {
    fen = START_FEN;
    if (tokens[2] === "moves") moveStart = 3;
  } else if (tokens[1] === "fen") {
    const movesAt = tokens.indexOf("moves", 2);
    const fenEnd = movesAt === -1 ? tokens.length : movesAt;
    fen = tokens.slice(2, fenEnd).join(" ");
    moveStart = movesAt === -1 ? -1 : movesAt + 1;
    if (fen.split(/\s+/).length !== 6) {
      throw new Error("position fen must contain all six FEN fields.");
    }
  } else {
    throw new Error("Unsupported position command. Use 'position startpos' or 'position fen'.");
  }

  engine.set_position(fen);
  currentFen = fen;

  if (moveStart !== -1) {
    for (const move of tokens.slice(moveStart)) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
        throw new Error("Invalid UCI move: " + move);
      }
      engine.make_move(move);
    }
  }
}

function parseGo(command) {
  const tokens = command.trim().split(/\s+/);
  const value = (name) => {
    const index = tokens.indexOf(name);
    return index >= 0 && tokens[index + 1] ? Number(tokens[index + 1]) : 0;
  };
  const movetime = value("movetime");
  const depth = value("depth");
  const nodes = value("nodes");
  return { movetime, depth, nodes };
}

async function runSearch(command) {
  await getEngine();
  const limits = parseGo(command);
  const onInfo = (line) => {
    const value = String(line).trim();
    if (value.startsWith("info ")) send(value);
  };

  try {
    if (limits.movetime > 0) {
      engine.go_movetime(Math.max(100, Math.min(60000, limits.movetime)), multiPV, onInfo);
    } else if (limits.depth > 0 || limits.nodes > 0) {
      engine.go_uci(Math.max(0, limits.depth), Math.max(0, limits.nodes), multiPV, onInfo);
    } else {
      engine.go_movetime(1000, multiPV, onInfo);
    }

    const bestmove = engine.last_bestmove();
    send("bestmove " + (bestmove && bestmove !== "(none)" ? bestmove : "0000"));
    engine.take_output();
  } catch (error) {
    send("info string Berserk search error: " + (error?.message || String(error)));
    send("bestmove 0000");
  }
}

async function handle(command) {
  if (typeof command === "object" && command !== null) {
    command = command.command || command.cmd || "";
  }
  command = String(command || "").trim();
  if (!command) return;

  if (command === "uci") {
    await getEngine();
    send("id name Berserk WASM");
    send("id author Official Knightly");
    send("option name MultiPV type spin default 3 min 1 max 8");
    send("option name Threads type spin default 1 min 1 max 1");
    send("uciok");
    return;
  }

  if (command === "isready") {
    await getEngine();
    send("readyok");
    return;
  }

  if (command === "ucinewgame") {
    await getEngine();
    engine.reset();
    engine.set_position(START_FEN);
    currentFen = START_FEN;
    return;
  }

  if (command.startsWith("setoption ")) {
    const match = command.match(/^setoption\s+name\s+(.+?)\s+value\s+(.+)$/i);
    if (match && match[1].toLowerCase() === "multipv") {
      multiPV = Math.max(1, Math.min(8, Math.floor(Number(match[2]) || 1)));
    }
    return;
  }

  if (command.startsWith("position ")) {
    await getEngine();
    try {
      parsePosition(command);
    } catch (error) {
      send("info string Position error: " + (error?.message || String(error)));
    }
    return;
  }

  if (command.startsWith("go")) {
    await runSearch(command);
    return;
  }

  if (command === "stop") {
    // The current WASM search is time/depth bounded and runs synchronously in this worker.
    // It finishes naturally; the worker can then process the next UCI command.
    return;
  }

  if (command === "quit") {
    disposed = true;
    close();
  }
}

self.addEventListener("message", (event) => {
  queue = queue.then(() => handle(event.data)).catch((error) => {
    send("info string Berserk worker error: " + (error?.message || String(error)));
  });
});
