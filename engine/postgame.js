(function () {
"use strict";
var $=function(id){return document.getElementById(id);};
var reviewGame=null, reviewBoard=null, reviewMoves=[], reviewPgn="", reviewTitle="", reviewPly=0, reviewEngine=null;
function status(message){$("import-status").textContent=message;}
function safeText(value){return String(value||"").replace(/[<>]/g,"");}
function pgnHeaders(pgn){var out={};String(pgn).replace(/^\[(\w+)\s+"([^"]*)"\]\s*$/gm,function(_,k,v){out[k]=v;});return out;}
function openReview(pgn,title){
 if(!pgn||!String(pgn).trim()){status("This game has no PGN to review.");return;}
 try{reviewGame=new Chess();if(!reviewGame.load_pgn(pgn,{sloppy:true}))throw new Error("The PGN could not be parsed.");}
 catch(e){status("Invalid PGN: "+e.message);return;}
 reviewPgn=pgn;reviewTitle=title||"Imported game";reviewMoves=reviewGame.history({verbose:true});reviewPly=0;
 var h=pgnHeaders(pgn);
 $("import-review-title").textContent=reviewTitle;$("review-white").textContent=h.White||"White";$("review-black").textContent=h.Black||"Black";$("review-result").textContent=h.Result||"*";$("review-opening").textContent=h.Opening||h.ECO||"Imported game";
 $("import-review").hidden=false;$("import-review").scrollIntoView({behavior:"smooth",block:"start"});
 if(!reviewBoard){reviewBoard=Chessboard("review-board",{position:"start",draggable:false,showNotation:true,pieceTheme:"https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"});}
 renderReview();if(reviewEngine)reviewEngine.terminate();
 reviewEngine=new BerserkEngine({onError:function(err){$("review-best").textContent="Engine unavailable: "+err.message;}});
 reviewEngine.ready.then(function(){$("review-best").textContent="Berserk is ready. Choose Analyze position to evaluate this move.";}).catch(function(){});
}
function renderReview(){
 var replay=new Chess();for(var i=0;i<reviewPly;i++)replay.move(reviewMoves[i]);
 reviewBoard.position(replay.fen(),false);
 $("review-ply-label").textContent=reviewPly===0?"Start position":("Move "+Math.ceil(reviewPly/2)+(reviewPly%2?" · White":" · Black"));
 $("review-prev").disabled=reviewPly===0;$("review-next").disabled=reviewPly>=reviewMoves.length;
 var list=$("import-review-moves");list.textContent="";
 var row=0;
 reviewMoves.forEach(function(m,i){var b=document.createElement("button");b.textContent=(i%2===0?(Math.floor(i/2)+1)+". ":"")+m.san;b.className=i===reviewPly-1?"active":"";b.addEventListener("click",function(){reviewPly=i+1;renderReview();});list.appendChild(b);});
 $("review-eval").textContent="Not analyzed";$("review-best").textContent="Analyze this position with Berserk.";
}
function analyzePosition(){
 if(!reviewEngine||!reviewEngine.ready){$("review-best").textContent="Berserk is loading. Try again in a moment.";return;}
 var replay=new Chess();for(var i=0;i<reviewPly;i++)replay.move(reviewMoves[i]);
 $("review-best").textContent="Berserk is calculating…";$("review-analyze-position").disabled=true;
 reviewEngine.search(replay.fen(),1800,3,reviewPly).then(function(r){
 var cp=r.candidates&&r.candidates[0]?r.candidates[0].scoreCp:r.scoreCp;
 if(replay.turn()==="b")cp=-cp;
 $("review-eval").textContent=Number.isFinite(cp)?(cp>0?"+":"")+(cp/100).toFixed(2):"—";
 var best=r.candidates&&r.candidates[0]?r.candidates[0].uci:r.bestmove;
 if(best&&best.length>=4){var cp2=new Chess(replay.fen());var m=cp2.move({from:best.slice(0,2),to:best.slice(2,4),promotion:best[4]||"q"});$("review-best").textContent=m?"Best move: "+m.san+" · depth "+(r.depth||"—"):"No legal best move returned.";}
 else $("review-best").textContent="No best move returned.";
 }).catch(function(e){$("review-best").textContent="Analysis failed: "+e.message;}).finally(function(){$("review-analyze-position").disabled=false;});
}
function analyzeFullGame(){var url="https://www.chessigma.com/tools/analysis?pgn="+encodeURIComponent(reviewPgn);window.open(url,"_blank","noopener");}
async function loadUserGames(){
 var platform=$("import-platform").value,username=$("import-username").value.trim();
 if(!username){status("Enter a username first.");return;}
 $("import-user-btn").disabled=true;$("import-results").textContent="";status("Looking up public games…");
 try{
  var games=[];
  if(platform==="chesscom"){
   var prof=await fetch("https://api.chess.com/pub/player/"+encodeURIComponent(username)+"/games/archives");
   if(!prof.ok)throw new Error("Chess.com profile not found or unavailable (HTTP "+prof.status+").");
   var archives=(await prof.json()).archives||[];if(!archives.length)throw new Error("No public game archives found.");
   var recent=archives.slice(-3).reverse();
   for(var a=0;a<recent.length&&games.length<30;a++){var rr=await fetch(recent[a]);if(!rr.ok)continue;var data=await rr.json();(data.games||[]).slice().reverse().forEach(function(g){if(g.pgn&&games.length<30)games.push({pgn:g.pgn,white:g.white&&g.white.username,black:g.black&&g.black.username,result:g.white&&g.white.result,date:g.end_time,site:"Chess.com"});});}
  }else if(platform==="lichess"){
   var lr=await fetch("https://lichess.org/api/games/user/"+encodeURIComponent(username)+"?max=30&moves=true&tags=true",{headers:{"Accept":"application/x-ndjson"}});
   if(!lr.ok)throw new Error("Lichess profile not found or games are private (HTTP "+lr.status+").");
   var raw=await lr.text();raw.split("\n").filter(Boolean).forEach(function(line){try{var g=JSON.parse(line);if(g.pgn)games.push({pgn:g.pgn,white:g.players&&g.players.white&&g.players.white.user&&g.players.white.user.name,black:g.players&&g.players.black&&g.players.black.user&&g.players.black.user.name,result:g.status,site:"Lichess"});}catch(e){}});
  }else{
   throw new Error("WorldChess does not currently expose a verified public username-to-PGN archive endpoint. Export the game as PGN from WorldChess and use Choose PGN or paste it here.");
  }
  if(!games.length)throw new Error("No public games were returned for this username.");
  status("Found "+games.length+" public games. Select one to open Berserk review.");
  games.forEach(function(g,i){var row=document.createElement("div");row.className="import-game-row";var label=document.createElement("span");label.textContent=(g.white||"White")+" vs "+(g.black||"Black")+" · "+g.site;var btn=document.createElement("button");btn.className="button secondary";btn.textContent="Review game";btn.addEventListener("click",function(){openReview(g.pgn,g.site+" · "+(g.white||"White")+" vs "+(g.black||"Black"));});row.appendChild(label);row.appendChild(btn);$("import-results").appendChild(row);});
 }catch(e){status(e.message||String(e));}
 finally{$("import-user-btn").disabled=false;}
}
$("import-user-btn").addEventListener("click",loadUserGames);
$("import-pgn-btn").addEventListener("click",function(){openReview($("import-pgn").value,"PGN import");});
$("import-file").addEventListener("change",function(e){var file=e.target.files&&e.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){openReview(String(reader.result||""),file.name);};reader.onerror=function(){status("Could not read that PGN file.");};reader.readAsText(file);});
$("review-prev").addEventListener("click",function(){reviewPly=Math.max(0,reviewPly-1);renderReview();});
$("review-next").addEventListener("click",function(){reviewPly=Math.min(reviewMoves.length,reviewPly+1);renderReview();});
$("review-analyze-position").addEventListener("click",analyzePosition);
$("review-analyze-game").addEventListener("click",analyzeFullGame);
$("close-import-review").addEventListener("click",function(){$("import-review").hidden=true;if(reviewEngine){reviewEngine.terminate();reviewEngine=null;}});
window.addEventListener("berserk:open-review",function(e){openReview(e.detail&&e.detail.pgn,e.detail&&e.detail.title);});
})();