// -*-Mode: C++;-*-
// $Id: ssm_sup.js,v 1.13 2011/04/29 17:38:47 rishitani Exp $
//

cuemol.evtMgr = require("event").manager;

////////////////////////////////
// gSSMSupDlg

( function () {

const histry_name = "cuemol2.ui.histories.mol_superpose";
const pref = require("preferences-service");

var util = require("util");
var dlg = window.gSSMSupDlg = new Object();

dlg.ctor = function ()
{
  this.mRefObjBox = null;
  this.mMovObjBox = null;

  this.mTargetSceneID = window.arguments[0];
  this.mTargetViewID = window.arguments[1];
  dd("SSMSupDlg: target="+this.mTargetSceneID);

  var filter_fn = function (elem) {
    return cuemol.implIface(elem.type, "MolCoord");
  };

  this.mRefObjBox = new cuemolui.ObjMenuList(
    "ref_obj",
    window, filter_fn,
    cuemol.evtMgr.SEM_OBJECT);
  this.mRefObjBox._tgtSceID = this.mTargetSceneID;

  this.mMovObjBox = new cuemolui.ObjMenuList(
    "mov_obj",
    window, filter_fn,
    cuemol.evtMgr.SEM_OBJECT);
  this.mMovObjBox._tgtSceID = this.mTargetSceneID;

  var that = this;

  window.addEventListener("load", function(){
      try {that.onLoad();} catch (e) {debug.exception(e);} }, false);

  window.addEventListener("unload", function(){
      try {that.onUnload();} catch (e) {debug.exception(e);} }, false);

}

dlg.onLoad = function ()
{
  var that = this;

  this.mAlgoSel = document.getElementById("algo_select");
  this.mAlgoSel.addEventListener("select", function(aEvent){
    try {return that.onAlgoSelect(aEvent);} catch (e) {debug.exception(e);} }, false);

  this.mChkRmsdFile = document.getElementById("rmsd_file");

  this.mRefObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
  });
  this.mMovObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
  });
  
  this.mRefSelBox = document.getElementById('ref_molsel');
  this.mMovSelBox = document.getElementById('mov_molsel');

  this.mRefSelBox.targetSceID = this.mTargetSceneID;
  this.mMovSelBox.targetSceID = this.mTargetSceneID;

  ////

  if (this.mRefObjBox._widget.itemCount==0 ||
      this.mMovObjBox._widget.itemCount==0) {
    // no mol object in the scene
    document.documentElement.getButton("accept").disabled = true;
    this.mRefSelBox.disabled = true;
    this.mMovSelBox.disabled = true;
    return;
  }

  ////

  this.mRefObjBox._widget.selectedIndex = -1;
  this.mMovObjBox._widget.selectedIndex = -1;

  var bOK = false;
  if (pref.has(histry_name+"_refmol")) {
    let prev_id = pref.get(histry_name+"_refmol");
    if (this.mRefObjBox.selectObject(prev_id))
      bOK = true;
  }  

  if (!bOK)
    this.mRefObjBox._widget.selectedIndex = 0;

  bOK = false;
  if (pref.has(histry_name+"_movmol")) {
    let prev_id = pref.get(histry_name+"_movmol");
    if (this.mMovObjBox.selectObject(prev_id))
      bOK = true;
  }  

  if (!bOK) {
    // select a different item for moving mol
    if (this.mMovObjBox._widget.itemCount>1)
      this.mMovObjBox._widget.selectedIndex = 1;
    else
      this.mMovObjBox._widget.selectedIndex = 0;
  }
  
  // history: algorithm selection
  if (pref.has(histry_name+"_algsel")) {
    var prev_id = pref.get(histry_name+"_algsel");
    this.mAlgoSel.selectedIndex = prev_id;
  }
  
  // history: mol selections
  if (pref.has(histry_name+"_movmol_sel"))
    this.mMovSelBox.origSel = pref.get(histry_name+"_movmol_sel");
  if (pref.has(histry_name+"_refmol_sel"))
    this.mRefSelBox.origSel = pref.get(histry_name+"_refmol_sel");

  // history: checkboxes
  util.chkboxLoad(document, "auto_recenter", histry_name);
  util.chkboxLoad(document, "rmsd_file", histry_name);
  util.chkboxLoad(document, "xform_by_prop", histry_name);

  this.mRefSelBox.buildBox();
  this.mMovSelBox.buildBox();

  dd("*** Dlg.onLoad() OK.");
}

