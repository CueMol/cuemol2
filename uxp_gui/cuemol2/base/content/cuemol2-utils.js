// -*-Mode: C++;-*-
//
// $Id: cuemol2-utils.js,v 1.19 2011/05/01 09:28:03 rishitani Exp $
//

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

// Cu.import("resource://app/resources/jpk_hns.js");
// Cu.import("resource://app/components/appboots.js");
Cu.import("resource://gre/modules/appboots.js");

var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);

const XPCCUEMOL_CID = "@cuemol.org/XPCCueMol";
if (!(XPCCUEMOL_CID in Cc)) {
  try {
    dump("FATAL ERROR!!\nCueMol XPCOM component is not registered!!\n");
    alert("FATAL ERROR!!\nCueMol XPCOM component is not registered!!");
  }
  catch (e) {
  }
  appStartup.quit(appStartup.eForceQuit);
}

var cuemol = require("cuemol");

var cuemolui = new Object();

const debug = require("debug_util");
const dd = debug.dd;
const util = require("util");

 /*
function extendClass(subclass, superclass)
{
  var f = function() {};
  f.prototype = superclass.prototype;
  subclass.prototype = new f();
  subclass.prototype.constructor = subclass;
  subclass.superclass = superclass.prototype;
  if (superclass.prototype.constructor == Object.prototype.constructor) {
    superclass.prototype.constructor = superclass;
  }
};
function extendClass(s, c)
{
  function f(){};
  f.prototype = s.prototype;
  c.prototype = new f();
  c.prototype.__super__ = s.prototype;
  c.prototype.__super__.constructor = s;
  c.prototype.constructor = c;
  return c;
};
*/

////////////////////////////////

cuemolui.onPaintColShowing = function (aEvent)
{
  try {
    var scene_id = gQm2Main.mMainWnd.getCurrentSceneID();
    var menu = aEvent.currentTarget.menupopup;
    cuemolui.populateStyleMenus(scene_id, menu, /Paint$/, true);
  } catch (e) { debug.exception(e); }
};

cuemolui.populateStyleMenus = function (scene_id, menu, regexp, bClear)
{
  if (bClear)
    util.clearMenu(menu);

  if (regexp==null) {
    var item = util.appendMenu(document, menu, "", "(no styles)");
    //item.disabled = true;
    item.setAttribute("disabled", "true");
    return;
  }

  var stylem = cuemol.getService("StyleManager");

  json = stylem.getStyleNamesJSON(0);
  //dd("JSON: "+json);
  var names = JSON.parse(json);

  //dd("StyleSet JSON (system): "+stylem.getStyleSetsJSON(0));

  if (scene_id!=null) {
    json = stylem.getStyleNamesJSON(scene_id);
    //dd("JSON: "+json);
    names = names.concat( JSON.parse(json) );
    //dd("StyleSet JSON (scene): "+stylem.getStyleSetsJSON(scene_id));
  }
  
  //dd("MenuElem: "+menu.localName);
  var nitems = names.length;
  var name, value, label, res;
  for (var i=0; i<nitems; ++i) {
    name = names[i].name;
    res = name.match(regexp);
    if (res==null) {
      //dd("Style "+name+" no match: "+regexp);
      continue;
    }
    value = "style-"+name;
    label = names[i].desc;
    if (!label)
      label = name;
    var item = util.appendMenu(document, menu, value, label);
    item.setAttribute("remove_re", regexp);

    dd("PaintColAddMenu = "+name+", desc="+label);
  }
};

//////////////////////////
// selection utilities

/// Auto-create selection renderer
cuemolui.autoCreateSelRend = function (aMol)
{
  var sel_rend = aMol.getRendererByType("*selection");
  if (!sel_rend)
    sel_rend = aMol.createRenderer("*selection");
}

