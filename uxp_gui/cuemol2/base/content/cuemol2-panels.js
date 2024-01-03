//
//  cuemol2-panels.js
//  (Left side) panel registration and loading code
//
//  $Id: cuemol2-panels.js,v 1.13 2011/02/19 14:43:43 rishitani Exp $

if (!('panels' in cuemolui)) {

cuemolui.panels = new Object();

window.addEventListener("load", function() {
  //alert("cuemol2-panels.js register\n");
  var sidepanel = document.getElementById("left_side_panel");

  sidepanel.registerPanel(cuemolui.panels.workspace);
  sidepanel.registerPanel(cuemolui.panels.molstruct);
  sidepanel.registerPanel(cuemolui.panels.selection);
  sidepanel.registerPanel(cuemolui.panels.paint);
  sidepanel.registerPanel(cuemolui.panels.symm);
  sidepanel.registerPanel(cuemolui.panels.denmap);
  sidepanel.registerPanel(cuemolui.panels.fakedial);
  sidepanel.registerPanel(cuemolui.panels.anim);

  if (!sidepanel.loadSession("left"))
    sidepanel.restoreDefault();
  sidepanel.realize();
  sidepanel.saveSession("left");

}, false);

dd("cuemol2-panels.js loaded.");

}

//dd("cuemol2-panels.js: " + !('panels' in cuemolui));
//alert("cuemol2-panels.js loaded.");
