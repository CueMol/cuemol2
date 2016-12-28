//
// POV-Ray rendering utility
//

const {Cc,Ci,Cr} = require("chrome");
const pref = require("preferences-service");
const timer = require("timer");

const dbg = require("debug_util");
const util = require("util");
const cuemol = require("cuemol");

//////////

const pov_exe_key = "cuemol2.ui.render.pov-exe-path";
const pov_inc_key = "cuemol2.ui.render.pov-inc-path";

const dd = dbg.dd;

const procMgr = cuemol.getService("ProcessManager");

// ctor
function PovRender()
{
  this.mTimerFn = null;
  
  this.nThreads = 1;
  this.img_width = 500;
  this.img_height = 500;
  this.nStereo = 0;
  this.dSteDep = 0.03;
  this.bOrtho = true;
  this.mbClip = true;
  this.mbPostBlend = true;
  this.mbShowEdgeLines = true;
  this.mDPI = -1.0;
  this.mbVerbose = true;
  this.mbOutputAlpha = false;
  this.mbUseFog = true;
  this.mbUsePixImgs = false;

  // Lighting/Radiosity
  this.mnLightSpread = 1;
  this.mbShadow = false;
  this.mdLightInten = 1.3;
  this.mdFlashFrac = 0.8/1.3;
  this.mdAmbFrac = 0;
  this.mbRadiosity = false;
  this.mnRadMode = 0;

  this.mTimer = null;
  this.mPlfName = util.getPlatformString();

  this._bRender = false;
  this._bTmpImageSaved = false;
  this._bTmpImageAvail = false;

  this.mPovFiles = null;
  this.mIncFile = null;
  this.mImgFile = null;
  this.mCurIndex = 0;

  this.mProcs = null;

  var default_path = "";

  // default povray path
  if (this.mPlfName=="Windows_NT") {
    this.mDefaultPovPath = util.createDefaultPath("CurProcD", "povray", "bin", "povray.exe");
  }
  else {
    this.mDefaultPovPath = util.createDefaultPath("CurProcD", "povray", "bin", "povray");
  }
  
  this.mPovExePath = this.mDefaultPovPath;
  if (pref.has(pov_exe_key)) {
    let strpath = pref.get(pov_exe_key);
    if (util.chkCreateMozFile(strpath))
      this.mPovExePath = strpath;
  }
  
  // default inc path
  this.mDefaultIncPath = util.createDefaultPath("CurProcD", "povray", "include");
  this.mPovIncPath = this.mDefaultIncPath;
  if (pref.has(pov_inc_key)) {
    let strpath = pref.get(pov_inc_key);
    if (util.chkCreateMozDir(strpath))
      this.mPovIncPath = strpath;
  }

  dd("PovRender> pov exe path="+this.mPovExePath);
  dd("PovRender> pov inc path="+this.mPovIncPath);
}

PovRender.prototype.setPovExePath = function (path)
{
  if (path=="")
    path = this.mDefaultPovPath;

  if (!util.chkCreateMozFile(path))
    return false;
  this.mPovExePath = path;
  pref.set(pov_exe_key, path);
  return true;
};

PovRender.prototype.setPovIncPath = function (path)
{
  if (path=="")
    path = this.mDefaultIncPath;

  if (!util.chkCreateMozDir(path))
    return false;
  this.mPovIncPath = path;
  pref.set(pov_inc_key, path);
  return true;
};

PovRender.prototype.clearTmpFiles = function ()
{
  // remove pov files
  if (this.mPovFiles!==null) {
    try {
      this.mPovFiles.remove(false);
    } catch (e) {}
    this.mPovFiles = null;
  }

  // remove inc files
  if (this.mIncFile!==null) {
    try {
      this.mIncFile.remove(false);
    } catch (e) {}
    this.mIncFile = null;
  }

  // remove pix files
  if (this.mRmPixFiles) {
    this.mRmPixFiles.forEach( function (elem) {
      dd("remove tmp file: "+elem);
      try {
	var file = util.createMozFile(elem);
	file.remove(false);
      }
      catch (e) {}
    });
    this.mRmPixFiles = null;
  }
};