cuemolui.chgMolSel = function (aMol, aSelStr, aTxnMsg, aSaveHis)
{
  var scene = aMol.getScene();

  // EDIT TXN START //
  scene.startUndoTxn(aTxnMsg);

  try {
    cuemolui.autoCreateSelRend(aMol);
    aMol.sel = cuemol.makeSel(aSelStr, scene.uid);
  }
  catch(e) {
    dd("cuemolui.chgMolSel ("+aSelStr+") error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  if (aSaveHis) {
    // Save to history
    util.selHistory.append(aSelStr);
  }
}

cuemolui.chgMolSelObj = function (aMol, aSelObj, aTxnMsg, aSaveHis)
{
  var scene = aMol.getScene();

  // EDIT TXN START //
  scene.startUndoTxn(aTxnMsg);

  try {
    cuemolui.autoCreateSelRend(aMol);
    aMol.sel = aSelObj;
  }
  catch(e) {
    dd("cuemolui.chgMolSelObj error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  if (aSaveHis) {
    try {
      // Save to history
      util.selHistory.append(aSelObj.toString());
    }
    catch (e) {
    }
      
  }
}

/// select around the current selected atoms
cuemolui.molSelAround = function (aMol, aDist, aByres)
{
  if (!aMol) return;
  var scene = aMol.getScene();
  var selstr = aMol.sel.toString();

  if (selstr=="") {
    dd("molSelAround> error: curr sel is empty.");
    return;
  }

  var newsel = "", res;
  for (;;) {
    // form I: byres ( XXXX around N.NN )
    res = selstr.match(/byres\s*\(\s*(.+)\s+around\s+([\d\.]+)\s*\)/);
    if (res!=null) {
      if (aByres)
        newsel = "byres "+res[1]+" around "+aDist;
      else
        newsel = res[1]+" around "+aDist;
      break;
    }
    
    // form II: byres XXXX around N.NN
    res = selstr.match(/byres\s+(.+)\s+around\s+([\d\.]+)/);
    if (res!=null) {
      if (aByres)
        newsel = "byres "+res[1]+" around "+aDist;
      else
        newsel = res[1]+" around "+aDist;
      break;
    }
    
    // form III: XXXX around N.NN
    res = selstr.match(/(.+)\s+around\s+([\d\.]+)/);
    if (res!=null) {
      if (aByres)
        newsel = "byres "+res[1]+" around "+aDist;
      else
        newsel = res[1]+" around "+aDist;
      break;
    }
    
    if (aByres)
      newsel = "byres "+selstr+" around "+aDist;
    else
      newsel = selstr+" around "+aDist;
    break;
  }

  dd("Around newsel="+newsel);

  cuemolui.chgMolSel(aMol, newsel, "Around mol selection", true);

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Around mol selection");

  try {
    aMol.sel = cuemol.makeSel(newsel);
  }
  catch(e) {
    dd("WS> SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  // Save to history
  util.selHistory.append(newsel);
   */
};

/// Toggle bysidech
cuemolui.molSelToggleSideCh = function (aMol)
{
  if (!aMol) return;
  var scene = aMol.getScene();
  if (!('sel' in aMol))
    return;
  var selstr = aMol.sel.toString();

  if (selstr=="") {
    dd("molSelToggleSideCh> error: curr sel is empty.");
    return;
  }

  var newsel = "";
  var res;

  // form: bysidech XXXX
  res = selstr.match(/bysidech\s+(.+)/);
  if (res!=null) {
    newsel = res[1];
  }
  else {
    newsel = "bysidech "+selstr;
  }

  cuemolui.chgMolSel(aMol, newsel, "Toggle bysidech", true);

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Toggle bysidech");

  try {
    aMol.sel = cuemol.makeSel(newsel);
  }
  catch(e) {
    dd("WS> SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
   */
};

/// Invert selection
cuemolui.molSelInvert = function (aMol)
{
  if (!aMol) return;
  var scene = aMol.getScene();
  if (!('sel' in aMol))
    return;

  var selstr = aMol.sel.toString();
  var invsel;
  if (selstr=="") {
    invsel = "*";
  }
  else {
    var res = selstr.match(/!\s*\((.+)\)/);
    if (res==null)
      invsel = "!("+selstr+")";
    else 
      invsel = res[1];
  }
  dd("MakeInvSel invsel="+invsel);

  cuemolui.chgMolSel(aMol, invsel, "Invert mol selection", false);

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Invert mol selection");

  try {
    aMol.sel = sel;
  }
  catch(e) {
    dd("WS> SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
*/
};

/// Clear selection
cuemolui.molSelClear = function (aMol)
{
  if (!aMol) return;

  var scene = aMol.getScene();
  if (!('sel' in aMol))
    return;

  cuemolui.chgMolSel(aMol, null, "Unselect molecule", false);

/*
  // EDIT TXN START //
  scene.startUndoTxn("Unselect molecule");

  try {
    //var sel = cuemol.createObj("SelCommand");
    aMol.sel = cuemol.makeSel();
  }
  catch(e) {
    dd("> SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
*/
};

cuemolui.replacePDBURL = function (aURL, aPdbId)
{
  var retval = aURL.replace(/\{code\}/g, aPdbId);

  var mid = aPdbId.substr(1,2);
  retval = retval.replace(/\{mid\}/g, mid);

  return retval;
};

