//
// Molecular surface calculation UI
// $Id$
//

( function () { try {

  ///////////////////////////
  // Initialization
  
  const pref = require("preferences-service");
  const pref_tgtsel_key = "cuemol2.ui.makesurf-tool-tgtsel";
  const pref_selchk_key = "cuemol2.ui.makesurf-tool-selchk";

  const util = require("util");
  
  var dlg = window.gDlgObj = new Object();
  dlg.mTgtSceID = window.arguments[0];
  dd("MolSurfDlg> TargetScene="+dlg.mTgtSceID);
  if (window.arguments[1]) {
      // regeneration mode
      dlg.mRegenMode = true;
      dlg.mTgtObjID = window.arguments[1];
  }
  else {
      dlg.mRegenMode = false;
      dlg.mTgtObjID = 0;
  }
  
  dlg.mObjBox = new cuemolui.ObjMenuList(
    "mol-select-box", window,
    function (elem) {
      return cuemol.implIface(elem.type, "MolCoord");
    },
    cuemol.evtMgr.SEM_OBJECT);
  dlg.mObjBox._tgtSceID = dlg.mTgtSceID;

  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  }, false);
  
  dlg.mMolSel = null;

  var default_path = "";

  ///////////////////////////
  // Event Methods

  dlg.onLoad = function ()
  {
    var that = this;
    
    this.mSelBox = document.getElementById('mol-selection');
    this.mSelBox.targetSceID = this.mTgtSceID;
    this.mSurfName = document.getElementById('surf-obj-name');
    this.mSurfName.disabled=false;

    this.mObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });

    //var sel_chk = document.getElementById("selection-check");
    this.mSelChk = document.getElementById("selection-check");
    this.mSelChk.checked = false;
    this.mSelBox.disabled = true;

    var nobjs = this.mObjBox.getItemCount();
    
    //alert("item count="+nobjs);
    if (nobjs==0) {
      // no mol obj to calc --> error?
      this.mSelChk.disabled = true;
      this.mSelBox.disabled = true;
      this.mSurfName.disabled = true;
      return;
    }

    if (this.mRegenMode) {
      // Regenerate-mode
      // --> disable mol,sel,name,pradius widgets
      this.mSelChk.disabled = true;
      this.mSelBox.disabled = true;
      this.mSurfName.disabled = true;
      this.mObjBox._widget.disabled = true;
      document.getElementById("probe-radius").disabled = true;

      let surf = cuemol.getObject(this.mTgtObjID);
      // set orig_den as a default value of point density
      let orig_den = surf.orig_den;
      document.getElementById("point-density-value").value = orig_den;
      // set surf name
      this.mSurfName.value = surf.name;
      // set selection
      let orig_sel = surf.orig_sel;
      if (orig_sel!="") {
	let mol = this.mObjBox.getSelectedObj();
	this.mSelBox.molID = mol.uid;
	this.mSelBox.origSel = orig_sel;
	this.mSelBox.selectedSel = orig_sel;
	this.mSelChk.checked = true;
	// alert("origsel="+orig_sel);
      }
    }
    else {
      // Normal mode
      // --> Enable all UI
      var mol = this.mObjBox.getSelectedObj();
      if (mol) {
	this.mSelBox.molID = mol.uid;
	this.mSurfName.value = this.makeSugName(mol.name);
      }

      if (pref.has(pref_tgtsel_key))
	this.mSelBox.origSel = pref.get(pref_tgtsel_key);

      // load default sel from pref
      if (pref.has(pref_selchk_key))
	this.mSelChk.checked = pref.get(pref_selchk_key);
      
      // synchronize chk/sel state
      this.onSelChk();

      /*try {
	if (mol.sel.toString().length>0) {
	  // target is mol and has valid selection --> enable selection option
	  this.mSelChk.checked = true;
	  this.mSelBox.disabled = false;
	}
	} catch (e) {}*/
    }
    this.mSelBox.buildBox();
  }
  
  //dlg.onUnload = function ()
  //{
  //};

  dlg.makeSugName = function (name)
  {
    var newname = "sf_"+name;
    var scene = cuemol.getScene(this.mTgtSceID);
    if (scene==null||scene==undefined)
      return newname;

    if (scene.getObjectByName(newname)!=null) {
      newname = util.makeUniqName2(
	function (a) {return newname+"("+a+")"},
	function (a) {return scene.getObjectByName(a);} );
    }

    return newname;
  }

  dlg.onObjBoxChanged = function (aEvent)
  {
    dd("MolSurfDlg> ObjSelChg: "+aEvent.target.id);
    var mol = this.mObjBox.getSelectedObj();
    if (mol) {
      this.mSelBox.molID = mol.uid;
      this.mSurfName.value = this.makeSugName(mol.name);
    }
  }

  dlg.onSelChk = function ()
  {
    if (this.mSelChk.checked)
      this.mSelBox.disabled = false;
    else
      this.mSelBox.disabled = true;
  }
  
  dlg.onDialogAccept = function (event)
  {
    var tgtmol = this.mObjBox.getSelectedObj();
    if (tgtmol==null)
      return;

    if (this.mRegenMode)
      this.regenMolSurf();
    else
      this.buildMolSurf();

  }

  ////////////////

  dlg.buildMolSurf = function ()
  {
    var scene = cuemol.getScene(this.mTgtSceID);

    var tgtmol = this.mObjBox.getSelectedObj();
    var newname = this.mSurfName.value;

    var rend_name = util.makeUniqName2(
      function (a) {return "molsurf"+a; },
      function (a) {return scene.getRendByName(a);} );

    // setup seleciton
    var molsel = null;
    if (!this.mSelBox.disabled)
      molsel = this.mSelBox.selectedSel;

    if (molsel==null)
      molsel = cuemol.createObj("SelCommand");
    else if (molsel.toString()!=="")
      this.mSelBox.addHistorySel();
    
    ////
    // density value

    var nden = parseInt(document.getElementById("point-density-value").value);
    if (nden==NaN || nden<1)
      nden = 1;

    ////
    // probe radius

    var prad = parseFloat(document.getElementById("probe-radius").value);
    if (prad==NaN || prad<0.1)
      prad = 1.4;

    ////
    // do the real task

    // EDIT TXN START //
    scene.startUndoTxn("Create mol surface");

    try {
      var newobj = cuemol.createObj("MolSurfObj");
      newobj.createSESFromMol(tgtmol, molsel, nden, prad);

      newobj.name = newname;
      scene.addObject(newobj);
      newobj.forceEmbed();

      // create default renderer
      rend = newobj.createRenderer("molsurf");
      rend.name = rend_name;
      
      rend.target = tgtmol.name;
      if (molsel.toString()!=="")
	rend.sel = molsel;
      rend.colormode = "molecule";
      rend.coloring = cuemol.createObj("CPKColoring");
    }
    catch (e) {
      dd("Error: "+e);
      debug.exception(e);
      
      util.alert(window, "Failed to generate molecular surface");
      scene.rollbackUndoTxn();
      return;
    }

    // EDIT TXN END //
    scene.commitUndoTxn();

    // Save to pref
    if (molsel!=null) {
      let selstr = molsel.toString();
      //if (selstr.length>0)
      dd("pref set: "+pref_tgtsel_key+"=<"+selstr+">");
      pref.set(pref_tgtsel_key, selstr);
    }
    pref.set(pref_selchk_key, this.mSelChk.checked);
  }

  // Regenerate molsurf
  dlg.regenMolSurf = function ()
  {
    var scene = cuemol.getScene(this.mTgtSceID);

    var tgtsurf = cuemol.getObject(this.mTgtObjID);

    ////
    // density value
    var nden = parseInt(document.getElementById("point-density-value").value);
    if (nden==NaN || nden<1)
      nden = 1;

    /*
    ////
    // probe radius
    var prad = parseFloat(document.getElementById("probe-radius").value);
    if (prad==NaN || prad<0.1)
      prad = 1.4;
    */

    ////
    // do the actual task

    // EDIT TXN START //
    scene.startUndoTxn("Regenerate mol surface");

    try {
      tgtsurf.regenerateSES1(nden);
    }
    catch (e) {
      dd("Error: "+e);
      debug.exception(e);
      
      util.alert(window, "Failed to generate molecular surface");
      scene.rollbackUndoTxn();
      return;
    }

    // EDIT TXN END //
    scene.commitUndoTxn();
  }

} catch (e) {debug.exception(e);} } )();