PovRender.prototype.clearImgFile = function ()
{
  // remove png img files
  if (this.mImgFile!==null) {
    this.mImgFile.forEach( function (elem, ind, ary) {
      try {
	elem.remove(false);
      } catch (e) {}
    });
    this.mImgFile = null;
  }
};

PovRender.prototype.setPovFile = function (pov_fname, inc_fname)
{
  this.mPovFiles = util.createMozFile(pov_fname);
  this.mIncFile = util.createMozFile(inc_fname);
};

PovRender.prototype.makePovFiles = function (nSceID, nVwID)
{
  this.clearTmpFiles();
  this.mPovFiles = null; //new Array(1);
  this.mIncFile = null; //new Array(1);
  return this.makePovFileImpl(nSceID, nVwID);
};

PovRender.prototype.makePovFileImpl = function (nSceID, nVwID)
{
  dd("PovRender.makePovFiles> tgt Scene ID=" + nSceID);
  dd("PovRender.makePovFiles> tgt View ID=" + nVwID);

  // create exporter obj
  var strMgr = cuemol.getService("StreamManager");
  var exporter = strMgr.createHandler("pov", 2);
  if (typeof exporter==="undefined" || exporter===null) {
    //window.alert("Save: get exporter Failed.");
    throw "cannot create exporter for pov";
    return;
  }

  var sc = cuemol.getScene(nSceID);
  if (sc==null) {
    throw "Scene (id="+nSceID+") does not exist";
    return;
  }
  if (!sc.saveViewToCam(nVwID, "__current")) {
    dd("****** saveViewToCam FAILED!!");
  }
  
  // Make pov tmp file
  this.mPovFiles = util.createMozTmpFile("render.pov");
  var povFileName = this.mPovFiles.path;
  dd("tmp pov file: "+povFileName);
  
  // Make inc tmp file
  this.mIncFile = util.createMozTmpFile("render.inc");
  var incFileName = this.mIncFile.path;
  dd("tmp inc file: "+incFileName);
  
  // write pov/inc files
  try {
    dd("write: " + povFileName);
    dd("write inc: " + incFileName);
    
    exporter.useClipZ = this.mbClip;
    exporter.perspective = !this.bOrtho;

    if (this.mbPostBlend)
      exporter.usePostBlend = true;

    exporter.showEdgeLines = this.mbShowEdgeLines;
    exporter.usePixImgs = this.mbUsePixImgs;
    dd("***** exporter.usePixImgs = "+exporter.usePixImgs);


    // use camera of the current view (TO DO: configurable)
    exporter.makeRelIncPath = false;
    exporter.camera = "__current";
    exporter.width = this.img_width;
    exporter.height = this.img_height;
    
    exporter.attach(sc);
    exporter.setPath(povFileName);
    exporter.setSubPath("inc", incFileName);
    exporter.write();
    exporter.detach();

    if (this.mbPostBlend && exporter.blendTable) {
      dd("BlendTab JSON: "+exporter.blendTable);
      this.mBlendTab = JSON.parse(exporter.blendTable);
    }

    let str = exporter.imgFileNames;
    dd("tmpix files: "+str);
    this.mRmPixFiles = str.split(",");

  }
  catch (e) {
    dbg.exception(e);
    delete sc;
    delete exporter;
    throw e;
  }
  
  // exporter is expected to be removed by GC...
  delete sc;
  delete exporter;
};

//////////