dlg.onUnload = function ()
{
  // this.mRefObjBox.detachScene(this.mTargetSceneID);
  // this.mMovObjBox.detachScene(this.mTargetSceneID);
  delete this.mRefObjBox;
  delete this.mMovObjBox;
};

dlg.onObjBoxChanged = function (aEvent)
{
  dd("SSMSup> ObjSelChg: "+aEvent.target.id);
  if (aEvent.target.id=="ref_obj") {
    var mol = this.mRefObjBox.getSelectedObj();
    if (mol)
      this.mRefSelBox.molID = mol.uid;
  }
  else if (aEvent.target.id=="mov_obj") {
    var mol = this.mMovObjBox.getSelectedObj();
    if (mol)
      this.mMovSelBox.molID = mol.uid;
  }
};

dlg.onAlgoSelect = function (aEvent)
{
  if (aEvent.target.value=="LSQ")
    this.mChkRmsdFile.disabled = false;
  else
    this.mChkRmsdFile.disabled = true;
};

////////////////////

dlg.onDialogAccept = function (event)
{
  var algo = this.mAlgoSel.selectedItem.value;
  dd("algo: "+algo);

  var recenter = document.getElementById("auto_recenter").checked;
  var useprop = document.getElementById("xform_by_prop").checked;

  var refSel = this.mRefSelBox.selectedSel;
  var movSel = this.mMovSelBox.selectedSel;

  if (refSel==null || movSel==null) {
    dd("SSMSup: invalid selection!!");
    util.alert(window, "Invalid selection.");
    return false;
  }

  var refMol = this.mRefObjBox.getSelectedObj();
  var movMol = this.mMovObjBox.getSelectedObj();
  if (refMol==null || movMol==null) {
    dd("SSMSup: mol not selected!!");
    util.alert(window, "Mol is not selected.");
    return false;
  }

  var mgr = cuemol.getService("MolAnlManager");

  dd("invoke: superposeSSM, "+refMol.uid+", "+refSel.toString()+", "+movMol.uid+", "+movSel.toString());

  // // EDIT TXN START //
  var scene = refMol.getScene();
  scene.startUndoTxn("Mol superpose");
  try {
    if (algo=="SSM")
      mgr.superposeSSM1(refMol, refSel, movMol, movSel, useprop);
    else
      mgr.superposeLSQ1(refMol, refSel, movMol, movSel, useprop);
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    util.alert(window, "Error, superposition was failed: "+cuemol.getErrMsg());
    return false;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
  // Save to widget history
  pref.set(histry_name+"_refmol", refMol.uid);
  pref.set(histry_name+"_movmol", movMol.uid);
  pref.set(histry_name+"_algsel", this.mAlgoSel.selectedIndex);

  pref.set(histry_name+"_refmol_sel", refSel.toString());
  pref.set(histry_name+"_movmol_sel", movSel.toString());

  // History: chexboxes
  util.chkboxSave(document, "auto_recenter", histry_name);
  util.chkboxSave(document, "rmsd_file", histry_name);
  util.chkboxSave(document, "xform_by_prop", histry_name);

  // Save selection history
  util.selHistory.append(refSel.toString());
  util.selHistory.append(movSel.toString());

  if (recenter) {
    var view = cuemol.getView(this.mTargetViewID);
    if (view) {
      movMol.fitView2(view, movSel);
    }
  }

  // RMSD file
  if (algo=="LSQ" && this.mChkRmsdFile.checked) {
    this.writeRmsdFile(refMol, refSel, movMol, movSel);
  }

  delete refMol;
  delete refSel;
  delete movMol;
  delete movSel;

  return true;
};

dlg.writeRmsdFile = function (refMol, refSel, movMol, movSel)
{
  const nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  fp.appendFilters(nsIFilePicker.filterText);

  fp.init(window, "Save RMSD info file", nsIFilePicker.modeSave);
  var res = fp.show();
  if (res==nsIFilePicker.returnCancel)
    return false;

  var path = fp.file.path;
  var mgr = cuemol.getService("MolAnlManager");
  mgr.calcRMSD(refMol, refSel, movMol, movSel, path);
}


} )();

window.gSSMSupDlg.ctor();

