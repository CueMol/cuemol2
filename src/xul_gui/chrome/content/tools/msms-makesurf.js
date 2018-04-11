//
// MSMS surface calculation tool
// $Id: msms-makesurf.js,v 1.9 2011/04/29 17:38:47 rishitani Exp $
//

( function () { try {

  ///////////////////////////
  // Initialization
  
  const pref = require("preferences-service");
  const util = require("util");
  const msms_exe_key = "cuemol2.ui.msms-exe-path";
  
  var dlg = window.gDlgObj = new Object();
  dlg.mTgtSceID = window.arguments[0];
  dd("MSMSDlg> TargetScene="+dlg.mTgtSceID);
  dlg.mPlfName = util.getPlatformString();
  
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

  // default msms.exe path
  if (dlg.mPlfName=="Windows_NT")
    default_path = util.createDefaultPath("CurProcD", "msms", "msms.exe");
  else
    default_path = util.createDefaultPath("CurProcD", "msms", "msms");

  if (pref.has(msms_exe_key))
    dlg.mMsmsExePath = pref.get(msms_exe_key);
  else
    dlg.mMsmsExePath = default_path;

  ///////////////////////////
  // Event Methods

  dlg.onLoad = function ()
  {
    var that = this;
    
    this.mMsmsExePathBox = document.getElementById("msms-exe-path");
    this.mMsmsExePathBox.value = this.mMsmsExePath;
    this.mSelBox = document.getElementById('mol-selection');
    this.mSelBox.targetSceID = this.mTgtSceID;
    this.mSurfName = document.getElementById('surf-obj-name');
    this.mSurfName.disabled=false;

    this.mObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });

    var sel_chk = document.getElementById("selection-check");
    sel_chk.checked = false;
    this.mSelBox.disabled = true;

    var nobjs = this.mObjBox.getItemCount();
    
    //alert("item count="+nobjs);
    if (nobjs==0) {
      // no mol obj to calc --> error?
      sel_chk.disabled = true;
      this.mSelBox.disabled = true;
      this.mSurfName.disabled = true;
    }
    else {
      var mol = this.mObjBox.getSelectedObj();
      if (mol) {
	this.mSelBox.molID = mol.uid;
	this.mSurfName.value = this.makeSugName(mol.name);
      }

      try {
	if (mol.sel.toString().length>0) {
	  // target is mol and has valid selection --> enable selection option
	  sel_chk.checked = true;
	  this.mSelBox.disabled = false;
	}
      } catch (e) {}
    }
    this.mSelBox.buildBox();
  }
  
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
    dd("MSMS> ObjSelChg: "+aEvent.target.id);
    var mol = this.mObjBox.getSelectedObj();
    if (mol) {
      this.mSelBox.molID = mol.uid;
      this.mSurfName.value = this.makeSugName(mol.name);
    }
  }

  dlg.onSelChk = function (aEvent)
  {
    if (aEvent.target.checked)
      this.mSelBox.disabled = false;
    else
      this.mSelBox.disabled = true;
  }
  
  dlg.onMsmsExePath = function ()
  {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    fp.init(window, "Select MSMS executable file", nsIFilePicker.modeOpen);

    if (this.mPlfName=="Windows_NT") {
      fp.appendFilters(nsIFilePicker.filterApps);
    }
    else {
      fp.appendFilters(nsIFilePicker.filterAll);
    }

    var res = fp.show();
    if (res!=nsIFilePicker.returnOK) {
      return;
    }

    var path = fp.file.path;
    this.mMsmsExePathBox.value = path;
    pref.set(msms_exe_key, path);
  }

  dlg.onDialogAccept = function (event)
  {
    var tgtmol = this.mObjBox.getSelectedObj();
    if (tgtmol==null)
      return;

    //this.makeXyzrFile();
    //this.runMSMS();
    //this.loadMSMSFile();
    this.buildMolSurf();

    /*
    if (this.mXyzrFile) {
      try { this.mXyzrFile.remove(false); } catch (e) {}
      this.mXyzrFile = null;
    }
    if (this.mFaceFile) {
      try { this.mFaceFile.remove(false); } catch (e) {}
      this.mFaceFile = null;
    }
    if (this.mVertFile) {
      try { this.mVertFile.remove(false); } catch (e) {}
      this.mVertFile = null;
    }
    */
  }

  ////////////////

  dlg.buildMolSurf = function ()
  {
    var scene = cuemol.getScene(this.mTgtSceID);

    var strMgr = cuemol.getService("StreamManager");

    var tgtmol = this.mObjBox.getSelectedObj();
    var newname = this.mSurfName.value;

    var rend_name = util.makeUniqName2(
      function (a) {return "molsurf"+a; },
      function (a) {return scene.getRendByName(a);} );

    // setup seleciton
    var molsel = null;
    if (!this.mSelBox.disabled)
      molsel = this.mSelBox.selectedSel;

    if (molsel==null) {
      molsel = cuemol.createObj("SelCommand");
    }
    else if (molsel.toString()!=="") {
      //this.mMolSel = exporter.sel = molsel;
      this.mSelBox.addHistorySel();
    }
    //this.mMolSel = molsel;
    
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
      if (this.mMolSel)
	rend.sel = this.mMolSel;
      rend.colormode = "molecule";
      rend.coloring = cuemol.createObj("CPKColoring");
    }
    catch (e) {
      dd("File Open Error: "+e);
      debug.exception(e);
      
      util.alert(window, "Failed to generate molecular surface");
      //scene.rollbackUndoTxn();
      return;
    }

  }

} catch (e) {debug.exception(e);} } )();


  /*
  dlg.makeXyzrFile = function ()
  {
    var tgtmol = this.mObjBox.getSelectedObj();
    if (tgtmol==null)
      return;

    // create exporter obj
    var strMgr = cuemol.getService("StreamManager");
    var exporter = strMgr.createHandler("xyzr", 1);
    if (typeof exporter==="undefined" || exporter===null) {
      window.alert("Save: get exporter Failed.");
      throw "cannot create exporter for xyzr";
    }

    // setup seleciton
    var molsel = null;
    if (!this.mSelBox.disabled)
      molsel = this.mSelBox.selectedSel;
    if (molsel && molsel.toString()!=="") {
      this.mMolSel = exporter.sel = molsel;
      this.mSelBox.addHistorySel();
    }
    this.mMolSel = molsel;

    // make xyzr tmp file
    var file;
    file = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
	.get("TmpD", Ci.nsIFile);
    file.append("surface_tmp.xyzr");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0664);

    dd("tmp xyzr file: "+file.path);

    this.mXyzrFile = file;
    var xyzrFileName = file.path;

    // write xyzr files
    try {
      dd("write: " + xyzrFileName);
      
      // use camera of the current view (TO DO: configurable)
      exporter.setPath(xyzrFileName);
      exporter.attach(tgtmol);
      exporter.write();
      exporter.detach();
    }
    catch (e) {
      delete sc;
      delete exporter;
      throw e;
    }
    
    // exporter is expected to be removed by GC...
    delete sc;
    delete exporter;
  }
  */

  /*
  dlg.runMSMS = function ()
  {
    var str_msmsexe = this.mMsmsExePathBox.value;

    var msmsexe = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    try {
      msmsexe.initWithPath(str_msmsexe);
      if (!msmsexe.isFile()) {
	throw "cannot open msms exe file: "+str_msmsexe;
      }    
      pref.set(msms_exe_key, msmsexe.path);
    }
    catch (e) {
      util.alert(window, "Cannot open povray executable file: "+str_msmsexe);
      throw e;
      return;
    }
    
    var proc = this.mProc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    proc.init(msmsexe);
    
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

    // make output vert/face file
    file = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
	.get("TmpD", Ci.nsIFile);
    file.append("msms_tmp.face");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0664);

    dd("tmp face file: "+file.path);

    this.mFaceFile = file;

    var face_path = this.mFaceFile.path;
    var cpos = util.splitFileName(face_path, "*.face");
    var msms_out = face_path.substr(0, cpos);
    var vert_path = msms_out+".vert";

    var args = ["-if", this.mXyzrFile.path, "-of", msms_out, "-density", nden, "-probe", prad];
    
    dd("MSMS args> "+args.join(","));
    
    // block running of povray process
    proc.run(true, args, args.length);

    this.mVertFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    try {
      this.mVertFile.initWithPath(vert_path);
      if (!this.mVertFile.isFile()) {
	throw "cannot open msms output vert file: "+vert_path;
      }    
    }
    catch (e) {
      util.alert(window, "Run MSMS is failed (no output file)");
      throw e;
      return;
    }
  }
  */

  /*
  dlg.loadMSMSFile = function ()
  {
    var scene = cuemol.getScene(this.mTgtSceID);

    var strMgr = cuemol.getService("StreamManager");
    var reader = strMgr.createHandler("msms", 0);
    reader.setPath(this.mFaceFile.path);
    reader.vertex_file = this.mVertFile.path;

    // make default names

    var tgtmol = this.mObjBox.getSelectedObj();
    var newname = this.mSurfName.value; //"sf_"+tgtmol.name;

    var rend_name = util.makeUniqName2(
      function (a) {return "molsurf"+a; },
      function (a) {return scene.getRendByName(a);} );

    // EDIT TXN START //
    scene.startUndoTxn("Open MSMS file");

    try {
      var newobj = reader.createDefaultObj();
      reader.attach(newobj);
      reader.read();
      reader.detach();

      newobj.name = newname;
      scene.addObject(newobj);
      newobj.forceEmbed();

      // create default renderer
      rend = newobj.createRenderer("molsurf");
      rend.name = rend_name;
      
      rend.target = tgtmol.name;
      if (this.mMolSel)
	rend.sel = this.mMolSel;
      rend.colormode = "molecule";
      rend.coloring = cuemol.createObj("CPKColoring");
    }
    catch (e) {
      dd("File Open Error: "+e);
      debug.exception(e);
      
      util.alert(window, "Failed to open MSMS file: "+path);
      reader = null;
      scene.rollbackUndoTxn();
      return;
    }

    reader = null;
    
    scene.commitUndoTxn();
    // EDIT TXN END //
  }
  */