PovRender.prototype.startRenderImpl = function (aImgDir, aOutStem)
{
  var nlayer = 1;
  var allnames = new Array();

  // count layer size/collect all layer names
  if (this.mbPostBlend && this.mBlendTab) {
    for (var key in this.mBlendTab) {
      ++nlayer;
      let names = this.mBlendTab[key].split(",");
      allnames = allnames.concat(names);
    }
  }

  if (nlayer==1) {
    // single layer ==> don't use blend mode
    this.mBlendTab = null;
  }

  if (this.mbPostBlend && this.mBlendTab) {
    // create task list (layer_render, blending)
    this.mProcs = new Array(); 

    // create layer arrays
    dd("PovRender nlayer="+nlayer);
    this.mOptArgs = new Array(nlayer);
    this.mImgFile = new Array(nlayer);
    this.mAlphas = new Array(nlayer);

    // setup background layer
    this.mOptArgs[0] = new Array();
    allnames.forEach( function (elem) {
      this.mOptArgs[0].push("Declare=_show" + elem +"=0");
    }, this);
    this.mAlphas[0] = 1.0;
    this.mCurIndex = 0;

    if (aOutStem && aImgDir) {
      this.mImgFile[0] = aImgDir.clone();
      this.mImgFile[0].append(aOutStem + "-layer"+ 0 + ".png");
      dd("Output image0: "+this.mImgFile[0].path);
    }
    else
      this.mImgFile[0] = null;

    // setup overlay layers
    var i=1;
    for (var key in this.mBlendTab) {
      let alpha = parseFloat("0."+key);
      this.mAlphas[i] = alpha;

      this.mOptArgs[i] = new Array();
      let names = this.mBlendTab[key].split(",");
      dd("Alpha="+alpha+", names="+names.join(":"));

      allnames.forEach( function (elem) {
	if (names.some(function (ee) {
	  return (ee==elem);
	}, this)) {
	  //this.mOptArgs[i].push("Declare=_show" + elem +"=1");
	}
	else {
	  // elem is not found in names list ==> hide it
	  this.mOptArgs[i].push("Declare=_show" + elem +"=0");
	}
      }, this);

      if (aOutStem && aImgDir) {
	this.mImgFile[i] = aImgDir.clone();
	this.mImgFile[i].append(aOutStem + "-layer"+ i + ".png");
	dd("Output image"+i+": "+this.mImgFile[i].path);
      }
      else
	this.mImgFile[i] = null;

      ++i;
    }
    
    // queue the renderings
    for (i=0; i<nlayer; ++i) {
      //dd("----------");
      //dd("PovRender "+i+" optargs =\n"+this.mOptArgs[i].join("\n"));
      //dd("----------");
      this.mProcs.push( this.doRenderImpl(i, true) );
    }
    
    // queue the blending task
    this.mProcs.push( this.runBlendImgTask(aImgDir, aOutStem) );
  }
  else {
    // no-post-blend mode (single pov file rendering)
    this.mOptArgs = null;
    this.mProcs = new Array(1);
    this.mImgFile = new Array(1);
    if (aOutStem && aImgDir) {
      this.mImgFile[0] = aImgDir.clone();
      if (this.mDPI>1.0)
	  this.mImgFile[0].append(aOutStem + "-layer"+ 0 + ".png");
      else
	  this.mImgFile[0].append(aOutStem + ".png");
      dd("Output image: "+this.mImgFile[0].path);
    }
    else
      this.mImgFile[0] = null;

    this.mProcs[0] = this.doRenderImpl(0, true);

    if (this.mDPI>1.0) {
	// queue the setdpi task
	this.mProcs[1] = this.runBlendImgTask(aImgDir, aOutStem);
    }
  }
};

PovRender.prototype.startRender = function ()
{
  this.clearImgFile();
  this.setupPovPaths();

  this.startRenderImpl(null, null);
  
  // setup watchdog timer
  this.startTimer();
};

PovRender.prototype.setupPovPaths = function ()
{
  var str_povexe = this.mPovExePath;
  var str_povinc = this.mPovIncPath;

  dd("doRenderImpl povpath="+str_povexe);
  dd("             incpath="+str_povinc);

  var povexe = util.chkCreateMozFile(str_povexe);
  if (povexe==null) {
    throw "povray exe file doesn't exist: "+str_povexe;
    return;
  }
  pref.set(pov_exe_key, povexe.path);

  var povinc = util.chkCreateMozDir(str_povinc);
  if (povinc==null) {
    throw "povray incdir doesn't exist: "+str_povinc;
    return false;
  }
  pref.set(pov_inc_key, povinc.path);

  this.mPovExePath = povexe;
  this.mPovIncPath = povinc;

  // blendpng/blendpng.exe path
  if (this.mPlfName=="Windows_NT") {
    this.mBlendExePath = util.createMozFile(util.createDefaultPath("CurProcD", "blendpng.exe"));
  }
  else {
    this.mBlendExePath = util.createMozFile(util.createDefaultPath("CurProcD", "bin", "blendpng"));
  }

};

