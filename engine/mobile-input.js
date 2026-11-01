(function () {
  "use strict";
  // chessboard.js uses mouse dragging. On touch devices, provide a legal-move
  // tap flow while leaving the desktop drag implementation untouched.
  var NativeChessboard = window.Chessboard;
  if (!NativeChessboard) return;
  window.Chessboard = function (element, config) {
    var root = typeof element === "string" ? document.getElementById(element) : element;
    var touchMode = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0;
    if (root && root.id === "board" && touchMode) config.draggable = false;
    var instance = NativeChessboard(element, config);
    if (!root || root.id !== "board" || !touchMode || !window.Chess) return instance;

    var mirror = new Chess();
    var selected = null;
    var legal = [];
    var picker = null;
    var originalPosition = instance.position.bind(instance);
    instance.position = function (position) {
      if (arguments.length && typeof position === "string") {
        if (position === "start") mirror.reset();
        else if (position.indexOf(" ") !== -1) {
          try { mirror.load(position); } catch (_) {}
        }
      }
      return originalPosition.apply(instance, arguments);
    };

    function squareFrom(node) {
      var square = node && node.closest ? node.closest(".square-55d63") : null;
      if (!square) return null;
      var match = Array.from(square.classList).find(function (name) { return /^square-[a-h][1-8]$/.test(name); });
      return match ? match.slice(7) : (square.getAttribute("data-square") || null);
    }
    function clearMarks() {
      root.querySelectorAll(".tap-selected,.tap-legal,.tap-capture").forEach(function (node) {
        node.classList.remove("tap-selected", "tap-legal", "tap-capture");
      });
    }
    function clearSelection() {
      selected = null; legal = []; clearMarks();
    }
    function pieceCode(piece) { return piece ? piece.color + piece.type.toUpperCase() : ""; }
    function selectSquare(square) {
      var piece = mirror.get(square);
      if (!piece) { clearSelection(); return; }
      if (config.onDragStart && config.onDragStart(square, pieceCode(piece), mirror.fen(), "white") === false) {
        clearSelection(); return;
      }
      var fen = mirror.fen().split(" ");
      // Premove selection is allowed while the engine is thinking. Generate
      // destination hints for the user's piece colour without changing game state.
      if (fen[1] !== piece.color) fen[1] = piece.color;
      var legalGame = new Chess(fen.join(" "));
      legal = legalGame.moves({ square: square, verbose: true });
      if (!legal.length) { clearSelection(); return; }
      selected = square;
      clearMarks();
      var source = root.querySelector(".square-" + square);
      if (source) source.classList.add("tap-selected");
      legal.forEach(function (move) {
        var target = root.querySelector(".square-" + move.to);
        if (target) target.classList.add(move.captured ? "tap-capture" : "tap-legal");
      });
    }
    function commitMove(target, promotion) {
      if (!selected) return;
      var source = selected;
      var candidate = legal.find(function (move) { return move.to === target && (!move.promotion || move.promotion === promotion); });
      if (!candidate) { clearSelection(); return; }
      var result = config.onDrop ? config.onDrop(source, target, null, null, null, null, promotion || "q") : "snapback";
      clearSelection();
      // app.js synchronously renders the authoritative game FEN on successful
      // moves. For queued premoves it deliberately snaps the board back.
      if (result === "snapback") instance.position(mirror.fen(), false);
    }
    function showPromotion(target) {
      if (picker) picker.remove();
      picker = document.createElement("div");
      picker.className = "promotion-picker";
      var colour = (mirror.get(selected) || {}).color || "w";
      var pieces = colour === "w" ? ["Q","R","B","N"] : ["q","r","b","n"];
      pieces.forEach(function (piece) {
        var button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", "Promote to " + piece.toUpperCase());
        button.textContent = ({Q:"♕",R:"♖",B:"♗",N:"♘",q:"♛",r:"♜",b:"♝",n:"♞"})[piece];
        button.addEventListener("click", function () {
          if (picker) picker.remove(); picker = null;
          commitMove(target, piece.toLowerCase());
        });
        picker.appendChild(button);
      });
      root.appendChild(picker);
    }
    root.addEventListener("click", function (event) {
      if (event.button !== 0) return;
      var square = squareFrom(event.target);
      if (!square) return;
      event.preventDefault();
      event.stopPropagation();
      if (!selected) { selectSquare(square); return; }
      if (square === selected) { clearSelection(); return; }
      var options = legal.filter(function (move) { return move.to === square; });
      if (!options.length) {
        var other = mirror.get(square);
        if (other && other.color === (mirror.get(selected) || {}).color) selectSquare(square);
        else clearSelection();
        return;
      }
      if (options.some(function (move) { return !!move.promotion; })) showPromotion(square);
      else commitMove(square, "q");
    }, true);
    root.addEventListener("contextmenu", clearSelection);
    window.addEventListener("resize", clearMarks);
    return instance;
  };
})();