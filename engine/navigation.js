(function(){
  "use strict";
  var views=Array.from(document.querySelectorAll("[data-app-view]"));
  var nav=Array.from(document.querySelectorAll("[data-view-target]"));
  var review=document.getElementById("import-review");
  function setView(name){
    views.forEach(function(view){view.hidden=view.getAttribute("data-app-view")!==name;});
    if(review){
      if(name!=="analysis"){
        if(!review.hidden)review.dataset.wasOpen="true";
        review.hidden=true;
      }else if(review.dataset.wasOpen==="true")review.hidden=false;
    }
    nav.forEach(function(button){var active=button.getAttribute("data-view-target")===name;button.classList.toggle("active",active);button.setAttribute("aria-current",active?"page":"false");});
    if(name==="live")window.dispatchEvent(new Event("berserk:live-visible"));
    else window.dispatchEvent(new Event("berserk:live-hidden"));
  }
  nav.forEach(function(button){button.addEventListener("click",function(){setView(button.getAttribute("data-view-target"));});});
  document.querySelectorAll("[data-tab-group]").forEach(function(button){
    button.addEventListener("click",function(){
      var group=button.getAttribute("data-tab-group"),target=button.getAttribute("data-tab-target");
      document.querySelectorAll('[data-tab-group="'+group+'"]').forEach(function(other){var active=other===button;other.classList.toggle("active",active);other.setAttribute("aria-selected",active?"true":"false");});
      document.querySelectorAll('[data-tab-panel^="'+group+':"]').forEach(function(panel){panel.hidden=panel.getAttribute("data-tab-panel")!==group+":"+target;panel.classList.toggle("active",!panel.hidden);});
    });
  });
  var closeReview=document.getElementById("close-import-review");
  if(closeReview)closeReview.addEventListener("click",function(){if(review)review.dataset.wasOpen="false";});
  window.addEventListener("berserk:open-review",function(){if(review)review.dataset.wasOpen="true";setView("analysis");});
  setView("play");
})();