PovRender.prototype.doRenderImpl = function (index, aAsync)
{
  this._bRender = true;

  //////////

  // make output image tmp file
  if (this.mImgFile[index]==null)
    this.mImgFile[index] = util.createMozTmpFile("render_layer"+index+".png");
  dd("Output png file: "+this.mImgFile[index].path);

  var outImgPath = this.mImgFile[index].path;
  var incDirPath = this.mPovIncPath.path;
  var povFilePath = this.mPovFiles.path;
  var povFileDir =  this.mPovFiles.parent.path;

  /*if (this.mPlfName == "Windows_NT") {
    outImgPath = outImgPath.split("\\").join("/");
    incDirPath = incDirPath.split("\\").join("/");
    povFilePath = povFilePath.split("\\").join("/");
    povFileDir = povFileDir.split("\\").join("/");
  }*/
  
  dd("Output image file: " + outImgPath);
  dd("povinc dir: " + incDirPath);
  dd("Input pov path: " + povFilePath);
  dd("Input pov dir: " + povFileDir);

  //////////


  var args = ["\"Input_File_Name='"+povFilePath+"'\"",
	      "\"Output_File_Name='"+outImgPath+"'\"",
	      "\"Library_Path='"+incDirPath+"'\"",
	      "\"Library_Path='"+povFileDir+"'\"",
	      "Declare=_stereo=" + this.nStereo,
	      "Declare=_iod=" + this.dSteDep,
	      "Declare=_perspective="+(this.bOrtho?"0":"1"),
	      "Declare=_shadow="+(this.mbShadow?"1":"0"),
	      "Declare=_light_inten=" + this.mdLightInten,
	      "Declare=_flash_frac=" + this.mdFlashFrac,
	      "Declare=_amb_frac="+this.mdAmbFrac,
	      "File_Gamma=1",
	      "-D",
	      "+WT" + this.nThreads,
	      "+W" + this.img_width,
	      "+H" + this.img_height,
	      "+FN8",
	      "Quality=11",
	      "Antialias=On",
	      "Antialias_Depth=3",
	      "Antialias_Threshold=0.1",
	      "Jitter=Off"];

  if (this.mnLightSpread>1)
    args.push("Declare=_light_spread="+this.mnLightSpread);

  if (this.mbVerbose)
    args.push("+V");
  else
    args.push("-V");

  if (this.mbOutputAlpha) {
    args.push("+UA");
    args.push("Declare=_transpbg=1");
  }

  if (!this.mbUseFog)
    args.push("Declare=_no_fog=1");

  if (this.mbRadiosity) {
    dd("PovRender> Radiosity ON; mode="+this.mnRadMode);
    args.push("Declare=_radiosity="+this.mnRadMode);
  }
  //args.push();

  if (this.mOptArgs && this.mOptArgs[index]) {
    dd("optargs: "+this.mOptArgs[index]);
    args = args.concat(this.mOptArgs[index]);
  }
  var strargs = args.join(" ");
  dd("args: "+strargs);

  // task ID
  var tid = -1;

  if (aAsync) {
    // async running of povray process
    //proc.run(false, args, args.length);
    tid = procMgr.queueTask(this.mPovExePath.path, strargs, "");
    if (tid<0) {
      throw "povrender: cannot create process";
    }
  }
  else {
    // synchronous running of povray
    //proc.run(true, args, args.length);
    tid = procMgr.queueTask(this.mPovExePath.path, strargs, "");
    procMgr.waitForExit(tid);
  }

  // return the task ID
  dd("render task "+tid+" queued.");
  return tid;
};

PovRender.prototype.runBlendImgTask = function (aImgDir, aOutStem)
{
  var args = new Array();
  args.push(this.mImgFile[0].path);
  var i=1;
  for (; i<this.mImgFile.length; ++i) {
    args.push(this.mImgFile[i].path);
    args.push(this.mAlphas[i]);
  }
  
  // make output image tmp file
  var finImgFile;
  if (aImgDir&&aOutStem) {
    finImgFile = aImgDir.clone();
    finImgFile.append(aOutStem + ".png");
  }
  else {
    finImgFile = util.createMozTmpFile("render_blend.png");
  }
  this.mImgFile.push(finImgFile);
  args.push(finImgFile.path);
  dd("PovRend> BlendPng output: "+finImgFile.path);

  args.push(this.mDPI);

  var strargs = args.join(" ");
  dd("args: "+strargs);

  var depends = this.mProcs.join(" ");
  dd("depends: "+depends);

  var tid = procMgr.queueTask(this.mBlendExePath.path, strargs, depends);
  dd("blend task "+tid+" queued.");
  return tid;
};

