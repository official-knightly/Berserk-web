(function () {
"use strict";
var $=function(id){return document.getElementById(id);};
var reviewGame=null, reviewBoard=null, reviewMoves=[], reviewPgn="", reviewTitle="", reviewPly=0, reviewEngine=null, reviewEvaluations=[], reviewGrades=[];
function status(message){$("import-status").textContent=message;}
function safeText(value){return String(value||"").replace(/[<>]/g,"");}
function pgnHeaders(pgn){var out={};String(pgn).replace(/^\[(\w+)\s+"([^"]*)"\]\s*$/gm,function(_,k,v){out[k]=v;});return out;}
function openReview(pgn,title){
 if(!pgn||!String(pgn).trim()){status("This game has no PGN to review.");return;}
 try{reviewGame=new Chess();if(!reviewGame.load_pgn(pgn,{sloppy:true}))throw new Error("The PGN could not be parsed.");}
 catch(e){status("Invalid PGN: "+e.message);return;}
 reviewPgn=pgn;reviewTitle=title||"Imported game";reviewMoves=reviewGame.history({verbose:true});reviewPly=0;reviewEvaluations=[];reviewGrades=[];renderEvaluationGraph([]);
 var h=pgnHeaders(pgn);
 $("import-review-title").textContent=reviewTitle;$("review-white").textContent=h.White||"White";$("review-black").textContent=h.Black||"Black";$("review-result").textContent=h.Result||"*";$("review-opening").textContent=h.Opening||h.ECO||"Imported game";if($("review-result-chip"))$("review-result-chip").textContent="Result · "+(h.Result||"*");if($("review-opening-detail"))$("review-opening-detail").textContent=h.Opening||h.ECO||"Not included in PGN";
 $("import-review").hidden=false;$("import-review").scrollIntoView({behavior:"smooth",block:"start"});
 if(!reviewBoard){reviewBoard=Chessboard("review-board",{position:"start",draggable:false,showNotation:true,pieceTheme:"https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"});}
 renderReview();if(reviewEngine)reviewEngine.terminate();
 reviewEngine=new BerserkEngine({onError:function(err){$("review-best").textContent="Engine unavailable: "+err.message;}});
 reviewEngine.ready.then(function(){$("review-best").textContent="Berserk is ready. Choose Analyze position to evaluate this move.";}).catch(function(){});
}
function drawReviewArrow(uci){
 var svg=$("review-arrow-layer");if(!svg||!reviewBoard)return;svg.textContent="";
 if(!uci||uci.length<4)return;
 var ns="http://www.w3.org/2000/svg",defs=document.createElementNS(ns,"defs"),marker=document.createElementNS(ns,"marker");
 marker.setAttribute("id","review-arrow-head");marker.setAttribute("markerWidth","5");marker.setAttribute("markerHeight","5");marker.setAttribute("refX","4");marker.setAttribute("refY","2.5");marker.setAttribute("orient","auto");
 var head=document.createElementNS(ns,"path");head.setAttribute("d","M0,0 L5,2.5 L0,5 Z");head.setAttribute("fill","#b7d4a8");marker.appendChild(head);defs.appendChild(marker);svg.appendChild(defs);
 function point(square){var file=square.charCodeAt(0)-97,rank=Number(square.charAt(1));return reviewBoard.orientation()==="black"?{x:7-file+.5,y:rank-1+.5}:{x:file+.5,y:8-rank+.5};}
 var a=point(uci.slice(0,2)),b=point(uci.slice(2,4)),line=document.createElementNS(ns,"line");
 line.setAttribute("x1",a.x);line.setAttribute("y1",a.y);line.setAttribute("x2",b.x);line.setAttribute("y2",b.y);line.setAttribute("stroke","#b7d4a8");line.setAttribute("stroke-width",".14");line.setAttribute("stroke-linecap","round");line.setAttribute("marker-end","url(#review-arrow-head)");svg.appendChild(line);
}
function renderEvaluationGraph(points){
 var svg=$("review-eval-graph"),line=$("review-eval-line"),area=$("review-eval-area");if(!svg||!line||!area)return;
 if(!points||!points.length){line.setAttribute("points","");area.setAttribute("d","");$("review-graph-state").textContent="Run full analysis to build graph";$("review-graph-plies").textContent="0 positions analyzed";svg.setAttribute("aria-label","Evaluation graph will appear after full game analysis");return;}
 var width=696,left=12,top=25,height=100,mid=75,scale=800;
 var coords=points.map(function(p,i){var x=left+(points.length===1?width/2:(i/(points.length-1))*width);var score=Math.max(-scale,Math.min(scale,p.score));var y=mid-(score/scale)*(height/2);return {x:x,y:y};});
 var poly=coords.map(function(p){return p.x.toFixed(1)+","+p.y.toFixed(1);}).join(" ");line.setAttribute("points",poly);
 area.setAttribute("d","M "+coords[0].x+" "+mid+" L "+coords.map(function(p){return p.x+" "+p.y;}).join(" L ")+" L "+coords[coords.length-1].x+" "+mid+" Z");
 $("review-graph-state").textContent="Engine analysis complete";$("review-graph-plies").textContent=points.length+" positions analyzed";svg.setAttribute("aria-label","Evaluation timeline based on "+points.length+" Berserk engine evaluations");
}
function renderReview(){
 var replay=new Chess();for(var i=0;i<reviewPly;i++)replay.move(reviewMoves[i]);
 reviewBoard.position(replay.fen(),false); 
 var arrow=$("review-arrow-layer");if(arrow)arrow.textContent="";
 $("review-ply-label").textContent=reviewPly===0?"Start position":("Move "+Math.ceil(reviewPly/2)+(reviewPly%2?" · White":" · Black"));
 $("review-prev").disabled=reviewPly===0;$("review-next").disabled=reviewPly>=reviewMoves.length;
 var list=$("import-review-moves");list.textContent="";
 var row=0;
 reviewMoves.forEach(function(m,i){var b=document.createElement("button");b.textContent=(i%2===0?(Math.floor(i/2)+1)+". ":"")+m.san;b.className=i===reviewPly-1?"active":"";var grade=reviewGrades[i];if(grade){b.classList.add("grade-"+grade.label.toLowerCase().replace(/\\s+/g,"-"));b.title=grade.label+(grade.loss===null?"":" · "+Math.round(grade.loss)+" cp loss");b.textContent+=" · "+grade.label;}b.addEventListener("click",function(){reviewPly=i+1;renderReview();});list.appendChild(b);});
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
 if(best&&best.length>=4){var cp2=new Chess(replay.fen());var m=cp2.move({from:best.slice(0,2),to:best.slice(2,4),promotion:best[4]||"q"});if(m){drawReviewArrow(best);$("review-best").textContent="Best move: "+m.san+" · depth "+(r.depth||"—");}else $("review-best").textContent="No legal best move returned.";}
 else $("review-best").textContent="No best move returned.";
 }).catch(function(e){$("review-best").textContent="Analysis failed: "+e.message;}).finally(function(){$("review-analyze-position").disabled=false;});
}
async function analyzeFullGame(){
 if(!reviewEngine){$("review-best").textContent="Berserk engine is not ready.";return;}
 var button=$("review-analyze-game");button.disabled=true;
 try{
  await reviewEngine.ready;
  var replay=new Chess(), grades=[], total=reviewMoves.length, evaluations=[];
  for(var i=0;i<total;i++){
   $("review-best").textContent="Berserk reviewing move "+(i+1)+" of "+total+"…";
   var beforeFen=replay.fen();
   var beforeResult=await reviewEngine.search(beforeFen,250,1,1000+i*2);
   var before=beforeResult.candidates&&beforeResult.candidates[0]?beforeResult.candidates[0].scoreCp:beforeResult.scoreCp;
   if(replay.turn()==="b")before=-before;
   replay.move({from:reviewMoves[i].from,to:reviewMoves[i].to,promotion:reviewMoves[i].promotion||"q"});
   var afterFen=replay.fen();
   var afterResult=await reviewEngine.search(afterFen,250,1,1001+i*2);
   var after=afterResult.candidates&&afterResult.candidates[0]?afterResult.candidates[0].scoreCp:afterResult.scoreCp;
   if(replay.turn()==="b")after=-after;
   var loss=Number.isFinite(before)&&Number.isFinite(after)?Math.max(0,reviewMoves[i].color==="b"?after-before:before-after):null;
   if(Number.isFinite(after))evaluations.push({ply:i+1,score:after});
   var label=loss===null?"Not rated":loss<=10?"Best":loss<=25?"Excellent":loss<=50?"Good":loss<=100?"Inaccuracy":loss<=200?"Mistake":"Blunder";
   grades.push({label:label,loss:loss});
   var moveButton=$("import-review-moves").children[i];
   if(moveButton){moveButton.title=label+(loss===null?"":" · "+Math.round(loss)+" cp loss");moveButton.classList.add("grade-"+label.toLowerCase().replace(/\s+/g,"-"));moveButton.textContent=moveButton.textContent.replace(/ · (Best|Excellent|Good|Inaccuracy|Mistake|Blunder|Not rated)$/,"")+" · "+label;}
  }
  reviewEvaluations=evaluations;reviewGrades=grades.slice();renderEvaluationGraph(reviewEvaluations);if($("review-analysis-state"))$("review-analysis-state").textContent="Complete";if($("review-reviewed-count"))$("review-reviewed-count").textContent=grades.length;if($("review-white-snapshot"))$("review-white-snapshot").textContent=$("review-white-accuracy").textContent;if($("review-black-snapshot"))$("review-black-snapshot").textContent=$("review-black-accuracy").textContent;
  var counts={Best:0,Excellent:0,Good:0,Inaccuracy:0,Mistake:0,Blunder:0};
  grades.forEach(function(g){if(counts[g.label]!==undefined)counts[g.label]++;});
  $("review-best").textContent="Full review complete · "+counts.Best+" best · "+counts.Excellent+" excellent · "+counts.Good+" good · "+counts.Inaccuracy+" inaccuracies · "+counts.Mistake+" mistakes · "+counts.Blunder+" blunders.";
 }catch(e){$("review-best").textContent="Full game analysis failed: "+e.message;}
 finally{button.disabled=false;}
}
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