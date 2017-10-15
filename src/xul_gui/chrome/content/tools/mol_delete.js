// -*-Mode: C++;-*-
//
// Molecule delete tool
//


if (!cuemol.evtMgr) {
  cuemol.evtMgr = require("event").manager;
}

////////////////////////////////
// gMolDelDlg

( function () {

const histry_name = "cuemol2.ui.histories.mol_delete";
const pref = require("preferences-service");

var util = require("util");
var dlg = window.gMolDelDlg = new Object();

dlg.ctor = function ()
{
  this.mFromObjBox = null;

  this.mTargetSceneID = window.arguments[0];
  this.mTargetViewID = window.arguments[1];
  dd("MolDelDlg> target="+this.mTargetSceneID);

  var filter_fn = function (elem) {
    return cuemol.implIface(elem.type, "MolCoord");
  };

  this.mFromObjBox = new cuemolui.ObjMenuList(
    "del_obj",
    window, filter_fn,
    cuemol.evtMgr.SEM_OBJECT);
  this.mFromObjBox._tgtSceID = this.mTargetSceneID;

  this.mToObjBox = new cuemolui.ObjMenuList(
    "to_obj",
    window, filter_fn,
    cuemol.evtMgr.SEM_OBJECT);
  this.mToObjBox._tgtSceID = this.mTargetSceneID;

  var that = this;

  window.addEventListener("load", function(){
      try {that.onLoad();} catch (e) {debug.exception(e);} }, false);

  window.addEventListener("unload", function(){
      try {that.onUnload();} catch (e) {debug.exception(e);} }, false);

}

dlg.onLoad = function ()
{
  var that = this;

  this.mFromObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
  });
  this.mFromSelBox = document.getElementById('del_molsel');
  this.mFromSelBox.targetSceID = this.mTargetSceneID;

  ////

  if (this.mFromObjBox._widget.itemCount==0) {
    // no mol object in the scene
    document.documentElement.getButton("accept").disabled = true;
    this.mFromSelBox.disabled = true;
    return;
  }

  ////

  this.mFromObjBox._widget.selectedIndex = -1;

  var bOK = false;
  if (pref.has(histry_name+"_frommol")) {
    var prev_id = pref.get(histry_name+"_frommol");
    if (this.mFromObjBox.selectObject(prev_id))
      bOK = true;
  }  

  if (!bOK)
    this.mFromObjBox._widget.selectedIndex = 0;

  dd("*** Dlg.onLoad() OK.");
}

dlg.onUnload = function ()
{
  //delete this.mFromObjBox;
};

dlg.onObjBoxChanged = function (aEvent)
{
  dd("MolDelDlg> ObjSelChg: "+aEvent.target.id);
  if (aEvent.target.id=="del_obj") {
    var mol = this.mFromObjBox.getSelectedObj();
    if (mol)
      this.mFromSelBox.molID = mol.uid;
  }
};

////////////////////

dlg.onDialogAccept = function (event)
{
  let mgr = cuemol.getService("MolAnlManager");

  var fromSel = this.mFromSelBox.selectedSel;

  if (fromSel==null) {
    dd("MolDelDlg> invalid selection!!");
    util.alert(window, "Invalid selection.");
    return false;
  }

  var fromMol = this.mFromObjBox.getSelectedObj();
  if (fromMol==null) {
    dd("MolDelDlg> mol not selected!!");
    util.alert(window, "Mol is not selected.");
    return false;
  }

  // // EDIT TXN START //
  var scene = fromMol.getScene();
  scene.startUndoTxn("Delete atoms");
  try {
    mgr.deleteAtoms(fromMol, fromSel);
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Error, delete atoms was failed: "+cuemol.getErrMsg());
    return false;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  pref.set(histry_name+"_frommol", fromMol.uid);

  // Save selection history
  util.selHistory.append(fromSel.toString());

  return true;
};


} )();

window.gMolDelDlg.ctor();