PovRender.prototype.startTimer = function ()
{
  var that = this;
  this.mTimer = timer.setInterval(function() {
    try {
      that.onTimer();
    }
    catch (e) {
      dd("Error: "+e);
      dbg.exception(e);
    }
  }, 1000);
};    

var re = /Rendered (\d+) of (\d+) pixels \((\d+)%\)/;

PovRender.prototype.filteredOutput = function (msg)
{
  if (msg=="") {
    //cuemol.putLogMsg("...");
    return;
  }
  
  let res = re.exec(msg);
  if (res) {
    this.mPcProg = parseInt(res[3]);
  }
  else
    cuemol.putLogMsg(msg);

    //cuemol.putLogMsg("<"+msg+">");
};

PovRender.prototype.onTimer = function ()
{
  // check the running tasks
  var bDone = true;
  for (var i=0; i<this.mProcs.length; ++i) {
    let tid = this.mProcs[i];
    dd("PovRender.timer> slot"+i+" tid="+tid);
    if (tid<0)
	continue; // terminated&removed
    let nstat = procMgr.getTaskStatus(tid);
    if (nstat==0) {
	// queued but not running
	bDone = false;
    }
    else if (nstat==1) {
      // running
      bDone = false;
      this.mCurIndex = i;
      let msg = procMgr.getResultOutput(tid);

      this.filteredOutput(msg);
    }
    else {
      // tid is done (ENDED)
      var msg = procMgr.getResultOutput(tid);

      this.filteredOutput(msg);

      this.mProcs[i] = -1;
    }
  }

  if (!bDone) {
    if (this.mTimerFn)
      this.mTimerFn(false);
    return;
  }

  // all tasks have been done
  dd("PovRender.timer> all tasks done.");

  // stop the timer
  timer.clearInterval(this.mTimer);
  this.mTimer = null;
  dd("PovRender.timer> timer canceled.");

  // 
  //this.stopRender();
  this._bRender = false;
  this.clearTmpFiles();
  
  // now a new temporary image file is available
  this.mCurIndex = this.mImgFile.length-1;
  this._bTmpImageAvail = true;
  this._bTmpImageSaved = false;

  // notify the last message to the client
  if (this.mTimerFn)
    this.mTimerFn(true);

};

PovRender.prototype.getProgress = function ()
{
  return this.mPcProg;
};

PovRender.prototype.stopRender = function ()
{
  dd("StopRender called");
  this._bRender = false;
  // this.mStartStopBtn.setAttribute("label", "Render");
  // this.disableButtons(false);
  if (this.mProcs==null)
    return;

  procMgr.killAll();
  for (var i=0; i<this.mProcs.length; ++i) {
    let tid = this.mProcs[i];
    if (tid<0)
      continue;

    // tid must be done (ENDED)
    var msg = procMgr.getResultOutput(tid);
    dd("killed: "+msg);
    this.mProcs[i] = -1;
  }

  this.clearTmpFiles();
};


PovRender.prototype.saveImage = function (mozFile)
{
  if (!this._bTmpImageAvail) {
    dd("tmp image is not available");
    return;
  }

  try {
    mozFile.remove(false);
  }
  catch (e) {}

  dd("save to dir : "+mozFile.parent.path);
  dd("save to file: "+mozFile.leafName);

  try {
    // save the latest image
    this.mImgFile[this.mCurIndex].copyTo(mozFile.parent, mozFile.leafName);
  }
  catch (e) {
    dbg.exception(e);
  }
    
  //dd("saved, mImgFile dir : "+this.mImgFile.parent.path);
  //dd("saved, mImgFile name : "+this.mImgFile.leafName);
  
  // save image ok
  this._bTmpImageSaved = true;
};

PovRender.prototype.getCurrentImgFile = function ()
{
  if (this.mImgFile==null) return null;

  if (this.mImgFile[this.mCurIndex])
    return this.mImgFile[this.mCurIndex];

  return null;
};

exports.newPovRender = function ()
{
  return new PovRender();
};

