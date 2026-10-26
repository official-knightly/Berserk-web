(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var game = new Chess();
  var board = null;
  var chosenSide = "w";
  var humanSide = "w";
  var gameStarted = false;
  var engineReady = false;
  var engineBusy = false;
  var turnToken = 0;

  var engineStatus = $("engine-status");
  var statusDot = $("status-dot");
  var engineNote = $("engine-note");
  var gameStatus = $("game-status");
  var turnLabel = $("turn-label");
  var moveCount = $("move-count");
  var movesElement = $("moves");
  var startButton = $("start-btn");

  function setEngineStatus(message, state) {
    engineStatus.textContent = message;
    statusDot.style.backgroundColor = state === "ready" ? "#a7c99d" : state === "error" ? "#d87972" : "#d2a66a";
  }

  function selectedElo() { return Number($("elo").value); }
  function selectedAttack() { return Number($("attack").value); }
  function selectedThinkMs() { return Math.round(Number($("think").value) * 1000); }

  function updateControls() {
    var elo = selectedElo();
    var attack = selectedAttack();
    var seconds = Number($("think").value).toFixed(1);
    $("elo-value").textContent = elo + " Elo";
    $("elo-inline").textContent = String(elo);
    $("attack-value").textContent = attack + " / 10";
    $("think-value").textContent = seconds + " sec";
    $("session-time").textContent = seconds + " sec";
    $("player-side").textContent = humanSide === "w" ? "White" : "Black";
    $("engine-side").textContent = humanSide === "w" ? "Black" : "White";
  }

  function formatHistory() {
    var history = game.history();
    if (!history.length) return "Your game moves will appear here.";
    return history.map(function (san, index) {
      var prefix = index % 2 === 0 ? (Math.floor(index / 2) + 1) + ". " : "";
      return prefix + san;
    }).join(" ");
  }

  function finalMessage() {
    if (game.in_checkmate()) {
      return (game.turn() === "w" ? "Black" : "White") + " wins by checkmate";
    }
    if (game.in_stalemate()) return "Draw by stalemate";
    if (game.in_threefold_repetition()) return "Draw by repetition";
    if (game.insufficient_material()) return "Draw by insufficient material";
    if (game.in_draw()) return "Draw";
    return "";
  }

  function renderGame() {
    if (board) board.position(game.fen(), false);
    var outcome = finalMessage();
    turnLabel.textContent = outcome ? outcome : (engineBusy ? "Berserk is thinking" : (game.turn() === "w" ? "White to move" : "Black to move"));
    moveCount.textContent = "Move " + (Math.floor(game.history().length / 2) + 1);
    movesElement.textContent = formatHistory();
    if (outcome) {
      gameStatus.textContent = outcome;
    } else if (!gameStarted) {
      gameStatus.textContent = "Ready";
    } else if (engineBusy) {
      gameStatus.textContent = "Thinking…";
    } else {
      gameStatus.textContent = "Playing";
    }
    $("undo-btn").disabled = !game.history().length;
    $("new-btn").disabled = !engineReady;
    startButton.disabled = !engineReady;
  }

  function chooseEngineMove(result) {
    var raw = Array.isArray(result.candidates) ? result.candidates : [];
    if (!raw.length) {
      return result.bestmove && result.bestmove !== "(none)" && result.bestmove !== "0000"
        ? result.bestmove
        : null;
    }

    var attack = selectedAttack();
    var adjusted = raw.map(function (candidate) {
      var value = candidate.scoreCp || 0;
      var copy = new Chess(game.fen());
      var move = copy.move({
        from: candidate.uci.slice(0, 2),
        to: candidate.uci.slice(2, 4),
        promotion: candidate.uci.length > 4 ? candidate.uci.charAt(4) : "q"
      });
      var tactical = 0;
      if (move) {
        var capturedValues = { p: 100, n: 310, b: 330, r: 500, q: 900 };
        if (move.captured) tactical += 20 + (capturedValues[move.captured] || 0) * 0.16;
        if (move.promotion) tactical += 70;
        if (copy.in_checkmate()) tactical += 600;
        else if (copy.in_check()) tactical += 45;
      }
      var attackBias = Math.max(-125, Math.min(125, ((attack - 5) / 5) * tactical));
      return {
        uci: candidate.uci,
        rank: candidate.rank,
        adjustedScore: value + attackBias
      };
    });
    adjusted.sort(function (a, b) {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      return a.rank - b.rank;
    });

    var elo = selectedElo();
    var normalized = (elo - 400) / 2600;
    var maxCount = Math.max(1, Math.min(adjusted.length, 1 + Math.round((1 - normalized) * 7)));
    var choices = adjusted.slice(0, maxCount);
    if (elo >= 2950 || choices.length === 1) return choices[0].uci;

    var rankPenalty = 0.15 + normalized * 2.85;
    var weights = choices.map(function (item, index) { return Math.exp(-index * rankPenalty); });
    var total = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
    var pick = Math.random() * total;
    for (var i = 0; i < choices.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return choices[i].uci;
    }
    return choices[0].uci;
  }

  function playUciMove(uci) {
    if (!uci || uci === "(none)" || uci === "0000" || uci.length < 4) return null;
    return game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.charAt(4) : "q"
    });
  }

  async function makeEngineMove() {
    if (!engineReady || !gameStarted || gameBusyOrOver()) return;
    if (game.turn() === humanSide) return;

    var requestToken = turnToken;
    engineBusy = true;
    renderGame();
    try {
      var requestedMultiPV = Math.max(1, Math.min(8, Math.ceil((3000 - selectedElo()) / 400) + 1));
      var result = await engine.search(game.fen(), selectedThinkMs(), requestedMultiPV, requestToken);
      if (requestToken !== turnToken) return;
      engineBusy = false;

      var chosenMove = chooseEngineMove(result);
      var played = playUciMove(chosenMove);
      if (!played && result.bestmove) played = playUciMove(result.bestmove);
      if (!played) {
        gameStatus.textContent = "No legal engine move returned";
        turnLabel.textContent = "Engine error";
        renderGame();
        return;
      }
      renderGame();
      if (game.game_over()) {
        renderGame();
      }
    } catch (error) {
      if (requestToken !== turnToken) return;
      engineBusy = false;
      gameStatus.textContent = "Engine error";
      turnLabel.textContent = "Engine search failed";
      engineNote.textContent = "Berserk search failed: " + (error && error.message ? error.message : String(error));
      setEngineStatus("Engine error", "error");
      renderGame();
    }
  }

  function gameBusyOrOver() {
    return engineBusy || game.game_over();
  }

  function startGame() {
    if (!engineReady) return;
    turnToken++;
    engineBusy = false;
    gameStarted = true;
    humanSide = chosenSide;
    game.reset();
    board.orientation(humanSide === "w" ? "white" : "black");
    board.start();
    updateControls();
    startButton.textContent = "Restart game";
    renderGame();
    if (humanSide === "b") makeEngineMove();
  }

  function undoTurn() {
    if (!game.history().length) return;
    turnToken++;
    engineBusy = false;
    var undone = false;
    for (var i = 0; i < 2; i++) {
      if (game.undo()) undone = true;
    }
    if (!undone) return;
    renderGame();
    if (gameStarted && game.turn() !== humanSide && !game.game_over()) makeEngineMove();
  }

  var engine = new BerserkEngine({
    onStatus: function (state) {
      if (state === "loading") setEngineStatus("Loading Berserk WASM…", "loading");
      if (state === "ready") setEngineStatus("Berserk engine ready", "ready");
      if (state === "error") setEngineStatus("Engine failed to load", "error");
    },
    onInfo: function (message) {
      if (message.context !== turnToken || !engineBusy) return;
      var depthMatch = String(message.line).match(/\bdepth\s+(\d+)/);
      if (depthMatch) gameStatus.textContent = "Searching · depth " + depthMatch[1];
    },
    onError: function (error) {
      engineReady = false;
      engineNote.textContent = "The Berserk WASM engine could not load: " + (error && error.message ? error.message : String(error));
      setEngineStatus("Engine failed to load", "error");
      renderGame();
    }
  });

  engine.ready.then(function () {
    engineReady = true;
    setEngineStatus("Berserk engine ready", "ready");
    engineNote.textContent = "Live Berserk WASM engine. Target Elo is approximate; think time sets the maximum search time and attack level biases tactical choices.";
    startButton.disabled = false;
    $("new-btn").disabled = false;
    renderGame();
  }).catch(function (error) {
    engineReady = false;
    engineNote.textContent = "Berserk WASM is not available: " + (error && error.message ? error.message : String(error)) + ". Open the deployed HTTPS site and check the GitHub Actions build.";
    setEngineStatus("Engine failed to load", "error");
    renderGame();
  });

  board = Chessboard("board", {
    position: "start",
    orientation: "white",
    draggable: true,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDragStart: function (source, piece) {
      if (!gameStarted || engineBusy || game.game_over()) return false;
      if (game.turn() !== humanSide) return false;
      if ((game.turn() === "w" && piece.charAt(0) !== "w") ||
          (game.turn() === "b" && piece.charAt(0) !== "b")) return false;
      return true;
    },
    onDrop: function (source, target) {
      if (!gameStarted || engineBusy || game.game_over()) return "snapback";
      var move = game.move({ from: source, to: target, promotion: "q" });
      if (move === null) return "snapback";
      renderGame();
      if (game.game_over()) return;
      makeEngineMove();
    },
    onSnapEnd: function () {
      board.position(game.fen(), false);
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll(".side-option"), function (button) {
    button.addEventListener("click", function () {
      if (gameStarted) return;
      chosenSide = button.getAttribute("data-side") === "b" ? "b" : "w";
      Array.prototype.forEach.call(document.querySelectorAll(".side-option"), function (other) {
        var active = other === button;
        other.classList.toggle("active", active);
        other.setAttribute("aria-pressed", active ? "true" : "false");
      });
      humanSide = chosenSide;
      updateControls();
      board.orientation(humanSide === "w" ? "white" : "black");
    });
  });

  $("flip-btn").addEventListener("click", function () { board.flip(); });
  $("start-btn").addEventListener("click", startGame);
  $("new-btn").addEventListener("click", startGame);
  $("undo-btn").addEventListener("click", undoTurn);

  ["elo", "attack", "think"].forEach(function (id) {
    $(id).addEventListener("input", updateControls);
  });

  updateControls();
  renderGame();
})();