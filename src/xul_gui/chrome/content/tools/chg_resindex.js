// -*-Mode: C++;-*-
//
// Change residue index tool
//

if (!cuemol.evtMgr) {
  cuemol.evtMgr = require("event").manager;
}

////////////////////////////////
// gChgResIndDlg

( function () {

const histry_name = "cuemol2.ui.histories.chg_resindex";
const pref = require("preferences-service");

var util = require("util");
var dlg = window.gChgResIndDlg = new Object();

dlg.ctor = function ()
{
  this.mFromObjBox = null;

  this.mTargetSceneID = window.arguments[0];
  this.mTargetViewID = window.arguments[1];
  dd("ChgResIndDlg> target="+this.mTargetSceneID);

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

  this.mShiftNumBox = document.getElementById('resind_shift');
  this.mStartNumBox = document.getElementById('resind_start');

  this.mRadioBtn = document.getElementById('opt_resind');
  this.mRadioBtn.addEventListener("RadioStateChange", function(event){
    try {that.onRadioStateChange(event);} catch (e) {debug.exception(e);} }, false);
  ////

  if (this.mFromObjBox._widget.itemCount==0) {
    // no mol object in the scene
    document.documentElement.getButton("accept").disabled = true;
    this.mFromSelBox.disabled = true;
    this.mShiftNumBox.disabled = true;
    this.mStartNumBox.disabled = true;
    document.getElementById('opt_resind_shift').disabled = true;
    document.getElementById('opt_resind_start').disabled = true;
    return;
  }

  ////

  if (this.mRadioBtn.selectedIndex<0) {
    this.mRadioBtn.selectedIndex = 0;
  }
  this.updateState();

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

dlg.updateState = function ()
{
  if (this.mRadioBtn.selectedIndex==0) {
    // shift mode
    this.mShiftNumBox.disabled = false;
    this.mStartNumBox.disabled = true;
  }
  else {
    // start mode
    this.mShiftNumBox.disabled = true;
    this.mStartNumBox.disabled = false;
  }
};

dlg.onRadioStateChange = function (aEvent)
{
  dd("onRadioStateChange");
  this.updateState();
};

dlg.onObjBoxChanged = function (aEvent)
{
  dd("ChgResInd> ObjSelChg: "+aEvent.target.id);
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
    dd("ChgResInd> invalid selection!!");
    util.alert(window, "Invalid selection.");
    return false;
  }

  var fromMol = this.mFromObjBox.getSelectedObj();
  if (fromMol==null) {
    dd("ChgResInd> mol not selected!!");
    util.alert(window, "Mol is not selected.");
    return false;
  }

  var str_nshift = document.getElementById("resind_shift").value;
  
  var nshift = parseInt(str_nshift);
  if (isNaN(nshift) || nshift==0) {
    util.alert(window, "Invalid residue shift value: \""+str_nshift+"\"");
    return false;
  }

  // // EDIT TXN START //
  var scene = fromMol.getScene();
  scene.startUndoTxn("Shift residue index");
  try {
    //mgr.shiftResIndex(fromMol, fromSel, nshift);
    mgr.renumResIndex(fromMol, fromSel, nshift);
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Error: "+cuemol.getErrMsg());
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

window.gChgResIndDlg.ctor();

