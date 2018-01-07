// -*-Mode: C++;-*-
//
// Molecular surface calculation UI
//

( function () { try {

  ///////////////////////////
  // Initialization
  
  const pref = require("preferences-service");
  const util = require("util");
  
  var dlg = window.gDlgObj = new Object();
  dlg.mTgtSceID = window.arguments[0];
  dd("MapSharpDlg> TargetScene="+dlg.mTgtSceID);
  
  dlg.mObjBox = new cuemolui.ObjMenuList(
    "map-select-box", window,
    function (elem) {
      return cuemol.implIface(elem.type, "DensityMap");
    },
    cuemol.evtMgr.SEM_OBJECT);
  dlg.mObjBox._tgtSceID = dlg.mTgtSceID;

  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  }, false);
  
  ///////////////////////////
  // Event Methods

  dlg.onLoad = function ()
  {
    var that = this;
    
    this.mObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });

    var nobjs = this.mObjBox.getItemCount();
    
    this.mBfac = document.getElementById("bfac-level");

    //alert("item count="+nobjs);
    if (nobjs==0) {
      // no mol obj to calc --> error?
      //this.mSurfName.disabled = true;
    }
    var obj = this.mObjBox.getSelectedObj();

    //this.mTool = cuemol.createObj("BSharpTool");
    this.mTool = cuemol.createObj("CudaBSharpTool");
    this.mTool.attach(obj);
  };
  
  dlg.onObjBoxChanged = function (aEvent)
  {
    dd("MapSharpDlg> ObjSelChg: "+aEvent.target.id);
    var obj = this.mObjBox.getSelectedObj();
    this.mTool.attach(obj);
  };

  dlg.onBfacChange = function (aEvent)
  {
    if ('isDragging' in aEvent && aEvent.isDragging)
      dd("Dragging");
    else
      dd("Changed");

    this.preview();
  };

  /// Get bfactor value
  dlg.getBfacValue = function ()
  {
    return parseFloat(document.getElementById("bfac-value").value);
  };
  

  dlg.preview = function ()
  {
    var tgtobj = this.mObjBox.getSelectedObj();
    if (tgtobj==null)
      return;

    ////
    // Get bfactor value
    var bfac = this.getBfacValue();
    if (bfac==NaN)
      return; // ERROR

    //tgtobj.sharpenMapPreview(bfac);
    this.mTool.preview(bfac);
  };

  dlg.onDialogCancel = function (event)
  {
    var tgtobj = this.mObjBox.getSelectedObj();
    if (tgtobj==null)
      return;

    // Reset the preview map
    //tgtobj.sharpenMapPreview(0.0);
    this.mTool.preview(0.0);
    this.mTool.detach();
    this.mTool = null;
    return;
  };

  dlg.onDialogAccept = function (event)
  {
    var tgtobj = this.mObjBox.getSelectedObj();
    if (tgtobj==null)
      return;

    ////
    // Get bfactor value
    var bfac = this.getBfacValue();
    if (bfac==NaN)
      return; // ERROR

    this.mTool.apply(bfac);
    this.mTool.detach();
    this.mTool = null;
    return;

    /*
    // test -- reset
    //tgtobj.sharpenMapPreview(0.0);
    this.mTool.preview(0.0);
    this.mTool.detach();
    this.mTool = null;
    return;
    */

    // EDIT TXN START //
    //scene.startUndoTxn("Create mol surface");
    // EDIT TXN END //
    // scene.commitUndoTxn();
  }

} catch (e) {debug.exception(e);} } )();

