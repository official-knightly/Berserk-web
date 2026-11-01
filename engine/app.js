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
  var analysisBaseline = null;
  var analysisBaselineFen = null;
  var baselinePromise = null;
  var lastHumanMove = null;
  var lastHumanBeforeFen = null;
  var pendingEngineReview = null;
  var pendingPremove = null;
  var arrows = [];
  var arrowStart = null;
  var arrowPendingStart = null;

  var engineStatus = $("engine-status");
  var statusDot = $("status-dot");
  var engineNote = $("engine-note");
  var gameStatus = $("game-status");
  var turnLabel = $("turn-label");
  var moveCount = $("move-count");
  var movesElement = $("moves");
  var startButton = $("start-btn");
  var qualityLabel = $("quality-label");
  var qualityMove = $("quality-move");
  var qualityDetail = $("quality-detail");
  var qualityIcon = $("quality-icon");
  var accuracyValue = $("accuracy-value");
  var evaluationValue = $("evaluation-value");
  var evaluationIndicator = $("evaluation-indicator");
  var premoveStatus = $("premove-status");
  var humanAccuracyTotal = 0;
  var humanAccuracyCount = 0;

  function setEngineStatus(message, state) {
    engineStatus.textContent = message;
    statusDot.style.backgroundColor = state === "ready" ? "#a7c99d" : state === "error" ? "#d87972" : "#d2a66a";
  }

  function selectedElo() { return Number($("elo").value); }
  function selectedAttack() { return Number($("attack").value); }
  function selectedThinkMs() { return Math.round(Number($("think").value) * 1000); }

  function scoreFromResult(result) {
    // Prefer the deepest rank-1 UCI info line parsed by the worker.
    if (result && result.candidates && result.candidates.length &&
        Number.isFinite(Number(result.candidates[0].scoreCp))) {
      return Number(result.candidates[0].scoreCp);
    }
    if (result && Number.isFinite(Number(result.scoreCp))) return Number(result.scoreCp);
    return null;
  }

  function formatEval(cp) {
    if (cp === null || !Number.isFinite(cp)) return "—";
    var value = cp / 100;
    return (value > 0 ? "+" : "") + value.toFixed(2);
  }

  // Berserk's UCI score is from the side-to-move perspective.
  // Convert it immediately to White's perspective so async searches,
  // move reviews and the evaluation bar all use the same sign convention.
  function scoreToWhitePerspective(score, fen) {
    if (score === null || !Number.isFinite(score)) return null;
    var activeSide = String(fen || game.fen()).split(" ")[1];
    return activeSide === "b" ? -score : score;
  }

  function updateEvaluation(whiteScore) {
    if (whiteScore === null || !Number.isFinite(whiteScore)) {
      evaluationValue.textContent = "—";
      if (evaluationIndicator) evaluationIndicator.style.left = "50%";
      return;
    }
    evaluationValue.textContent = formatEval(whiteScore);
    var clamped = Math.max(-500, Math.min(500, whiteScore));
    // Positive = White advantage (left); negative = Black advantage (right).
    var position = 50 - (clamped / 500) * 50;
    if (evaluationIndicator) evaluationIndicator.style.left = position + "%";
  }

  function updateAccuracy(loss, countMove) {
    if (!accuracyValue || loss === null || !Number.isFinite(loss)) return;
    // A transparent approximation from centipawn loss, not an official platform metric.
    var moveAccuracy = Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(0, loss) / 300)));
    if (countMove) {
      humanAccuracyTotal += moveAccuracy;
      humanAccuracyCount++;
    }
    accuracyValue.textContent = humanAccuracyCount
      ? Math.round(humanAccuracyTotal / humanAccuracyCount) + "%"
      : "—";
    return moveAccuracy;
  }

  function prepareHumanBaseline() {
    if (!engineReady || !gameStarted || game.game_over() || game.turn() !== humanSide) return Promise.resolve(null);
    var fen = game.fen();
    if (analysisBaselineFen === fen && analysisBaseline !== null) return Promise.resolve(analysisBaseline);
    if (baselinePromise && analysisBaselineFen === fen) return baselinePromise;
    analysisBaseline = null;
    analysisBaselineFen = fen;
    var token = turnToken;
    baselinePromise = engine.search(fen, 350, 1, token).then(function (result) {
      if (token !== turnToken || game.fen() !== fen) return null;
      analysisBaseline = scoreToWhitePerspective(scoreFromResult(result), fen);
      updateEvaluation(analysisBaseline);
      return analysisBaseline;
    }).catch(function () {
      if (analysisBaselineFen === fen) analysisBaseline = null;
      return null;
    });
    return baselinePromise;
  }

  function showMoveReview(move, beforeWhite, afterWhite, isHumanMove, moverSide) {
    qualityMove.textContent = move || "Last move";
    if (beforeWhite === null || afterWhite === null ||
        !Number.isFinite(beforeWhite) || !Number.isFinite(afterWhite)) {
      qualityLabel.textContent = "Not rated";
      if (qualityIcon) qualityIcon.hidden = true;
      qualityDetail.textContent = "Berserk could not compare both positions.";
      return;
    }
    // A move loses evaluation from the mover's own perspective.
    var loss = Math.max(0, moverSide === "b"
      ? afterWhite - beforeWhite
      : beforeWhite - afterWhite);
    var moveAccuracy = updateAccuracy(loss, !!isHumanMove);

    var label;
    if (loss <= 10) label = "Best";
    else if (loss <= 25) label = "Excellent";
    else if (loss <= 50) label = "Good";
    else if (loss <= 100) label = "Inaccuracy";
    else if (loss <= 200) label = "Mistake";
    else label = "Blunder";
    qualityLabel.textContent = label;
    if (qualityIcon) {
      var iconFiles = {
        "Best": "cls-great.svg",
        "Excellent": "cls-excellent.svg",
        "Good": "cls-good.svg",
        "Inaccuracy": "cls-inaccuracy.svg",
        "Mistake": "cls-mistake.svg",
        "Blunder": "cls-blunder.svg"
      };
      qualityIcon.src = "./assets/classification/" + (iconFiles[label] || "cls-good.svg");
      qualityIcon.alt = label + " move classification";
      qualityIcon.hidden = false;
    }
    qualityDetail.textContent = "Eval: " + formatEval(beforeWhite) + " → " + formatEval(afterWhite) +
      " · loss " + Math.round(loss) + " cp" +
      (moveAccuracy === undefined ? "" : " · accuracy " + Math.round(moveAccuracy) + "%");
  }

  function completeEngineMoveReview() {
    if (!pendingEngineReview) return;
    showMoveReview("Berserk: " + pendingEngineReview.move, pendingEngineReview.before,
      analysisBaseline, false, pendingEngineReview.side);
    pendingEngineReview = null;
  }

  function applyPremove() {
    if (!pendingPremove || !gameStarted || engineBusy || game.turn() !== humanSide || game.game_over()) return false;
    var queued = pendingPremove;
    pendingPremove = null;
    premoveStatus.textContent = "";
    var beforeFen = game.fen();
    var move = game.move({ from: queued.from, to: queued.to, promotion: queued.promotion || "q" });
    if (!move) {
      premoveStatus.textContent = "Premove unavailable — the move is no longer legal.";
      renderGame();
      return false;
    }
    lastHumanMove = move.san;
    lastHumanBeforeFen = beforeFen;
    renderGame();
    makeEngineMove();
    return true;
  }

  function squareAtPointer(event) {
    var rect = $("board").getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = Math.floor((event.clientX - rect.left) / rect.width * 8);
    var y = Math.floor((event.clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    var file = board.orientation() === "black" ? 7 - x : x;
    var rank = board.orientation() === "black" ? y + 1 : 8 - y;
    return "abcdefgh".charAt(file) + rank;
  }

  function renderArrows() {
    var svg = $("arrow-layer");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var ns = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(ns, "defs");
    var marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "arrow-head");
    marker.setAttribute("markerWidth", "5");
    marker.setAttribute("markerHeight", "5");
    marker.setAttribute("refX", "4");
    marker.setAttribute("refY", "2.5");
    marker.setAttribute("orient", "auto");
    var head = document.createElementNS(ns, "path");
    head.setAttribute("d", "M0,0 L5,2.5 L0,5 Z");
    head.setAttribute("fill", "#e6c45b");
    marker.appendChild(head);
    defs.appendChild(marker);
    svg.appendChild(defs);
    arrows.forEach(function (arrow) {
      function point(square) {
        var file = square.charCodeAt(0) - 97;
        var rank = Number(square.charAt(1));
        return board.orientation() === "black"
          ? { x: 7 - file + 0.5, y: rank - 1 + 0.5 }
          : { x: file + 0.5, y: 8 - rank + 0.5 };
      }
      var from = point(arrow.from);
      var to = point(arrow.to);
      var line = document.createElementNS(ns, "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", to.x);
      line.setAttribute("y2", to.y);
      line.setAttribute("stroke", "#e6c45b");
      line.setAttribute("stroke-width", "0.13");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("marker-end", "url(#arrow-head)");
      svg.appendChild(line);
    });
  }

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
    premoveStatus.textContent = pendingPremove
      ? "Premove queued: " + pendingPremove.from + " → " + pendingPremove.to
      : premoveStatus.textContent;
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
      if (baselinePromise) await baselinePromise;
      var beforeScore = analysisBaseline;
      if (lastHumanMove && beforeScore === null && lastHumanBeforeFen) {
        var beforeResult = await engine.search(lastHumanBeforeFen, 350, 1, requestToken);
        beforeScore = scoreToWhitePerspective(scoreFromResult(beforeResult), lastHumanBeforeFen);
      }
      var requestedMultiPV = Math.max(1, Math.min(8, Math.ceil((3000 - selectedElo()) / 400) + 1));
      var engineSearchFen = game.fen();
      var result = await engine.search(engineSearchFen, selectedThinkMs(), requestedMultiPV, requestToken);
      if (requestToken !== turnToken) return;
      engineBusy = false;
      if (lastHumanMove) {
        var enginePerspective = scoreFromResult(result);
        var afterWhite = scoreToWhitePerspective(enginePerspective, engineSearchFen);
        showMoveReview(lastHumanMove, beforeScore, afterWhite, true, humanSide);
        lastHumanMove = null;
        lastHumanBeforeFen = null;
      }

      var chosenMove = chooseEngineMove(result);
      var played = playUciMove(chosenMove);
      if (!played && result.bestmove) played = playUciMove(result.bestmove);
      if (!played) {
        gameStatus.textContent = "No legal engine move returned";
        turnLabel.textContent = "Engine error";
        renderGame();
        return;
      }
      pendingEngineReview = {
        move: played.san,
        before: scoreToWhitePerspective(scoreFromResult(result), engineSearchFen),
        side: engineSearchFen.split(" ")[1]
      };
      renderGame();
      analysisBaseline = null;
      analysisBaselineFen = null;
      baselinePromise = null;
      if (!game.game_over()) {
        engineBusy = true;
        await prepareHumanBaseline();
        completeEngineMoveReview();
        engineBusy = false;
        renderGame();
        if (pendingPremove) applyPremove();
      } else {
        pendingEngineReview = null;
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
    pendingPremove = null;
    premoveStatus.textContent = "";
    analysisBaseline = null;
    analysisBaselineFen = null;
    baselinePromise = null;
    lastHumanMove = null;
    lastHumanBeforeFen = null;
    pendingEngineReview = null;
    humanAccuracyTotal = 0;
    humanAccuracyCount = 0;
    accuracyValue.textContent = "—";
    evaluationValue.textContent = "—";
    if (evaluationIndicator) evaluationIndicator.style.left = "50%";
    qualityLabel.textContent = "Waiting for a move";
    if (qualityIcon) qualityIcon.hidden = true;
    qualityMove.textContent = "—";
    qualityDetail.textContent = "Berserk will compare your move with the evaluation before and after it.";
    game.reset();
    arrows = [];
    arrowStart = null;
    arrowPendingStart = null;
    renderArrows();
    board.orientation(humanSide === "w" ? "white" : "black");
    board.start();
    updateControls();
    startButton.textContent = "Restart game";
    renderGame();
    if (humanSide === "b") makeEngineMove();
    else prepareHumanBaseline();
  }

  function undoTurn() {
    if (!game.history().length) return;
    turnToken++;
    engineBusy = false;
    pendingPremove = null;
    premoveStatus.textContent = "";
    analysisBaseline = null;
    analysisBaselineFen = null;
    baselinePromise = null;
    lastHumanMove = null;
    lastHumanBeforeFen = null;
    pendingEngineReview = null;
    var undone = false;
    for (var i = 0; i < 2; i++) {
      if (game.undo()) undone = true;
    }
    if (!undone) return;
    renderGame();
    if (gameStarted && game.turn() !== humanSide && !game.game_over()) makeEngineMove();
    else if (gameStarted && !game.game_over()) prepareHumanBaseline();
  }

  var engine = new BerserkEngine({
    onStatus: function (state) {
      if (state === "loading") setEngineStatus("Loading Berserk WASM…", "loading");
      if (state === "ready") setEngineStatus("Berserk engine ready", "ready");
      if (state === "error") setEngineStatus("Engine failed to load", "error");
    },
    onProgress: function (loaded, total) {
      var mb = function (n) { return (n / 1048576).toFixed(1); };
      setEngineStatus(total
        ? "Loading Berserk WASM… " + Math.min(100, Math.round(loaded / total * 100)) + "%"
        : "Loading Berserk WASM… " + mb(loaded) + " MB", "loading");
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
      if (!gameStarted || game.game_over()) return false;
      if (piece.charAt(0) !== humanSide) return false;
      if (!engineBusy && game.turn() !== humanSide) return false;
      return true;
    },
    onDrop: function (source, target) {
      if (!gameStarted || game.game_over()) return "snapback";
      if (engineBusy) {
        pendingPremove = { from: source, to: target, promotion: "q" };
        premoveStatus.textContent = "Premove queued: " + source + " → " + target;
        return "snapback";
      }
      if (game.turn() !== humanSide) return "snapback";
      var beforeFen = game.fen();
      var move = game.move({ from: source, to: target, promotion: "q" });
      if (move === null) return "snapback";
      lastHumanMove = move.san;
      lastHumanBeforeFen = beforeFen;
      renderGame();
      if (game.game_over()) return;
      makeEngineMove();
    },
    onSnapEnd: function () {
      board.position(game.fen(), false);
    }
  });

  var leftArrowStart = null;
  function clearBoardArrows() {
    arrows = [];
    arrowStart = null;
    arrowPendingStart = null;
    leftArrowStart = null;
    renderArrows();
  }
  function squareFromEvent(event) {
    var squareElement = event.target && event.target.closest
      ? event.target.closest("[data-square]")
      : null;
    var namedSquare = squareElement && squareElement.getAttribute("data-square");
    return namedSquare && /^[a-h][1-8]$/.test(namedSquare)
      ? namedSquare
      : squareAtPointer(event);
  }
  $("board").addEventListener("contextmenu", function (event) {
    event.preventDefault();
    clearBoardArrows();
  });
  // Use mouseup (rather than pointerup) for broad compatibility with the
  // mouse handlers used internally by chessboard.js.
  $("board").addEventListener("mousedown", function (event) {
    if (event.button === 2) {
      event.preventDefault();
      clearBoardArrows();
      return;
    }
    if (event.button !== 0) return;
    var square = squareFromEvent(event);
    // Empty-square drag draws an arrow. Hold Shift to draw from an occupied
    // square without confusing a normal piece drag with an annotation.
    if (square && (!game.get(square) || event.shiftKey)) {
      leftArrowStart = square;
      event.preventDefault();
    }
  });
  window.addEventListener("mouseup", function (event) {
    if (event.button !== 0 || !leftArrowStart) return;
    var from = leftArrowStart;
    var to = squareFromEvent(event);
    leftArrowStart = null;
    if (to && to !== from) {
      arrows.push({ from: from, to: to });
      renderArrows();
    }
  });
  window.addEventListener("blur", function () { leftArrowStart = null; });
  $("clear-arrows-btn").addEventListener("click", function () {
    arrows = [];
    arrowStart = null;
    arrowPendingStart = null;
    renderArrows();
  });
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      arrows = [];
      arrowStart = null;
      arrowPendingStart = null;
      renderArrows();
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

  $("flip-btn").addEventListener("click", function () { board.flip(); renderArrows(); });
  $("start-btn").addEventListener("click", startGame);
  $("new-btn").addEventListener("click", startGame);
  $("undo-btn").addEventListener("click", undoTurn);

  ["elo", "attack", "think"].forEach(function (id) {
    $(id).addEventListener("input", updateControls);
  });

  updateControls();
  renderGame();
  renderArrows();
})();
