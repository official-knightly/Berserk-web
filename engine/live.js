(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("live-board") || !window.BerserkEngine || !window.Chessboard || !window.Chess) return;
  var liveBoard = Chessboard("live-board", {
    position: "start", draggable: false, showNotation: true,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"
  });
  var engine = null, timer = null, watchToken = 0, currentPgn = "", currentGame = null;
  var lastReviewedPly = 0, selectedPly = 0, currentGrade = null;
  var icons = {
    Brilliant:"cls-brilliant.svg", Great:"cls-great.svg", Best:"cls-great.svg",
    Excellent:"cls-excellent.svg", Good:"cls-good.svg", Inaccuracy:"cls-inaccuracy.svg",
    Mistake:"cls-mistake.svg", Blunder:"cls-blunder.svg", Book:"cls-book.svg"
  };
  function status(message, state) {
    $("live-status").textContent = message;
    $("live-engine-state").textContent = state || "Waiting for a game";
  }
  function headers(pgn) {
    var result = {};
    String(pgn).replace(/^\[(\w+)\s+"([^"]*)"\]\s*$/gm, function (_, key, value) { result[key] = value; });
    return result;
  }
  function baseGame(meta) {
    return new Chess(meta.FEN && meta.SetUp === "1" ? meta.FEN : undefined);
  }
  function replayAt(ply) {
    var replay = new Chess(currentGame.startFen);
    for (var i = 0; i < Math.min(ply, currentGame.moves.length); i++) {
      var m = currentGame.moves[i];
      replay.move({ from:m.from, to:m.to, promotion:m.promotion || "q" });
    }
    return replay;
  }
  function drawBestArrow(from, to) {
    var svg = $("live-arrow-layer");
    svg.textContent = "";
    var ns = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(ns, "defs");
    var marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "live-arrow-head"); marker.setAttribute("markerWidth", "5");
    marker.setAttribute("markerHeight", "5"); marker.setAttribute("refX", "4");
    marker.setAttribute("refY", "2.5"); marker.setAttribute("orient", "auto");
    var head = document.createElementNS(ns, "path");
    head.setAttribute("d", "M0,0 L5,2.5 L0,5 Z"); head.setAttribute("fill", "#b7d4a8");
    marker.appendChild(head); defs.appendChild(marker); svg.appendChild(defs);
    function point(square) {
      var file = square.charCodeAt(0)-97, rank = Number(square.charAt(1));
      return liveBoard.orientation() === "black"
        ? {x:7-file+.5,y:rank-1+.5} : {x:file+.5,y:8-rank+.5};
    }
    var a=point(from),b=point(to),line=document.createElementNS(ns,"line");
    line.setAttribute("x1",a.x);line.setAttribute("y1",a.y);line.setAttribute("x2",b.x);line.setAttribute("y2",b.y);
    line.setAttribute("stroke","#b7d4a8");line.setAttribute("stroke-width",".14");
    line.setAttribute("stroke-linecap","round");line.setAttribute("marker-end","url(#live-arrow-head)");
    svg.appendChild(line);
  }
  function renderMoves() {
    var root=$("live-moves");root.textContent="";
    var moves=currentGame ? currentGame.moves : [];
    if(!moves.length){root.textContent="No moves have been published yet.";return;}
    for(var i=0;i<moves.length;i+=2){
      var n=document.createElement("span");n.className="live-move-number";n.textContent=(Math.floor(i/2)+1)+".";
      root.appendChild(n);
      [moves[i],moves[i+1]].forEach(function(move,index){
        var cell=document.createElement("button");cell.type="button";cell.className="live-move";
        var ply=i+index+1;
        if(ply===selectedPly)cell.classList.add("active");
        var grade=currentGame.grades[ply-1];
        if(grade&&icons[grade.label]){
          var img=document.createElement("img");img.src="./assets/classification/"+icons[grade.label];
          img.alt=grade.label;img.title=grade.label;cell.appendChild(img);
        }
        var san=document.createElement("span");san.textContent=move?move.san:"";cell.appendChild(san);
        if(move)cell.addEventListener("click",function(){selectedPly=ply;liveBoard.position(replayAt(ply).fen(),false);renderMoves();});
        else cell.disabled=true;
        root.appendChild(cell);
      });
    }
    $("live-move-count").textContent=moves.length+" plies";
  }
  function gradeLabel(loss) {
    return loss<=10?"Best":loss<=25?"Excellent":loss<=50?"Good":loss<=100?"Inaccuracy":loss<=200?"Mistake":"Blunder";
  }
  function whiteScore(result, fen) {
    var cp=result&&result.candidates&&result.candidates[0]?result.candidates[0].scoreCp:result&&result.scoreCp;
    if(!Number.isFinite(Number(cp)))return null;
    cp=Number(cp);return fen.split(" ")[1]==="b"?-cp:cp;
  }
  async function analyzeNewMoves(previousPly, token) {
    if(!currentGame || currentGame.moves.length<=previousPly)return;
    var start=Math.max(previousPly,currentGame.moves.length-1);
    var before=replayAt(start), move=currentGame.moves[start];
    var beforeFen=before.fen();
    var after=new Chess(beforeFen);
    after.move({from:move.from,to:move.to,promotion:move.promotion||"q"});
    var afterFen=after.fen();
    var beforeResult=await engine.search(beforeFen,500,1,token);
    var afterResult=await engine.search(afterFen,500,1,token);
    if(token!==watchToken)return;
    var beforeScore=whiteScore(beforeResult,beforeFen),afterScore=whiteScore(afterResult,afterFen);
    if(beforeScore===null||afterScore===null)return;
    var loss=Math.max(0,move.color==="b"?afterScore-beforeScore:beforeScore-afterScore);
    currentGrade={label:gradeLabel(loss),loss:loss,ply:start+1};
    currentGame.grades[start]=currentGrade;
    var icon=$("live-quality-icon");icon.src="./assets/classification/"+icons[currentGrade.label];icon.alt=currentGrade.label;icon.hidden=false;
    $("live-quality-label").textContent=currentGrade.label+" move";
    $("live-quality-detail").textContent=move.san+" · "+Math.round(loss)+" cp lost";
    renderMoves();
  }
  async function analyzePosition(token) {
    if(!currentGame)return;
    var fen=currentGame.finalFen;
    $("live-engine-state").textContent="Analyzing with Berserk…";
    var result=await engine.search(fen,1100,3,token);
    if(token!==watchToken)return;
    var best=result.candidates&&result.candidates[0]?result.candidates[0]:null;
    var uci=best?best.uci:result.bestmove;
    if(!uci||uci.length<4){$("live-best-move").textContent="No move returned";return;}
    var test=new Chess(fen);
    var move=test.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"});
    if(!move){$("live-best-move").textContent="No legal move returned";return;}
    $("live-best-move").textContent=move.san+" · "+uci.slice(0,2)+" → "+uci.slice(2,4);
    var score=whiteScore(result,fen);
    $("live-best-eval").textContent=score===null?"Evaluation unavailable":"Evaluation "+(score>0?"+":"")+(score/100).toFixed(2);
    $("live-pv-line").textContent=best&&best.pv?best.pv.join(" "):uci;
    drawBestArrow(uci.slice(0,2),uci.slice(2,4));
    $("live-engine-state").textContent="Berserk analysis ready";
  }
  async function poll(token) {
    if(token!==watchToken)return;
    var username=$("live-username").value.trim();
    if(!username)return;
    try{
      var url="https://lichess.org/api/user/"+encodeURIComponent(username)+"/current-game?moves=true&tags=true&clocks=false&evals=false&opening=true";
      var response=await fetch(url,{headers:{Accept:"application/x-chess-pgn"},cache:"no-store"});
      if(!response.ok)throw new Error(response.status===404?"No public current or recent game was found for that username.":"Lichess returned HTTP "+response.status+".");
      var pgn=await response.text();
      if(!pgn||!pgn.includes("1."))throw new Error("Lichess did not return a readable PGN for this user.");
      var meta=headers(pgn), parsed=baseGame(meta);
      if(!parsed.load_pgn(pgn,{sloppy:true}))throw new Error("The returned Lichess game could not be parsed.");
      var moves=parsed.history({verbose:true});
      var start=baseGame(meta);
      var result=meta.Result||"*";
      var previous=currentGame&&currentGame.id===meta.Site?currentGame.moves.length:0;
      var gameId=meta.Site||meta.Event||username;
      var changed=!currentGame||currentGame.id!==gameId||moves.length!==currentGame.moves.length;
      currentPgn=pgn;
      currentGame={id:gameId,moves:moves,startFen:start.fen(),finalFen:parsed.fen(),grades:currentGame&&currentGame.id===gameId?currentGame.grades:[]};
      $("live-white-player").textContent=meta.White||username;
      $("live-black-player").textContent=meta.Black||"Opponent";
      liveBoard.position(currentGame.finalFen,false);
      selectedPly=moves.length;
      renderMoves();
      $("live-review").disabled=false;
      if(result!=="*")status("This is the user's most recent completed game, not an active game. Showing its final position.","Game finished");
      else status("Following "+(meta.White||"White")+" vs "+(meta.Black||"Black")+". Public moves may be delayed by Lichess.","Watching · updates automatically");
      if(changed){
        if(moves.length&&moves.length>lastReviewedPly)await analyzeNewMoves(lastReviewedPly,token);
        lastReviewedPly=moves.length;
        if(token===watchToken)await analyzePosition(token);
      }
    }catch(error){if(token===watchToken)status(error.message||String(error),"Live game unavailable");}
  }
  function stop() {
    watchToken++;if(timer){clearInterval(timer);timer=null;}
    $("live-stop").disabled=true;$("live-find").disabled=false;
    if(engine){engine.terminate();engine=null;}
    $("live-engine-state").textContent="Watching stopped";
  }
  $("live-find").addEventListener("click",async function(){
    var username=$("live-username").value.trim();
    if(!username){status("Enter a Lichess username first.");return;}
    stop();watchToken++;var token=watchToken;lastReviewedPly=0;currentGame=null;currentPgn="";
    $("live-find").disabled=true;$("live-stop").disabled=false;
    status("Connecting to Lichess and loading Berserk…","Connecting");
    engine=new BerserkEngine({onError:function(e){status("Berserk could not load: "+e.message,"Engine unavailable");}});
    try{
      await engine.ready;if(token!==watchToken)return;
      await poll(token);
      if(token===watchToken)timer=setInterval(function(){poll(token);},8000);
    }catch(error){if(token===watchToken)status("Could not initialize Berserk: "+error.message,"Engine unavailable");}
    finally{if(token===watchToken)$("live-find").disabled=false;}
  });
  $("live-stop").addEventListener("click",stop);
  window.addEventListener("berserk:live-hidden",stop);
  window.addEventListener("berserk:live-visible",function(){if(liveBoard&&typeof liveBoard.resize==="function")liveBoard.resize();});
  $("live-flip").addEventListener("click",function(){liveBoard.flip();if(currentGame)liveBoard.position(replayAt(selectedPly).fen(),false);});
  $("live-review").addEventListener("click",function(){
    if(currentPgn)window.dispatchEvent(new CustomEvent("berserk:open-review",{detail:{pgn:currentPgn,title:"Lichess · "+$("live-username").value.trim()}}));
  });
  $("live-username").addEventListener("keydown",function(e){if(e.key==="Enter")$("live-find").click();});
  window.addEventListener("beforeunload",stop);
})();