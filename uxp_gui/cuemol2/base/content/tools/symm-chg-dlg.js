////////////////////////////////
//

( function () {

var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 

var util = require("util");
var dlg = window.gDlg = new Object();

dlg.ctor = function ()
{
  var that = this;

  window.addEventListener("load", function(){
      try {that.onLoad();} catch (e) {debug.exception(e);} }, false);

  window.addEventListener("unload", function(){
      try {that.onUnload();} catch (e) {debug.exception(e);} }, false);

  window.addEventListener("dialogaccept", function(){
      try {return that.onDialogAccept();} catch (e) {debug.exception(e);} }, false);

  this.mTgtObj = args.target;
  this.mXi = this.mTgtObj.getExtData("CrystalInfo");
  this._bCreate = false;

  if (!this.mXi) {
    // create new crystal info
    this.mXi = cuemol.createObj("CrystalInfo");
    this._bCreate = true;
  }

  this.mSymmMgr = cuemol.getService("SymmOpManager");
  this._bLatUsrChg = true;
  this._bSgUsrChg = true;
};

dlg.onLoad = function ()
{
  var that = this;

  this.mLatList = document.getElementById("xtal-symm-lattice");
  this.mLatList.addEventListener("select", function(ev) {
	  try {return that.onLatChg(ev);} catch (e) {debug.exception(e);}
      },
      false);
  
  this.mSgList = document.getElementById("xtal-symm-spcgrp");
  this.mSgList.addEventListener("select", function(ev) {
	  try {return that.onSgChg(ev);} catch (e) {debug.exception(e);}
      },
      false);

  this.mSgNo = document.getElementById("xtal-symm-sgnum");

  this.mCellA = document.getElementById("xtal-cell-a");
  this.mCellB = document.getElementById("xtal-cell-b");
  this.mCellC = document.getElementById("xtal-cell-c");

  this.mCellAlp = document.getElementById("xtal-cell-alp");
  this.mCellBet = document.getElementById("xtal-cell-bet");
  this.mCellGam = document.getElementById("xtal-cell-gam");

  this.mRCell = document.getElementById("xtal-symm-rcell");
  this.mRCell.addEventListener("command", function(ev) {
    try {return that.onRCellChg(ev);} catch (e) {debug.exception(e);}
  }, false);

  this.updateWidgets();

  dd("*** Dlg.onLoad() OK.");
};

/// xtal info --> widgets (initialization)
dlg.updateWidgets = function ()
{
  this.mCellA.value = this.mXi.a;
  this.mCellB.value = this.mXi.b;
  this.mCellC.value = this.mXi.c;

  this.mCellAlp.value = this.mXi.alpha;
  this.mCellBet.value = this.mXi.beta;
  this.mCellGam.value = this.mXi.gamma;

  this._bLatUsrChg = false;
  util.selectMenuListByValue(this.mLatList, this.mXi.lattice);
  dd("bLatUsrChg: "+this._bLatUsrChg);
  this.chgLat();
  this._bLatUsrChg = true;
};

dlg.onUnload = function ()
{
  this.mSymmMgr = null;
  this.mXi = null;
};

dlg.onLatChg = function (event)
{
  if (!this._bLatUsrChg) {
    this._bLatUsrChg = true;
    return;
  }
  this.chgLat();
};

dlg.chgLat = function ()
{
  dd("###### changeLattice");
  var sel = this.mLatList.selectedItem.value;
  var json = this.mSymmMgr.getSgNamesJSON(sel);
  dd("GetSgNames: "+json);
  var sglist;
  try {
    sglist = JSON.parse(json);
  }
  catch (e) {
    debug.exception(e);
    return;
  }

  util.clearMenu(this.mSgList.menupopup);
  var that = this;
  sglist.forEach( function (e) {
    util.appendMenu(document, that.mSgList.menupopup, e.id, e.cname);
  });
  if (!util.selectMenuListByValue(this.mSgList, this.mXi.nsg)) {
    this.mSgList.selectedIndex = 0;
  }
};

dlg.onSgChg = function (event)
{
  this.mSgNo.value = this.mSgList.selectedItem.value;
  this.restrCell(this.mRCell.checked);
};

dlg.onRCellChg = function (event)
{
  this.restrCell(this.mRCell.checked);
};

dlg.restrCell = function (bRestr)
{
  var lat = this.mLatList.selectedItem.value;

  this.mCellA.disabled = false;
  this.mCellB.disabled = false;
  this.mCellC.disabled = false;
  this.mCellAlp.disabled = false;
  this.mCellBet.disabled = false;
  this.mCellGam.disabled = false;

  if (!bRestr)
    return;

  switch (lat) {
  case "TRICLINIC":
    break;
  case "MONOCLINIC":
    this.mCellAlp.disabled = true;
    this.mCellAlp.value = 90;
    this.mCellGam.disabled = true;
    this.mCellGam.value = 90;
    break;

  case "ORTHORHOMBIC":
    this.mCellAlp.disabled = true;
    this.mCellBet.disabled = true;
    this.mCellGam.disabled = true;
    this.mCellAlp.value = 90;
    this.mCellBet.value = 90;
    this.mCellGam.value = 90;
    break;

  case "TETRAGONAL":
    this.mCellAlp.disabled = true;
    this.mCellBet.disabled = true;
    this.mCellGam.disabled = true;
    this.mCellAlp.value = 90;
    this.mCellBet.value = 90;
    this.mCellGam.value = 90;
    // A==B
    this.mCellB.disabled = true;
    this.mCellB.value = this.mCellA.value;
    break;

  case "CUBIC":
    this.mCellAlp.disabled = true;
    this.mCellBet.disabled = true;
    this.mCellGam.disabled = true;
    this.mCellAlp.value = 90;
    this.mCellBet.value = 90;
    this.mCellGam.value = 90;
    // A==B==C
    this.mCellB.disabled = true;
    this.mCellB.value = this.mCellA.value;
    this.mCellC.disabled = true;
    this.mCellC.value = this.mCellA.value;
    break;

  case "HEXAGONAL":
  case "TRIGONAL": // trigonal includes rhombohedral (in H/R lattices)
    let sg = this.mSgList.selectedItem.label;
    if (sg && sg.indexOf("R")==0) {
      // rhombohedral in R lattice
      // A==B==C
      this.mCellB.disabled = true;
      this.mCellB.value = this.mCellA.value;
      this.mCellC.disabled = true;
      this.mCellC.value = this.mCellA.value;
      break;
    }

    this.mCellAlp.disabled = true;
    this.mCellBet.disabled = true;
    this.mCellGam.disabled = true;
    this.mCellAlp.value = 90;
    this.mCellBet.value = 90;
    this.mCellGam.value = 120;
    // A==B
    this.mCellB.disabled = true;
    this.mCellB.value = this.mCellA.value;

    break;
  }

};

dlg.onDialogAccept = function (event)
{
  var cell_a = this.mCellA.value;
  var cell_b = this.mCellB.value;
  var cell_c = this.mCellC.value;
  var cell_alp = this.mCellAlp.value;
  var cell_bet = this.mCellBet.value;
  var cell_gam = this.mCellGam.value;
  var tgt_id = this.mTgtObj.uid;
  var nsg = this.mSgList.selectedItem.value;

  if (!this._bCreate) {
    if (nsg==this.mXi.nsg &&
	util.isNearReal(cell_a, this.mXi.a) &&
	util.isNearReal(cell_b, this.mXi.b) &&
	util.isNearReal(cell_c, this.mXi.c) &&
	util.isNearReal(cell_alp, this.mXi.alpha) &&
	util.isNearReal(cell_bet, this.mXi.beta) &&
	util.isNearReal(cell_gam, this.mXi.gamma)) {
      // not changed
      dd("SymmChgDlg: not changed");
      return;
    }
  }
  
  var scene = this.mTgtObj.getScene();

  // EDIT TXN START //
  scene.startUndoTxn("Change symminfo");

  try {
    this.mSymmMgr.changeXtalInfo(tgt_id,
				 cell_a, cell_b, cell_c,
				 cell_alp, cell_bet, cell_gam,
				 nsg);
  }
  catch (e) {
    dd("Error: "+e);
    debug.exception(e);
    util.alert(window, "Failed to change symminfo");
    scene.rollbackUndoTxn();
    return;
  }

  // EDIT TXN END //
  scene.commitUndoTxn();
  return true;
};

} )();

window.gDlg.ctor();

