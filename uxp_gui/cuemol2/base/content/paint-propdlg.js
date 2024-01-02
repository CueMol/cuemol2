// -*-Mode: C++;-*-
//
// 
//
// $Id: paint-propdlg.js,v 1.9 2011/04/29 17:38:47 rishitani Exp $
//

( function () {

var dlg = window.gDlgObj = new Object();

window.arguments[0].bOK = false;

dlg.mTgtSceID = window.arguments[0].scene_id;
dlg.mTgtRendID = window.arguments[0].rend_id;
dlg.mOrigSel = window.arguments[0].sel;
dlg.mOrigCol = window.arguments[0].col;

window.addEventListener("load", function(){
  try {dlg.onLoad();} catch (e) {debug.exception(e);} }, false);

dlg.onLoad = function ()
{
  this.mColPicker = document.getElementById("colorPickerPanel");
  this.mColPicker.setTargetSceneID(dlg.mTgtSceID);

  this.mMolSel = document.getElementById("mol-selection-list");
  
  this.mMolSel.origSel = this.mOrigSel;
  this.mSelectedCol = this.mOrigCol;

  var uobj = cuemol.getUIDObj(this.mTgtRendID);
  if ('getClientObj' in uobj) {
    // uobj is Renderer
    var obj = uobj.getClientObj();
    // This setter will invoke molsel.buildBox() !!
    this.mMolSel.molID = obj.uid;
    delete obj;
  }
  else {
    // uobj is Object
    //   (This setter will invoke molsel.buildBox() !!)
    this.mMolSel.molID = uobj.uid;
  }
  delete uobj;

  this.mColPicker.setParentUpdate(function() { dlg.onColBoxChange(); });

  // this.buildBox();
  this.mColPicker.setColorObj(this.mOrigCol);
};

dlg.onColBoxChange = function()
{
  this.mSelectedCol = this.mColPicker.getColorObj();
  return;
};

//////////

dlg.onDialogAccept = function(event)
{
  if (this.mMolSel.selectedSel==null || this.mSelectedCol==null) {
    dd("Invalid selection or color");
    return false;
  }

  try {
    // dd("sel: "+this.mMolSel.selectedSel.toString());
    // dd("col: "+this.mSelectedCol.toString());

    window.arguments[0].bOK = true;
    window.arguments[0].sel = this.mMolSel.selectedSel;
    window.arguments[0].col = this.mSelectedCol;

    //dd("rval.sel: "+window.arguments[0].sel.toString());
    //dd("rval.col: "+window.arguments[0].col.toString());
    return true;

  }
  catch (e) {
    debug.exception(e);
    return false;
  }
};

} )();

