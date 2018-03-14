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
    this.mDMin = document.getElementById("resoln-limit");
    this.mPvwChk = document.getElementById("preview-check");
    
    //alert("item count="+nobjs);
    if (nobjs==0) {
      // no map obj to calc --> disable all
      this.mBfac.disabled = true;
      this.mDMin.disabled = true;
      this.mPvwChk.disabled = true;
      this.mTool = null;
      return;
    }
    var obj = this.mObjBox.getSelectedObj();

    this.mTool = cuemol.createObj("BSharpTool");
    //this.mbDragUpdate = false;
    //this.mTool = cuemol.createObj("CudaBSharpTool");
    this.mbDragUpdate = true;

    this.attachObj(obj);
  };
  
  dlg.attachObj = function (aObj)
  {
    this.mTool.attach(aObj);

    let d_min = this.mTool.d_min;
    this.mDMin.value = d_min;
    this.mDMin.min = d_min;
  }

  dlg.onPreviewChange = function (aEvent) {
    if (this.mPvwChk.checked)
      this.preview();
    else
      this.resetPreview();
  }

  dlg.onObjBoxChanged = function (aEvent)
  {
    dd("MapSharpDlg> ObjSelChg: "+aEvent.target.id);
    var obj = this.mObjBox.getSelectedObj();

    // reset cur obj's preview state
    if (this.mPvwChk.checked)
      this.resetPreview();

    // switch to the new obj
    this.attachObj(obj);
  };

  dlg.onBfacChange = function (aEvent)
  {
    let bDragging = true;
    if ('isSliChanged' in aEvent && aEvent.isSliChanged) {
      if ('isDragging' in aEvent)
        bDragging = aEvent.isDragging;
    }
    else if ('isNumBoxChanged' in aEvent && aEvent.isNumBoxChanged)
      bDragging = false;

    //dd("onBfacChange> isDragging="+('isDragging' in aEvent));
    dd("onBfacChange> bDragging="+bDragging);

    if (!this.mPvwChk.checked)
      return;

    if (bDragging) {
      if (this.mbDragUpdate)
        this.preview();
    }
    else {
      this.preview();
    }
  };

  dlg.onDMinChange = function (aEvent)
  {
    if (!this.mPvwChk.checked)
      return;

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

    // Get resoln limit value
    var dmin = parseFloat( this.mDMin.value );
    if (dmin==NaN)
      dmin = -1.0;

    this.mTool.d_min = dmin;
    
    dd("preview with bfac="+bfac+", dmin="+dmin);
    //tgtobj.sharpenMapPreview(bfac);
    this.mTool.preview(bfac);
  };

  dlg.resetPreview = function ()
  {
    //this.mTool.preview(0.0);
    this.mTool.resetPreview();
  }

  dlg.onDialogCancel = function (event)
  {
    var tgtobj = this.mObjBox.getSelectedObj();
    if (tgtobj==null)
      return;

    // Reset the preview map
    //this.mTool.preview(0.0);
    this.resetPreview();
    this.mTool.detach();
    this.mTool = null;
    return;
  };

  dlg.onDialogAccept = function (event)
  {
    if (this.mTool==null)
      return;
    
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

