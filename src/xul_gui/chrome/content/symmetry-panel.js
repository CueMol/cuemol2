/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
*/


( function () {

var html = require("html-cons");
var symm = cuemolui.panels.symm = new Object();

// panel's ID
symm.id = "symm";
  
symm.collapsed = true;
symm.command_id = "menu-symm-panel-toggle";
  
symm.mSelector = new cuemolui.ObjMenuList(
  "symm_object_selector", window,
  function (elem) {
    if (cuemol.implIface(elem.type, "MolCoord")) return true;
    if (cuemol.implIface(elem.type, "DensityMap")) return true;
    return false;
  },
  cuemol.evtMgr.SEM_OBJECT);

window.addEventListener("load", function(){symm.onLoad();}, false);
window.addEventListener("unload", function() {symm.onUnLoad();}, false);

symm.onLoad = function ()
{
  this.mSpcGrp = document.getElementById("symm_spacegrp");
  this.mAlpha = document.getElementById("symm_alpha");
  this.mBeta = document.getElementById("symm_beta");
  this.mGamma = document.getElementById("symm_gamma");

  this.mLattice = document.getElementById("symm_lattice");
  this.mCella = document.getElementById("symm_cella");
  this.mCellb = document.getElementById("symm_cellb");
  this.mCellc = document.getElementById("symm_cellc");

  this.mChgBtn = document.getElementById("symm-panel-change");
  this.mShowSymmBtn = document.getElementById("symm-panel-showsymm");
  this.mShowCellBtn = document.getElementById("symm-panel-showcell");

  var that = this;

  var mainWnd = this._mainWnd = document.getElementById("main_view");

  this.mSelector.addSelChanged(function(aEvent) {
    try {
      that.targetChanged(aEvent);
    }
    catch (e) { debug.exception(e); }
  });

  this.mSelector.addObjChgListener("crystalinfo", function() {
    try {
      that.symmChanged();
    }
    catch (e) { debug.exception(e); }
  });

  this.setDisabled(true);
};

symm.onUnLoad = function ()
{
};

symm.targetChanged = function (aEvent)
{
  this.updateWidget();
};

symm.symmChanged = function ()
{
  //dd("%%% symm changed");
  this.updateWidget();
};

symm.updateWidget = function ()
{
  let obj = this.mSelector.getSelectedObj();
  if (!obj) {
    this.setDisabled(true);
    return;
  }
  
  let xi = obj.getExtData("CrystalInfo");
  //dd("symmPanel symminfo: "+xi);
  if (!xi) {
    this.setDisabled(true);
    this.mChgBtn.disabled = false;
    return;
  }

  this.setDisabled(false);
  //dd("symmPanel a="+xi.a);
  //dd("symmPanel b="+xi.b);
  //dd("symmPanel c="+xi.c);
  if (xi.a<0.1||xi.b<0.1||xi.c<0.1) {
    // cell size is too small --> disable buttons
    this.mShowSymmBtn.disabled = true;
    this.mShowCellBtn.disabled = true;
  }
  else if (cuemol.instanceOf(obj, "MolCoord")) {
    // MolCoord --> all functions are available
    //this.mChgBtn.disabled = false;
    //this.mShowSymmBtn.disabled = false;
    //this.mShowCellBtn.disabled = false;
  }
  else {
    // Density map etc --> only the show-cell is available
    this.mChgBtn.disabled = true;
    this.mShowSymmBtn.disabled = true;
    //this.mShowCellBtn.disabled = false;
  }

  let lat = xi.lattice;
  //dd("symmPanel symminfo: "+lat);

  // $("#symm_lattice").text(lat.substr(0, 1) + lat.substr(1).toLowerCase());
  html.replace(this.mLattice,
               html.text(document, lat.substr(0, 1) + lat.substr(1).toLowerCase()));
  html.replace(this.mSpcGrp,
               this.formatSg(xi.hm_spacegroup));

  // $("#symm_cella").text(this.formatNum(xi.a));
  // $("#symm_cellb").text(this.formatNum(xi.b));
  // $("#symm_cellc").text(this.formatNum(xi.c));
  html.replace(this.mCella, html.text(document, this.formatNum(xi.a)));
  html.replace(this.mCellb, html.text(document, this.formatNum(xi.b)));
  html.replace(this.mCellc, html.text(document, this.formatNum(xi.c)));
  
  html.replace(this.mAlpha, html.text(document, this.formatNum(xi.alpha)));
  html.replace(this.mBeta,  html.text(document, this.formatNum(xi.beta)));
  html.replace(this.mGamma, html.text(document, this.formatNum(xi.gamma)));
  
  xi = null;
};
 
symm.formatNum = function (aNum)
{
  return aNum.toFixed(2);
};

symm.formatSg = function (aSg)
{
  var ll = aSg.split(" ");
  var res = new Array();
  res.push(html.italic(document, ll.shift() ));

  ll.forEach( function (e) {
    if (e.length==2) {
      res.push( html.text(document, e.substr(0, 1)) );
      res.push( html.sub(document, e.substr(1)) );
    }
    else
      res.push( html.text(document, e) );
  });

  return res;
  //return aSg;
};

symm.setDisabled = function (aValue)
{
  if (aValue) {
    // All buttons are disabled
    //$("#symm_lattice").text("Unknown");
    //$("#symm_spacegrp").text("Unknown");
    //$("#symm_cella").text("-");
    //$("#symm_cellb").text("-");
    //$("#symm_cellc").text("-");

    html.replace(this.mLattice, html.text(document, "Unknown"));
    html.replace(this.mSpcGrp, html.text(document, "Unknown"));

    html.replace(this.mCella, html.text(document, "-"));
    html.replace(this.mCellb, html.text(document, "-"));
    html.replace(this.mCellc, html.text(document, "-"));

    html.replace(this.mAlpha, html.text(document, "-"));
    html.replace(this.mBeta,  html.text(document, "-"));
    html.replace(this.mGamma, html.text(document, "-"));

    this.mChgBtn.disabled = true;
    this.mShowSymmBtn.disabled = true;
    this.mShowCellBtn.disabled = true;
  }
  else {
    // All buttons are enabled
    this.mChgBtn.disabled = false;
    this.mShowSymmBtn.disabled = false;
    this.mShowCellBtn.disabled = false;
  }
};
  
symm.showUnitCell = function ()
{
  var obj = this.mSelector.getSelectedObj();
  if (!obj) {
    this.setDisabled(true);
    return;
  }

  var scene = obj.getScene();

  const type = "*unitcell";
  var rend;
  rend = obj.getRendererByType(type);
  if (rend)
    return;
  
  // EDIT TXN START //
  scene.startUndoTxn("Show unitcell");

  try {
    // create new renderer
    rend = obj.createRenderer(type);
    rend.name = "unitcell";
  }
  catch (e) {
    dd("*** Cannot create unitcell renderer Reason : "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

};


symm.showSymmRend = function (aEvent)
{
  var obj = this.mSelector.getSelectedObj();
  if (!obj) {
    this.setDisabled(true);
    return;
  }

  var scene = obj.getScene();

  var tgtid = aEvent.target.id;
  if (tgtid=="symm-panel-showsymm-around20") {
    extent = 20;
  }
  else if (tgtid=="symm-panel-showsymm-around50") {
    extent = 50;
  }
  else if (tgtid=="symm-panel-showsymm-around100") {
    extent = 100;
  }
  else if (tgtid=="symm-panel-showsymm-around200") {
    extent = 200;
  }
  else {
    extent = -1;
  }

  var vcenter = null;
  if (extent>0) {
    //var view = document.getElementById("main_view").currentViewW;
    //vcenter = view.getViewCenter();
    vcenter = document.getElementById("main_view").viewCenter;
  }

  const type = "*symm";
  var rend;
  rend = obj.getRendererByType(type);

  // EDIT TXN START //
  scene.startUndoTxn("Show sym mol");

  try {

    if (rend==null) {
      // create new renderer
      rend = obj.createRenderer(type);
      rend.name = "symm";
    }

    if (extent>0) {
      rend.extent = extent;
      rend.unitcell = false;
      rend.autoupdate = true;
      rend.center = vcenter;
    }
    else {
      rend.unitcell = true;
      rend.autoupdate = false;
    }

  }
  catch (e) {
    dd("*** Cannot create symm renderer Reason : "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

};

symm.changeSymm = function ()
{
  //window.alert("noimpl");

  var obj = this.mSelector.getSelectedObj();
  if (!obj) {
    this.setDisabled(true);
    return;
  }

  var xi = obj.getExtData("CrystalInfo");
  if (!xi) {
    var res = util.confirm(window, "Create symminfo?");
    if (!res)
      return;
  }

  var style = "chrome,resizable=yes,dependent,centerscreen,modal";
  var parent_win = window;
  
  var args = Cu.getWeakReference({target: obj});

  var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

  var win = ww.openWindow(parent_win,
                          "chrome://cuemol2/content/tools/symm-chg-dlg.xul",
                          null, style, args);
};

} )();

