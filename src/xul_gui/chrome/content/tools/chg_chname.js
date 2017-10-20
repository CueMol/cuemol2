// -*-Mode: C++;-*-
//
// Change chain name tool
//

if (!cuemol.evtMgr) {
  cuemol.evtMgr = require("event").manager;
}

////////////////////////////////
// gChgChnmDlg

( function () {

const histry_name = "cuemol2.ui.histories.chg_chname";
const pref = require("preferences-service");

var util = require("util");
var dlg = window.gChgChnmDlg = new Object();

dlg.ctor = function ()
{
  this.mFromObjBox = null;

  this.mTargetSceneID = window.arguments[0];
  this.mTargetViewID = window.arguments[1];
  dd("ChgChnmDlg> target="+this.mTargetSceneID);

  var filter_fn = function (elem) {
    return cuemol.implIface(elem.type, "MolCoord");
  };

  this.mFromObjBox = new cuemolui.ObjMenuList(
    "from_obj",
    window, filter_fn,
    cuemol.evtMgr.SEM_OBJECT);
  this.mFromObjBox._tgtSceID = this.mTargetSceneID;

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

  this.mFromSelBox = document.getElementById('from_molsel');
  this.mFromSelBox.targetSceID = this.mTargetSceneID;

  this.mChNameBox = document.getElementById('to_chname');

  ////

  if (this.mFromObjBox._widget.itemCount==0) {
    // no mol object in the scene
    document.documentElement.getButton("accept").disabled = true;
    this.mFromSelBox.disabled = true;
    this.mChNameBox.disabled = true;
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
};

dlg.onObjBoxChanged = function (aEvent)
{
  dd("ChgChnm> ObjSelChg: "+aEvent.target.id);
  if (aEvent.target.id=="from_obj") {
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
    dd("ChgChnm> invalid selection!!");
    util.alert(window, "Invalid selection.");
    return false;
  }

  var fromMol = this.mFromObjBox.getSelectedObj();
  if (fromMol==null) {
    dd("ChgChnm> mol not selected!!");
    util.alert(window, "Mol is not selected.");
    return false;
  }

  var chnmbox  = document.getElementById("to_chname");
  var to_chname = chnmbox.value;
  if (to_chname=="") {
    util.alert(window, "New chain name is empty.");
    return false;
  }
  if (to_chname==" ") {
    let res = util.confirm(window, "Chain ID < > will be converted to <_>. Do you change the chain ID?");
    if (!res)
      return false;
    to_chname=="_"
  }

  // remove the WSs of both ends
  to_chname = to_chname.trim();
  if (to_chname.length>1) {
    let res = util.confirm(window, "Chain ID longer than 1 character does not conform the PDB format. Do you change the chain ID?");
    if (!res)
      return false;
  }

  // // EDIT TXN START //
  var scene = fromMol.getScene();
  scene.startUndoTxn("Change chain name");
  try {
    mgr.changeChainName(fromMol, fromSel, to_chname);
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Error, change chain name was failed: "+cuemol.getErrMsg());
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

window.gChgChnmDlg.ctor();

