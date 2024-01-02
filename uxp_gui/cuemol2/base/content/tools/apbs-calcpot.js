//
// APBS electrostatic potential calculation tool
//
// $Id: apbs-calcpot.js,v 1.8 2011/04/29 17:38:47 rishitani Exp $
//

( function () { try {

  ///////////////////////////
  // Initialization
  
  const pref = require("preferences-service");
  const util = require("util");
  const jpkfile = require("file");
  const timer = require("timer");

  const procMgr = cuemol.getService("ProcessManager");

  const apbs_exe_key = "cuemol2.ui.apbs-exe-path";
  const pdb2pqr_py_key = "cuemol2.ui.pdb2pqr-py-path";
  const tgtsel_key = "cuemol2.ui.apbstool-tgtsel";
  const selchk_key = "cuemol2.ui.apbstool-selchk";

  var dlg = window.gDlgObj = new Object();

  dlg.mTimer = null;
  dlg.mCalcRunning = false;

  // processes
  dlg.mP2pProc = null;
  dlg.mApbsProc = null;

  //
  dlg.mTgtSceID = window.arguments[0];
  dlg.mPlfName = util.getPlatformString();
  
  dlg.mObjBox = new cuemolui.ObjMenuList(
    "mol-select-box", window,
    function (elem) {
      if ( cuemol.implIface(elem.type, "MolCoord") ) return true;
      return false;
    },
    cuemol.evtMgr.SEM_OBJECT);
  dlg.mObjBox._tgtSceID = dlg.mTgtSceID;
  
  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  }, false);
  //window.addEventListener("unload", function(){
  //try {dlg.onUnload();} catch (e) {debug.exception(e);}
  //}, false);
  
  dlg.mMolSel = null;

  var default_path = "";

  // default apbs.exe path
  if (dlg.mPlfName=="Windows_NT")
    default_path = util.createDefaultPath("CurProcD", "apbs", "apbs.exe");
  else
    default_path = util.createDefaultPath("CurProcD", "apbs-pdb2pqr", "apbs");

  if (pref.has(apbs_exe_key))
    dlg.mApbsExePath = pref.get(apbs_exe_key);
  else
    dlg.mApbsExePath = default_path ;

  // default pdb2pqr.py path
  if (dlg.mPlfName=="Windows_NT")
    default_path = util.createDefaultPath("CurProcD", "apbs", "pdb2pqr_wrap.bat");
  else
    default_path = util.createDefaultPath("CurProcD", "apbs-pdb2pqr", "pdb2pqr");

  if (pref.has(pdb2pqr_py_key))
    dlg.mPdb2pqrPath = pref.get(pdb2pqr_py_key);
  else
    dlg.mPdb2pqrPath = default_path ;

  //////////
  // temporary files

  dlg.mPqrFile = null;
  dlg.mApbsInFile = null;
  dlg.mPotFile = null;

  dd("APBSDlg> TargetScene="+dlg.mTgtSceID);

  ///////////////////////////
  // Event Methods

  dlg.onLoad = function ()
  {
    var that = this;
    
    this.mApbsExePathBox = document.getElementById("apbs-exe-path");
    this.mApbsExePathBox.value = this.mApbsExePath;
    this.mSelBox = document.getElementById('mol-selection-list');
    this.mSelBox.targetSceID = this.mTgtSceID;
    this.mElepotName = document.getElementById('elepot-obj-name');
    this.mElepotName.disabled=false;

    this.mObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });

    var nobjs = this.mObjBox.getItemCount();

    // disable widgets when running the calculation
    this.mDisableTgt = document.getElementsByClassName("disable-target");

    // buttons
    this.mStartStopBtn = document.documentElement.getButton("accept");
    this.mCloseBtn = document.documentElement.getButton("cancel");
    this.mSelChk = document.getElementById("selection-check");

    if (pref.has(selchk_key))
      this.mSelChk.checked = pref.get(selchk_key);
    // synchronize selbox/selchk btns
    this.onSelChk();

    //alert("item count="+nobjs);
    if (nobjs==0) {
      this.mSelChk.disabled = true;
      this.mSelBox.disabled = true;
      this.mElepotName.disabled = true;
      this.mStartStopBtn.disabled = true;
    }
    else {
      var mol = this.mObjBox.getSelectedObj();
      if (mol) {
	this.mSelBox.molID = mol.uid;
	this.mElepotName.value = this.makeSugName(mol.name);
      }
    }

    // set default selection (from history)
    if (pref.has(tgtsel_key))
      this.mSelBox.origSel = pref.get(tgtsel_key);

    this.mSelBox.buildBox();

    // Default charge method: PDB2PQR
    this.onChgMthSel("use-pdb2pqr");
    //this.onChgMthSel("use-internal-pqr");

    this.mPdb2pqrPathBox = document.getElementById("pdb2pqr-py-path");
    this.mPdb2pqrPathBox.value = this.mPdb2pqrPath;

  }
  
  /*
  dlg.onUnload = function ()
  {
    pref.set(tgtsel_key, this.mSelBox.selectedSel.toString());
    pref.set(selchk_key, this.mSelChk.checked);

    pref.set(apbs_exe_key, this.mApbsExePathBox.value);
    pref.set(pdb2pqr_py_key, this.mPdb2pqrPathBox.value);
  };
  */

  dlg.disableButtons = function (aFlag)
  {
    dd("Disable target = "+this.mDisableTgt);
    var tgt = Array.prototype.slice.call(this.mDisableTgt, 0);
    
    if (aFlag) {
      tgt.forEach( function (elem, ind, ary) {
        elem.setAttribute("disabled", true);
      });
      this.mCloseBtn.disabled = true;
      this.mStartStopBtn.setAttribute("label", "Stop");
    }
    else {
      tgt.forEach( function (elem) {
        elem.removeAttribute("disabled");
      });
      this.mCloseBtn.disabled = false;
      this.mStartStopBtn.setAttribute("label", "Start");
    }
    
  };

  dlg.makeSugName = function (name)
  {
    var newname = "pot_"+name;
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
    dd("APBSDlg> ObjSelChg: "+aEvent.target.id);
    var mol = this.mObjBox.getSelectedObj();
    if (mol) {
      this.mSelBox.molID = mol.uid;
      this.mElepotName.value = this.makeSugName(mol.name);
    }      
  }

  dlg.onSelChk = function ()
  {
    if (!this.mSelChk.disabled) {
      if (this.mSelChk.checked)
	this.mSelBox.disabled = false;
      else
	this.mSelBox.disabled = true;
    }
  }
  
  dlg.onApbsExePath = function ()
  {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    fp.init(window, "Select APBS executable file", nsIFilePicker.modeOpen);

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
    this.mApbsExePathBox.value = path;
    // pref.set(apbs_exe_key, path);
  }

  dlg.onChgMthSel = function (id)
  {
    var distgts = document.getElementsByClassName("intchg-group");
    //alert("disable: "+distgts.length);
    var intChgGrp = Array.prototype.slice.call(distgts,0);
    distgts = document.getElementsByClassName("pdb2pqr-group");
    var p2pGrp = Array.prototype.slice.call(distgts, 0);

    if (id=="use-pdb2pqr") {

      intChgGrp.forEach( function (elem, ind, ary) {
	//alert("disable: "+elem.localName);
	elem.setAttribute("disabled", "true");
      });
      p2pGrp.forEach( function (elem, ind, ary) {
	elem.removeAttribute("disabled");
      });

    }
    else {

      intChgGrp.forEach( function (elem, ind, ary) {
	elem.removeAttribute("disabled");
      });
      p2pGrp.forEach( function (elem, ind, ary) {
	elem.setAttribute("disabled", "true");
      });

    }
  };

  dlg.onPdb2PqrPath = function ()
  {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    fp.init(window, "Select pdb2pqr.py file", nsIFilePicker.modeOpen);

    fp.appendFilters(nsIFilePicker.filterAll);

    var res = fp.show();
    if (res!=nsIFilePicker.returnOK)
      return;

    var path = fp.file.path;
    this.mPdb2pqrPathBox.value = path;
    //pref.set(pdb2pqr_py_key, path);
  };

  dlg.setupPaths = function ()
  {
    if (document.getElementById("use-pdb2pqr").selected) {
      // PDB2PQR.py file
      var str_p2ppath = this.mPdb2pqrPathBox.value;
      this.mP2pFile = util.createMozFile(str_p2ppath);
      if (!this.mP2pFile.exists() || !this.mP2pFile.isFile()) {
	throw "Pdb2pqr file \""+str_p2ppath+"\" not found";
      }    
      // pref.set(pdb2pqr_py_key, this.mP2pFile.path);
    }
    
    // APBS exe file
    var str_apbsexe = this.mApbsExePathBox.value;
    this.mApbsFile = util.createMozFile(str_apbsexe);
    if (!this.mApbsFile.exists() || !this.mApbsFile.isFile()) {
      throw "Apbs file \""+str_apbsexe+"\" not found";
    }    
    // pref.set(apbs_exe_key, this.mApbsFile.path);
  };
  
  ///////////////////////////////////////////

  dlg.onStartStop2 = function (event)
  {
      if (this.mCalcRunning) {
	  this.stopCalc();
	  return;
      }

      //return this.startCalc();
      this.startCalc();
  };

  dlg.startCalc = function ()
  {
    this.mTgtMol = this.mObjBox.getSelectedObj();
    if (this.mTgtMol==null) {
      alert("ERROR");
      return false;
    }

    try {
      // setup pdb2pqr/apbs paths
      this.setupPaths();

      this.mP2pProc = null;
      this.mApbsProc = null;
      this.mState = "pqr";

      this.makePqrFile();

      //this.calcGridDim();
      //this.makeAPBSIn();
      //this.submitAPBS();

      this.setupTimer();
    }
    catch (e) {
      debug.exception(e);
      this.cancelImpl();
      util.alert(window, "APBS calc error: "+e);
      return false;
    }

    this.mCalcRunning = true;
    this.disableButtons(true);
    this.appendLog("APBS calculation started...");

    // save to preferences
    let selstr = this.mSelBox.selectedSel.toString();
    pref.set(tgtsel_key, selstr);
    pref.set(selchk_key, this.mSelChk.checked);
    pref.set(apbs_exe_key, this.mApbsExePathBox.value);
    pref.set(pdb2pqr_py_key, this.mPdb2pqrPathBox.value);

    // add to sel history
    util.selHistory.append(selstr);

    return true;
  };

  dlg.cancelImpl = function ()
  {
      timer.clearInterval(this.mTimer);
      procMgr.killAll();
      this.mP2pProc = null;
      this.mApbsProc = null;
      this.mCalcRunning = false;
      this.disableButtons(false);
      this.clearTmpFiles();
  };

  dlg.stopCalc = function ()
  {
      this.cancelImpl();
      this.appendLog("Tasks killed.");
  };

  dlg.setupTimer = function()
  {
    var that = this;
    this.mTimer = timer.setInterval(function() {
      try {
	that.onTimer();
      }
      catch (e) {
	dd("Error: "+e);
	debug.exception(e);
	that.cancelImpl();
	util.alert(window, "APBS calc error: "+e);
      }
    }, 100);
  };

  dlg.appendLog = function(msg)
  {
      // log appears in the main logwindow
      cuemol.putLogMsg(msg);
  };

  /// check the process
  /// returns true if the proc (tid) has been finished.
  dlg.checkProc = function (tid)
  {
      if (tid===null||tid<0)
	  return true;
      let nstat = procMgr.getTaskStatus(tid);
      if (nstat==0) {
	  // queued but not running
	  return false;
      }
      else if (nstat==1) {
	  // running
	  bDone = false;
	  // this.mCurIndex = i;
	  let msg = procMgr.getResultOutput(tid);
	  if (msg)
	      this.appendLog(msg);
	  return false;
      }

      // tid is done (ENDED)
      var msg = procMgr.getResultOutput(tid);
      if (msg)
	  this.appendLog(msg);
      // dd("result: "+msg);
      // this.mProcs[i] = -1;
      return true;
  };

  dlg.onTimer = function()
  {
    // check the running tasks
    var bDone;
    if (this.mState == "pqr") {
      bDone = this.checkProc(this.mP2pProc);
      if (!bDone)
	return;
      // pdq2pqr done
      this.mP2pProc = null;
      this.mState = "apbs";

      //alert("PQRdone:"+this.mPqrFile.path);

      // check the resulting PQR file
      if (!this.mPqrFile.exists() || this.mPqrFile.fileSize<=0) {
	// error: pdb2pqr failed!!
	this.cancelImpl();
	util.alert(window, "ERROR: Pqr file conversion failed!!");
	return;
      }
      this.calcGridDim();
      this.makeAPBSIn();
      this.submitAPBS();
      return;
    }
    else if (this.mState == "apbs") {
      bDone = this.checkProc(this.mApbsProc);
      if (!bDone)
	return;
      this.mApbsProc = null;
      
      // check results
      if (!this.mPotFile.exists() || this.mPotFile.fileSize<=0) {
	// error: apbs failed!!
	this.cancelImpl();
	util.alert(window, "ERROR: APBS calculation failed!!");
	return;
      }

      // all tasks have been done
      dd("APBSCalc.timer> all tasks done.");
      
      // stop the timer
      timer.clearInterval(this.mTimer);
      this.mTimer = null;
      this.mState = "";
      dd("APBSCalc.timer> timer canceled.");
      
      // enable UI
      this.disableButtons(false);

      try {
	// load the resulting pot file
	this.loadPotDxFile();
      }
      catch (e) {
	debug.exception(e);
	this.cancelImpl();
	util.alert(window, "Load pot file failed: "+e);
	return;
      }
      
      // End of the calculation
      this.mCalcRunning = false;
      this.clearTmpFiles();
      this.appendLog("APBS calculation: done.");
      window.close();
    }
  };
    
  dlg.clearTmpFiles = function ()
  {
      if (this.mPdbTmpFile) {
	  try { this.mPdbTmpFile.remove(false); } catch (e) {}
	  this.mPdbTmpFile = null;
      }
      if (this.mPqrFile) {
	  try { this.mPqrFile.remove(false); } catch (e) {}
	  this.mPqrFile = null;
      }
      if (this.mApbsInFile) {
	  try { this.mApbsInFile.remove(false); } catch (e) {}
	  this.mApbsInFile = null;
      }
      if (this.mPotFile) {
	  try { this.mPotFile.remove(false); } catch (e) {}
	  this.mPotFile = null;
      }
      this.mGridCse = null;
      this.mGridFin = null;
      this.mGridPts = null;
  };

  /////////////////////////////////
  // PQR file routines

  dlg.makePqrFile = function ()
  {
    var tgtmol = this.mTgtMol;

    // setup seleciton
    var molsel = null;
    if (!this.mSelBox.disabled) {
      molsel = this.mSelBox.selectedSel;
      // // save to pref
      // pref.set(tgtsel_key, molsel.toString());
    }
    this.mMolSel = molsel;

    // select charge method
    if (document.getElementById("use-pdb2pqr").selected)
	this.submitPdb2Pqr();
    else
	this.makeIntPqrFile();
  }
  
  dlg.makeIntPqrFile = function ()
  {
    var tgtmol = this.mTgtMol;
    var molsel = this.mMolSel;

    // create exporter obj (pqr)
    var strMgr = cuemol.getService("StreamManager");
    var exporter = strMgr.createHandler("pqr", 1);
    if (typeof exporter==="undefined" || exporter===null) {
      throw "cannot create exporter for pqr";
      return;
    }

    // check hydrogen flag
    var bUseH = document.getElementById("use-hydrogen").checked;

    // make pqr tmp file
    var file = util.createMozTmpFile("apbs_tmp.pqr");

    dd("tmp pqr file: "+file.path);

    this.mPqrFile = file;
    var pqrFileName = file.path;

    // write pqr files
    try {
      if (molsel && molsel.toString()!=="")
	exporter.sel = molsel;
      dd("write: " + pqrFileName);
      exporter.use_H = bUseH;
      //exporter.ns = "amber";
      exporter.setPath(pqrFileName);
      exporter.attach(tgtmol);
      exporter.write();
      exporter.detach();
    }
    catch (e) {
      debug.exception(e);
      throw e;
    }
    finally {
      // exporter is expected to be removed by GC...
      delete exporter;
    }
  }

  dlg.submitPdb2Pqr = function ()
  {
    var tgtmol = this.mTgtMol;
    var molsel = this.mMolSel;

    // working directory (=exe dir)
    p2pdir = this.mP2pFile.parent;

    // force field name
    var ffname = "charmm";
    var elem = document.getElementById("pdb2pqr-ff-list");
    if (elem.selectedItem.value)
      ffname = elem.selectedItem.value;

    // create exporter obj (pdb)
    var strMgr = cuemol.getService("StreamManager");
    var exporter = strMgr.createHandler("pdb", 1);
    if (typeof exporter==="undefined" || exporter===null) {
      util.alert(window, "Save: get exporter Failed.");
      throw "cannot create exporter for pdb";
    }

    // write PDB files (for the input of pdb2pqr.py)
    this.mPdbTmpFile = null;
    try {
	// make pqr tmp file
	this.mPdbTmpFile = util.createMozTmpFile("apbs_tmp.pdb");
	dd("tmp pdb file: "+this.mPdbTmpFile.path);
	exporter.setPath(this.mPdbTmpFile.path);
	exporter.attach(tgtmol);
	if (molsel && molsel.toString()!=="")
	    exporter.sel = molsel;
	exporter.write();
	exporter.detach();
    }
    catch (e) {
	this.clearTmpFiles();
	debug.exception(e);
	throw e;
    }
    let in_path = "\"" + this.mPdbTmpFile.path + "\"";

    // make output pqr tmp file
    this.mPqrFile = util.createMozTmpFile("apbs_tmp.pqr");
    dd("tmp pqr file: "+this.mPqrFile.path);
    let out_path = "\"" + this.mPqrFile.path + "\"";

    // submit PDB2PQR task
    let args = ["-v","--chain",
		"--nodebump", "--noopt",
		"--ff", ffname, in_path, out_path];

    let strargs = args.join(" ");

    dd("APBSDlg> pdb2pqr = "+this.mP2pFile.path);
    dd("APBSDlg> pdb2pqr args= "+strargs);
    dd("APBSDlg> pdb2pqr wdir= "+p2pdir.path);
    // util.run_proc(this.mPdb2pqrPathBox.value, pdb2pqr_py_key, args);
    //let tid = procMgr.queueTask(this.mP2pFile.path, strargs, "");
    let tid = procMgr.queueTask2(this.mP2pFile.path, strargs, "", p2pdir.path);
    //this.mProcs.push(tid);
    this.mP2pProc = tid;

    delete exporter;
  }

  //////////////////////////////
  // APBS routines

  // determine the grid dimension for the APBS calculation
  dlg.calcGridDim = function ()
  {
    var tgtmol = this.mTgtMol;
    var oldsel = tgtmol.sel;
    var vmin,vmax;
    if (this.mMolSel) {
      tgtmol.sel = this.mMolSel;
      vmin = tgtmol.getBoundBoxMin(true);
      vmax = tgtmol.getBoundBoxMax(true);
      tgtmol.sel = oldsel;
    }
    else {
      vmin = tgtmol.getBoundBoxMin(false);
      vmax = tgtmol.getBoundBoxMax(false);
    }
    var vdim = vmax.sub(vmin);
    var vcen = vmax.add(vmin).divide(2.0);
    dd("APBSDlg> dim = "+vdim);
    dd("APBSDlg> cen = "+vcen);
    if (vdim.isZero()) {
	dd("APBSDlg> invalid dim");
	throw "invalid vdim";
	return false;
    }

    const cfac = 1.7;
    var cdim = vdim.scale(cfac);
    dd("APBSDlg> cdim = "+cdim);

    const fadd = 20.0;
    var fdim = cuemol.createObj("Vector");
    fdim.x = Math.min(cdim.x, vdim.x+fadd);
    fdim.y = Math.min(cdim.y, vdim.y+fadd);
    fdim.z = Math.min(cdim.z, vdim.z+fadd);
    dd("APBSDlg> fdim = "+fdim);

    //const nlev = 4;
    const mult_fac = 32; //Math.pow(2, nlev+1);
    
    ////
    // density value

    var nden = parseFloat(document.getElementById("grid-size").value);
    if (nden==NaN || nden<0.0)
      nden = 1.0;

    var dpts = fdim.divide(nden);

    var cs = cuemol.createObj("Vector");
    cs.x = Math.ceil(dpts.x/mult_fac);
    cs.y = Math.ceil(dpts.y/mult_fac);
    cs.z = Math.ceil(dpts.z/mult_fac);
    dd("APBSDlg> cs = "+cs);

    var fpts = cuemol.createObj("Vector");
    fpts.x = mult_fac*cs.x + 1.0;
    fpts.y = mult_fac*cs.y + 1.0;
    fpts.z = mult_fac*cs.z + 1.0;
    dd("APBSDlg> final grid points = "+fpts);

    this.mGridCse = cdim;
    this.mGridFin = fdim;
    this.mGridPts = fpts;

    return true;
  }

  /// Make apbs.in input file
  dlg.makeAPBSIn = function ()
  {
    // make output pot filename
    var cpos = util.splitFileName(this.mPqrFile.path, "*.pqr");

    var potdx_out = this.mPqrFile.path.substr(0, cpos);
    var potPath = potdx_out+".dx";

    dd("APBSDlg> output pot dx file: "+potPath);

    var dat = "";
    dat += "read\n";
    dat += "  mol pqr "+this.mPqrFile.path+"\n";
    dat += "end\n";
    dat += "elec\n";
    dat += "  mg-auto\n";
    dat += "  dime "+this.mGridPts.x.toFixed()+
      " "+this.mGridPts.y.toFixed()+
	" "+this.mGridPts.z.toFixed()+" "+"\n";

    dat += "  cglen "+this.mGridCse.x+
      " "+this.mGridCse.y+
	" "+this.mGridCse.z+" "+"\n";

    dat += "  fglen "+this.mGridFin.x+
      " "+this.mGridFin.y+
	" "+this.mGridFin.z+" "+"\n";

    dat += "  mol 1\n";
    dat += "  cgcent mol 1\n";
    dat += "  fgcent mol 1\n";

    var bUseNPBE = document.getElementById("use-npbe").checked;
    if (bUseNPBE)
      dat += "  npbe\n";
    else
      dat += "  lpbe\n";

    dat += "  bcfl sdh\n";
    //dat += "  ion 1 0.1 2.0\n";
    //dat += "  ion -1 0.1 2.0\n";
    var pdie = parseFloat(document.getElementById("prot-dielec").value);
    if (pdie==NaN || pdie<=0.0)
      pdie = 2.0;
    dat += "  pdie "+pdie+"\n";

    var sdie = parseFloat(document.getElementById("water-dielec").value);
    if (sdie==NaN || sdie<=0.0)
      sdie = 78.54;
    dat += "  sdie "+sdie+"\n";
    
    var temp = parseFloat(document.getElementById("calc-temp").value);
    if (temp==NaN || temp<=0.0)
      temp = 298.15;
    dat += "  temp "+temp+"\n";

    dat += "  chgm spl2\n";
    dat += "  srad 1.4\n";
    dat += "  swin 0.3\n";
    dat += "  sdens 10.0\n";
    dat += "  srfm smol\n";
    dat += "  calcenergy no\n";
    dat += "  calcforce no\n";
    dat += "  write pot dx "+potdx_out+"\n";
    dat += "end\n";
    dat += "quit\n";

    // make apbs input file
    var file = util.createMozTmpFile("apbs_tmp.in");
    var fout = jpkfile.open(file.path, "w");
    fout.write(dat);
    fout.close();
    delete fout;
    this.mApbsInFile = file;

    // apbs output file (pot-dx file/moz object)
    this.mPotFile = util.createMozFile(potPath);
  }

  /// submit the APBS task
  dlg.submitAPBS = function ()
  {
    let args = [this.mApbsInFile.path];
    let strargs = args.join(" ");
    
    dd("APBSDlg.SubmitAPBS> args= "+strargs);
    // proc.run(true, args, args.length);

    let deps = "";
    if (this.mP2pProc!==null)
	deps += this.mP2pProc;

    dd("APBSDlg.SubmitAPBS> p2pproc= "+this.mP2pProc);
    dd("APBSDlg.SubmitAPBS> deps= "+deps);
    let tid = procMgr.queueTask(this.mApbsFile.path, strargs, deps);
    this.mApbsProc = tid;
  }

  dlg.loadPotDxFile = function ()
  {
    // check the existence of the pot-dx file
    if (!this.mPotFile.isFile()) {
	throw "cannot open apbs output dx file: "+this.mPotPath;
    }    

    var scene = cuemol.getScene(this.mTgtSceID);

    var strMgr = cuemol.getService("StreamManager");
    var reader = strMgr.createHandler("apbs", 0);
    reader.setPath(this.mPotFile.path);

    // make default names
    var tgtmol = this.mTgtMol;
    var newname = this.mElepotName.value; //"pot_"+tgtmol.name;

    // EDIT TXN START //
    scene.startUndoTxn("Open APBS pot file");

    try {
      var newobj = reader.createDefaultObj();
      reader.attach(newobj);
      reader.read();
      reader.detach();

      newobj.name = newname;
      scene.addObject(newobj);
      newobj.forceEmbed();

      // create default renderer
      var rend = newobj.createRenderer("*unitcell");
      rend.name = "unitcell";
    }
    catch (e) {
      dd("File Open Error: "+e);
      debug.exception(e);
      
      util.alert(window, "Failed to open APBS pot file: "+path);
      reader = null;
      scene.rollbackUndoTxn();
      return;
    }

    reader = null;
    
    scene.commitUndoTxn();
    // EDIT TXN END //
  };

} catch (e) {debug.exception(e);} } )();

