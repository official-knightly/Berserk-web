(function(){
  "use strict";
  var root=document.getElementById("import-review-moves");
  if(!root)return;
  var names=["Brilliant","Great","Best","Excellent","Good","Inaccuracy","Mistake","Blunder","Book"];
  var files={Brilliant:"cls-brilliant.svg",Great:"cls-great.svg",Best:"cls-great.svg",Excellent:"cls-excellent.svg",Good:"cls-good.svg",Inaccuracy:"cls-inaccuracy.svg",Mistake:"cls-mistake.svg",Blunder:"cls-blunder.svg",Book:"cls-book.svg"};
  function refresh(){
    var buttons=Array.from(root.querySelectorAll("button"));
    var counts={Best:0,Excellent:0,Good:0,Inaccuracy:0,Mistake:0,Blunder:0};
    var totals={w:[],b:[]},mistakes=[];
    buttons.forEach(function(button,index){
      var label=names.find(function(name){return button.classList.contains("grade-"+name.toLowerCase());});
      if(!label){var match=button.textContent.match(/ · (Brilliant|Great|Best|Excellent|Good|Inaccuracy|Mistake|Blunder|Book)$/);if(match)label=match[1];}
      if(!label)return;
      if(counts[label]!==undefined)counts[label]++;
      if(!button.querySelector("img.review-grade-icon")){
        var icon=document.createElement("img");icon.className="review-grade-icon";icon.src="./assets/classification/"+files[label];icon.alt=label;icon.title=label;button.insertBefore(icon,button.firstChild);
      }
      var lossMatch=button.title.match(/(\d+)\s*cp\s*loss/i);
      if(lossMatch){var loss=Number(lossMatch[1]);totals[index%2===0?"w":"b"].push(Math.max(0,Math.min(100,100*Math.exp(-loss/300))));}
      if(["Inaccuracy","Mistake","Blunder"].indexOf(label)>=0)mistakes.push((Math.floor(index/2)+1)+(index%2===0?". ":"... ")+button.textContent.replace(/ · (Brilliant|Great|Best|Excellent|Good|Inaccuracy|Mistake|Blunder|Book)$/,"").trim()+" — "+label);
    });
    function avg(a){return a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length)+"%":"—";}
    var w=document.getElementById("review-white-accuracy"),b=document.getElementById("review-black-accuracy");
    if(w)w.textContent=avg(totals.w);if(b)b.textContent=avg(totals.b);
    var summary=document.getElementById("review-accuracy-summary");
    if(summary&&buttons.length)summary.textContent="White: "+avg(totals.w)+" · Black: "+avg(totals.b)+". Estimates are derived from Berserk centipawn loss, not official platform accuracy.";
    var mistake=document.getElementById("review-mistake-summary");
    if(mistake&&buttons.length)mistake.textContent=mistakes.length?mistakes.join(" · "):"No inaccuracies, mistakes or blunders were recorded in the completed engine review.";
  }
  new MutationObserver(refresh).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","title"]});
  refresh();
})();