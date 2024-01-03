// -*-Mode: C++;-*-
//
// Molecule merge tool
//


if (!cuemol.evtMgr) {
  cuemol.evtMgr = require("event").manager;
}

////////////////////////////////
// gMolMrgDlg

( function () {

const histry_name = "cuemol2.ui.histories.mol_merge";
const pref = require("preferences-service");

var util = require("util");
var dlg = window.gMolMrgDlg = new Object();

dlg.ctor = function ()
{
  this.mFromObjBox = null;
  this.mToObjBox = null;

  this.mTargetSceneID = window.arguments[0];
  this.mTargetViewID = window.arguments[1];
  dd("MolMrgDlg: target="+this.mTargetSceneID);

  var filter_fn = function (elem) {
    return cuemol.implIface(elem.type, "MolCoord");
  };

  this.mFromObjBox = new cuemolui.ObjMenuList(
    "from_obj",
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

  this.mChkCopy = document.getElementById("chkbox_copy");

  this.mFromObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
  });
  this.mToObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
  });

  this.mFromSelBox = document.getElementById('from_molsel');

  this.mFromSelBox.targetSceID = this.mTargetSceneID;

  ////

  if (this.mFromObjBox._widget.itemCount==0 ||
      this.mToObjBox._widget.itemCount==0) {
    // no mol object in the scene
    document.documentElement.getButton("accept").disabled = true;
    this.mFromSelBox.disabled = true;
    return;
  }

  ////

  this.mFromObjBox._widget.selectedIndex = -1;
  this.mToObjBox._widget.selectedIndex = -1;

  var bOK = false;
  if (pref.has(histry_name+"_frommol")) {
    //var prev_id = parseInt(pref.get(histry_name+"_refmol"));
    var prev_id = pref.get(histry_name+"_frommol");
    if (this.mFromObjBox.selectObject(prev_id))
      bOK = true;
  }  

  if (!bOK)
    this.mFromObjBox._widget.selectedIndex = 0;

  bOK = false;
  if (pref.has(histry_name+"_tomol")) {
    var prev_id = pref.get(histry_name+"_tomol");
    if (this.mToObjBox.selectObject(prev_id))
      bOK = true;
  }  

  if (!bOK) {
    // select a different item for to mol
    if (this.mToObjBox._widget.itemCount>1)
      this.mToObjBox._widget.selectedIndex = 1;
    else
      this.mToObjBox._widget.selectedIndex = 0;
  }
  
  dd("*** Dlg.onLoad() OK.");
}

dlg.onUnload = function ()
{
  delete this.mFromObjBox;
  delete this.mToObjBox;
};

dlg.onObjBoxChanged = function (aEvent)
{
  dd("MolMrg> ObjSelChg: "+aEvent.target.id);
  if (aEvent.target.id=="from_obj") {
    var mol = this.mFromObjBox.getSelectedObj();
    if (mol)
      this.mFromSelBox.molID = mol.uid;
  }
  else if (aEvent.target.id=="to_obj") {
    var mol = this.mToObjBox.getSelectedObj();
  }
};

////////////////////

dlg.onDialogAccept = function (event)
{
  let mgr = cuemol.getService("MolAnlManager");

  var fromSel = this.mFromSelBox.selectedSel;

  if (fromSel==null) {
    dd("MolMrg> invalid selection!!");
    util.alert(window, "Invalid selection.");
    return false;
  }

  var fromMol = this.mFromObjBox.getSelectedObj();
  var toMol = this.mToObjBox.getSelectedObj();
  if (fromMol==null || toMol==null) {
    dd("MolMrg> mol not selected!!");
    util.alert(window, "Mol is not selected.");
    return false;
  }

  var bcopy = this.mChkCopy.checked;

  // // EDIT TXN START //
  var scene = fromMol.getScene();
  scene.startUndoTxn("Merge molecule");
  try {
    //mgr.shiftResIndex(fromMol, fromSel, -1);
    //mgr.changeChainName(fromMol, fromSel, "B");

    mgr.copyAtoms(toMol, fromMol, fromSel);
    if (!bcopy) {
      mgr.deleteAtoms(fromMol, fromSel);
    }
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Error, merge molecule was failed: "+cuemol.getErrMsg());
    return false;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  pref.set(histry_name+"_frommol", fromMol.uid);
  pref.set(histry_name+"_tomol", toMol.uid);

  // Save selection history
  util.selHistory.append(fromSel.toString());

  delete fromMol;
  delete fromSel;
  delete toMol;
  delete toSel;

  return true;
};


} )();

window.gMolMrgDlg.ctor();

