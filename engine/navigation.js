(function(){
  "use strict";
  var views=Array.from(document.querySelectorAll("[data-app-view]"));
  var nav=Array.from(document.querySelectorAll("[data-view-target]"));
  function setView(name){
    views.forEach(function(view){view.hidden=view.getAttribute("data-app-view")!==name;});
    nav.forEach(function(button){var active=button.getAttribute("data-view-target")===name;button.classList.toggle("active",active);button.setAttribute("aria-current",active?"page":"false");});
    if(name==="live")window.dispatchEvent(new Event("berserk:live-visible"));
  }
  nav.forEach(function(button){button.addEventListener("click",function(){setView(button.getAttribute("data-view-target"));});});
  document.querySelectorAll("[data-tab-group]").forEach(function(button){
    button.addEventListener("click",function(){
      var group=button.getAttribute("data-tab-group"),target=button.getAttribute("data-tab-target");
      document.querySelectorAll('[data-tab-group="'+group+'"]').forEach(function(other){var active=other===button;other.classList.toggle("active",active);other.setAttribute("aria-selected",active?"true":"false");});
      document.querySelectorAll('[data-tab-panel^="'+group+':"]').forEach(function(panel){panel.hidden=panel.getAttribute("data-tab-panel")!==group+":"+target;panel.classList.toggle("active",!panel.hidden);});
    });
  });
  window.addEventListener("berserk:open-review",function(){setView("analysis");});
  setView("play");
})();