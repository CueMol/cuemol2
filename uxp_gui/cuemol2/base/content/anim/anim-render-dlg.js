// -*-Mode: javascript;-*-
//
// Povray rendering tool window
//

( function () {

  const povrender = require("povrender");
  const timer = require("timer");
  const util = require("util");
  const prefsvc = require("preferences-service");
  const procMgr = cuemol.getService("ProcessManager");
  
  const output_dir_key = "cuemol2.ui.animrender.output-path";
  const ffmpeg_exe_key = "cuemol2.ui.animrender.ffmpeg-exe-path";
  const ncpu_key = "cuemol2.ui.animrender.ncpu";
  const outbase_key = "cuemol2.ui.animrender.outbase";

  var dlg = window.gDlgObj = new Object();
  dlg.mTgtSceID = window.arguments[0];
  
  // Save target scene name
  {
    let scene = cuemol.getScene(dlg.mTgtSceID);
    dlg.mSceName = scene.name;
    // delete scene;
  }

  dlg.mPovRender = povrender.newPovRender();
  dlg._bRender = false;
  dlg.mbRenderOK = false;
  dlg.mTasks = new Object;

  // XXX: ???
  dlg.mPovRender.mTimerFn = function(arg){
    try {dlg.onTimer(arg);} catch (e) {debug.exception(e);}
  };
  
  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  }, false);
  window.addEventListener("unload", function(){
    try {dlg.onUnload();} catch (e) {debug.exception(e);}
  }, false);
  
  //////////

  dlg.onLoad = function ()
  {
    this.mDisableTgt = document.getElementsByClassName("disable-target");
    this.mStartBtn = document.documentElement.getButton("accept");
    this.mStopBtn = document.documentElement.getButton("extra1");
    this.mStopBtn.disabled = true;
    this.mCloseBtn = document.documentElement.getButton("cancel");

    this.mOutputPathBox = document.getElementById("output-path");
    this.mOutputBaseBox = document.getElementById("output-base-name");
    this.mOutImgWidth = document.getElementById("output-image-width");
    this.mOutImgHeight = document.getElementById("output-image-height");
    this.mRadMode = document.getElementById("pov-radio-mode-list");

    // Setup log window
    this.mLogWnd = document.getElementById("output-log-frame");
    this.mLogWndDoc = this.mLogWnd.contentDocument;
    this.mLogWndDoc.writeln("<head><link rel='stylesheet' type='text/css' href='chrome://cuemol2/content/logwindow.css'></head><body><pre id='log_content' class='console-text'/></body>");
    this.mLogWndDoc.close();
    this.mLogWndWin = this.mLogWnd.contentWindow;
    this.mLogWndPre = this.mLogWndDoc.getElementById("log_content");

    // set initial values
    if (prefsvc.has(output_dir_key)) {
      let path = prefsvc.get(output_dir_key);
      if (util.chkCreateMozDir(path))
	this.mOutputPathBox.value = path;
    }
    
    this.mOutputBaseBox.value = "output";
    this.mFfOutFileExt = null;

    if (prefsvc.has(ncpu_key)) {
      let ncpu = prefsvc.get(ncpu_key);
      document.getElementById("task-concr-run").value = ncpu;
    }

    if (prefsvc.has(outbase_key)) {
      this.mOutputBaseBox.value = prefsvc.get(outbase_key);
    }

    this.mProgBar = document.getElementById("progress");

    // setup povray settings page
    this.onLoadPovRender();

    // setup ffmpeg settings page
    this.onLoadFFmpeg();

    // setup preview tab page
    this.onLoadPreviewPage();
  };

  dlg.onLoadPovRender = function ()
  {
    // povray settings
    this.mPovExePathBox = document.getElementById("povray-exe-path");
    this.mPovIncPathBox = document.getElementById("povray-inc-path");

    this.mPovExePathBox.value = this.mPovRender.mPovExePath;
    this.mPovIncPathBox.value = this.mPovRender.mPovIncPath;
  };

  dlg.appendLog = function(msg)
  {
    this.mLogWndPre.appendChild(this.mLogWndDoc.createTextNode(msg));
    this.mLogWndWin.scrollTo(0, this.mLogWndPre.scrollHeight);
  };

  dlg.onStart = function ()
  {
    if (this._bRender)
      return;

    // select the main tab
    document.getElementById("tabs-overlay-target").selectedIndex=0;

    // main options
    //let fps_val = document.getElementById("main-mlist-fps").value;
    this.mFPSVal = document.getElementById("main-mlist-fps").value;
    let img_height = this.mOutImgHeight.value;
    let img_width = this.mOutImgWidth.value;
    let ortho = (document.getElementById("proj-mode-list").selectedItem.value=="ortho");

    let ncpu = document.getElementById("task-concr-run").value;
    if (isNaN(ncpu)||ncpu<1) ncpu = 1;
    prefsvc.set(ncpu_key, ncpu);

    let fDupLastFrm = document.getElementById("main-dup-lastfrm").checked;
    //let fDupLastFrm = true;

    // pov options
    let postblend = document.getElementById("pov-enable-post-blend").checked;
    let clipplane = document.getElementById("pov-enable-clip-plane").checked;
    let shadow = document.getElementById("pov-enable-shadow").checked;
    let edgelines = document.getElementById("pov-enable-edgelines").checked;
    let piximgs = document.getElementById("pov-enable-piximgs").checked;

    // radiosity settings
    if (this.mRadMode.value=="-1")
      this.mPovRender.mbRadiosity=false;
    else {
      this.mPovRender.mbRadiosity=true;
      this.mPovRender.mnRadMode = this.mRadMode.value;
    }

    this.mPovRender.nThreads = 1;
    this.mPovRender.mbShadow = shadow;
    this.mPovRender.mbShowEdgeLines = edgelines;
    this.mPovRender.mbUsePixImgs = piximgs;
    this.mPovRender.mbVerbose = false;

    this.mPovRender.setPovExePath(this.mPovExePathBox.value);
    this.mPovRender.setPovIncPath(this.mPovIncPathBox.value);
    this.mPovRender.setupPovPaths();
    this.mPovRender.bOrtho = ortho;
    this.mPovRender.img_width = img_width;
    this.mPovRender.img_height = img_height;
    this.mPovRender.mDPI = 72;
    this.mPovRender.mbPostBlend = postblend;

    try {
      // set concurrency
      procMgr.setSlotSize(ncpu);

      var out_dir = util.chkCreateMozDir(this.mOutputPathBox.value);
      if (out_dir==null) {
	util.alert(window, "Invalid output dir: "+this.mOutputPathBox.value);
	return;
      }

      // set output logfile
      {
	let out = out_dir.clone();
	let base = this.mOutputBaseBox.value;
	prefsvc.set(outbase_key, base);
	out.append(base+".log");
	procMgr.setLogPath(out.path);
      }
      
      let scene = cuemol.getScene(dlg.mTgtSceID);
      let am = scene.getAnimMgr();
      if (am.size<=0) {
	util.alert(window, "No animation in scene: "+scene.name);
	return;
      }

      this._bRender = true;
      this.mbRenderOK = false;
      this.disableButtons(true);

      let tv_st = cuemol.createObj("TimeValue");
      //tv_st.intval = 0;
      tv_st.millisec = 0.0;
      let tv_en = am.length;
      
      let nfrms = am.setupRender(tv_st, tv_en, this.mFPSVal);
      if (!fDupLastFrm)
	  nfrms --;
      
      // alert("fDup="+fDupLastFrm+", nfrms="+nfrms);

      let strMgr = cuemol.getService("StreamManager");
      let exp = strMgr.createHandler("pov", 2);
      exp.makeRelIncPath = false;
      exp.useClipZ = clipplane;
      exp.usePostBlend = postblend;
      exp.showEdgeLines = edgelines;
      exp.usePixImgs = piximgs;

      this.mAnimMgr = am;
      this.mExp = exp;
      this.mFrames = nfrms;
      this.mCurFrm = 0;
      this.mOutPath = out_dir;
      this.setupTimer();
    }
    catch (e) {
      debug.exception(e);
    }
  };
  
  /// Cancel all tasks
  dlg.onStop = function ()
  {
    dd("!!! onStop called !!!");
    if (!this._bRender)
      return;

    try {
      dd("!!! onStop cancel timer !!!");
      // stop timer
      timer.clearInterval(this.mTimer);
      this.mTimer = null;

      // finalize process manager
      procMgr.killAll();
      procMgr.setLogPath("");

      // update UI
      this._bRender = false;
      this.mbRenderOK = false;
      this.disableButtons(false);
      this.appendLog("Tasks killed.");
    }
    catch (e) {
      debug.exception(e);
    }
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
      }
    }, 100);
  };
  
  function formatnum(nval, ntotal)
  {
    var rval = "000"+nval.toString();
    return rval.substr(rval.length-4);
  };

  const kConcSub = 1;

  dlg.procTaskMsgs = function ()
  {
    var i;
    var done_tasks = JSON.parse( procMgr.doneTaskListJSON() );
    for (i=0; i<done_tasks.length; ++i) {
      let tid = done_tasks[i];
      let res = procMgr.getResultOutput(tid);
      dd("task "+tid+" done: res = "+res);
      //dd("task "+tid+" done");
      
      if (tid in this.mTasks) {
	let tsk = this.mTasks[tid];
	if ('msg' in tsk) {
	  this.appendLog("Task "+tid+" ("+tsk.msg+"): done\n");
	}
	if ('frameno' in tsk) {
	  this.mProgBar.value = (tsk.frameno/this.mFrames)*100.0;
	  this.updatePreview(tsk.frameno);
	}
	if ('remvs' in tsk) {
	  // remove temp pov/inc/png files
	  let remvs = tsk.remvs;
	  remvs.forEach( function (elem, ind, ary) {
	    try {
	      elem.remove(false);
	    } catch (e) {}
	  });
	}
	// delete task elem
	delete this.mTasks[tid];
      }
    } // for (i=0; i<done_tasks.length; ++i)
  };

  dlg.finRenderTasks = function ()
  {
    dd("AnimRender.timer> all tasks done.");

    // stop the timer
    timer.clearInterval(this.mTimer);
    this.mTimer = null;
    dd("AnimRender.timer> timer canceled.");
    
    // check normal termination
    let berr=false
    if (procMgr.errormsg) {
      //alert("Some task(s) failed: "+procMgr.errormsg);
      this.appendLog("Some task(s) failed: "+procMgr.errormsg+"\n");
      berr=true;
    }
    else {
      this.appendLog("All tasks done\n");
    }
    
    // finalize process manager
    procMgr.killAll();
    procMgr.setLogPath("");

    this.mbRenderOK = true;
    this._bRender = false;
    this.mAnimMgr = null;
    this.mExp = null;
    
    this.disableButtons(false);
    // this.startMovPreview();
    if (berr)
      util.alert(window, "Some task(s) failed: see message window");
  };

  dlg.onTimer = function()
  {
    let i;

    try {
      this.procTaskMsgs();
      
      if (procMgr.queue_len>10) {
	dd("Timer> queue is full");
	return;
      }
      
      // make new tasks
      let cf = this.mCurFrm;
      for (i=cf; i<cf+kConcSub && i<this.mFrames; ++i) {
	let tid = this.submitFrame(i);
	if (i==this.mFrames-1 && tid) {
	  this.submitFFmpegTasks(tid);
	}
      }
      
      if (this.mCurFrm==this.mFrames) {
	if (procMgr.isEmpty()) {
	  // all tasks have been done
	  // --> rendering completed
	  this.finRenderTasks();
	}
	else {
	  dd("Timer> queue is not empty...");
	}
      }
    }
    catch (e) {
      // error: stop
      timer.clearInterval(this.mTimer);
      this.mTimer = null;
      procMgr.killAll();
      procMgr.setLogPath("");
      this._bRender = false;
      this.disableButtons(false);
      this.appendLog("Fatal error: "+e);
      this.appendLog("Tasks killed.");
      debug.exception(e);
      return;
    }
  };

  dlg.submitFrame = function (ifrm)
  {
    let exp = this.mExp;
    let out = this.mOutPath.clone();
    let out2 = this.mOutPath.clone();
    let img = this.mOutPath.clone();
    
    let base = this.mOutputBaseBox.value;
    let num = formatnum(ifrm, this.mFrames);
    base = base+"_frm_" + num;
    out.append(base + ".pov");
    out2.append(base + ".inc");
    
    dd("writing frame="+this.mAnimMgr.frameno+" output: "+out.path);
    exp.setPath(out.path);
    exp.setSubPath("inc", out2.path);
    this.mAnimMgr.writeFrame(exp);
    
    let bltab = exp.blendTable;
    this.mPovRender.mBlendTab = null;
    if (this.mPovRender.mbPostBlend && bltab) {
      dd("BlendTab JSON: "+bltab);
      this.mPovRender.mBlendTab = JSON.parse(bltab);
    }
    
    this.mPovRender.mPovFiles = out;
    this.mPovRender.mIncFile = out2;

    this.mPovRender.startRenderImpl(img, base);
    if (!this.mPovRender.mProcs)
      throw "startRenderImpl() failed";

    let ntasks = this.mPovRender.mProcs.length;
    if (ntasks==0)
      throw "startRenderImpl() failed";
      
    let i=0;
    let remvs = new Array();
    for (; i<ntasks-1; ++i) {
      let tid = this.mPovRender.mProcs[i];
      if (tid==null)
	throw "startRenderImpl() failed";
      this.appendLog("Task "+tid+": submitted\n");

      remvs.push(this.mPovRender.mImgFile[i]);
      this.mTasks[tid] = {
      msg: "Render frame: "+num+", layer: "+i,
      frameno: ifrm
      };
    }

    let tid = this.mPovRender.mProcs[i];
    if (tid==null)
      throw "startRenderImpl() failed";
    this.appendLog("Task "+tid+": submitted\n");

    remvs.push(out);
    remvs.push(out2);

    dd("*** remove piximg files: "+exp.imgFileNames);
    if (exp.imgFileNames) {
      let ary = exp.imgFileNames.split(",");
      ary.forEach( function (elem) {
	dd("*** remove piximg file: "+elem);
	var file = util.createMozFile(elem);
	remvs.push(file);
      } );
    }
    // this.mPovRender.mRmPixFiles = null;
    
    this.mTasks[tid] = {
    remvs: remvs,
    //msg: "Render frame "+this.mPovRender.mImgFile[i].path
    msg: "Render frame "+ifrm+"/"+this.mFrames,
    frameno: ifrm
    };

    this.mPovRender.mProcs = null;
    this.mCurFrm ++;

    return tid;
  };

  dlg.disableButtons = function (aFlag)
  {
    dd("Disable target = "+this.mDisableTgt);
    var tgt = Array.prototype.slice.call(this.mDisableTgt, 0);
    
    if (aFlag) {
      tgt.forEach( function (elem, ind, ary) {
        elem.setAttribute("disabled", true);
      });
      this.mCloseBtn.disabled = true;
      this.mStartBtn.disabled = true;
      this.mStopBtn.disabled = false;
      // this.mStartBtn.setAttribute("label", "Stop");

      // progressbar (running)
      this.mProgBar.disabled = false;
    }
    else {
      tgt.forEach( function (elem) {
        elem.removeAttribute("disabled");
      });
      this.mCloseBtn.disabled = false;
      this.mStartBtn.disabled = false;
      this.mStopBtn.disabled = true;
      // this.mStartBtn.setAttribute("label", "Start");

      // progressbar (stopped)
      this.mProgBar.value = 0;
      this.mProgBar.disabled = true;

      // re-encode button (ffmpeg page)
      if (this.mbRenderOK)
	this.mReencBtn.disabled = false;
      else
	this.mReencBtn.disabled = true;
    }
    

  };

  dlg.onCloseEvent = function (evt)
  {
    return true;
  };
  
  dlg.onPovExePath = function ()
  {
    var oldval = util.chkCreateMozFile( this.mPovExePathBox.value );

    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    
    fp.init(window, "Select POV-Ray executable file", nsIFilePicker.modeOpen);
    
    if (this.mPovRender.mPlfName=="Windows_NT") {
      fp.appendFilters(nsIFilePicker.filterApps);
    }
    else {
      fp.appendFilters(nsIFilePicker.filterAll);
    }

    if (oldval && oldval.parent)
      fp.displayDirectory = oldval.parent;
    
    var res = fp.show();
    if (res!=nsIFilePicker.returnOK) {
      return;
    }
    
    this.mPovRender.setPovExePath(fp.file.path);
    this.mPovExePathBox.value = this.mPovRender.mPovExePath;
  };
  
  dlg.onPovIncPath = function ()
  {
    var oldval = util.chkCreateMozDir( this.mPovIncPathBox.value );

    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    
    fp.init(window, "Select POV-Ray inc folder", nsIFilePicker.modeGetFolder);
    if (oldval)
      fp.displayDirectory = oldval;

    var res = fp.show();
    if (res!=nsIFilePicker.returnOK) {
      return;
    }
    
    this.mPovRender.setPovIncPath(fp.file.path);
    this.mPovIncPathBox.value = this.mPovRender.mPovIncPath;
  };

  dlg.onOutputPath = function ()
  {
    var oldval = util.chkCreateMozDir( this.mOutputPathBox.value );

    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    
    fp.init(window, "Select output folder", nsIFilePicker.modeGetFolder);
    if (oldval)
      fp.displayDirectory = oldval;

    var res = fp.show();
    if (res!=nsIFilePicker.returnOK) {
      return;
    }
    
    var path = fp.file.path;
    prefsvc.set(output_dir_key, path);
    this.mOutputPathBox.value = path;
  };

  dlg.onPresetSel = function (aEvent)
  {
    try {
      var value = aEvent.target.value;
      dd("onPresetSel: "+value);
      
      var ls = value.split(",");
      var w = ls[0];
      var h = ls[1];
      
      dd("w="+w);
      dd("h="+h);
      
      this.mOutImgWidth.value = w;
      this.mOutImgHeight.value = h;
    }
    catch (e) { debug.exception(e); }
  };

  //////////////////////////////////////////////
  // FFmpeg encoding options

  dlg.onLoadFFmpeg = function ()
  {
    var that = this;

    this.mReencBtn = document.getElementById("ffmpeg-reenc");
    this.mReencBtn.addEventListener("command", function(event){
      try {that.startReenc(event);} catch (e) {debug.exception(e);}
    }, false);

    this.mFfExePathBox = document.getElementById("ffmpeg-exe-path");

    if (prefsvc.has(ffmpeg_exe_key)) {
      this.mFfExePathBox.value = prefsvc.get(ffmpeg_exe_key);
    }
    else {
      // default ffmpeg path
      let default_path;
      if (this.mPovRender.mPlfName=="Windows_NT")
	default_path = util.createDefaultPath("CurProcD", "ffmpeg", "bin", "ffmpeg.exe");
      else
	default_path = util.createDefaultPath("CurProcD", "ffmpeg", "bin", "ffmpeg");
      
      this.mFfExePathBox.value = default_path;
    }

    this.mFfOFmtList = document.getElementById("ffmpeg-oformat");
    this.mFfOFmtList.addEventListener("select", function(event){
      try {that.onOutFmtChg(event.target.selectedItem.value);} catch (e) {debug.exception(e);}
    }, false);

    this.mFfBitrList = document.getElementById("ffmpeg-bitrate");

    this.mMainOpt = document.getElementById("ffmpeg-mainopt");

    this.mFfChk = document.getElementById("ffmpeg-enable-check");
    this.mFfChk.addEventListener("command", function(event){
      try {that.enableFFmpegWidgets(event.target.checked);} catch (e) {debug.exception(e);}
    }, false);

    that.enableFFmpegWidgets(this.mFfChk.checked);
    that.onOutFmtChg(this.mFfOFmtList.selectedItem.value);

  };

  dlg.enableFFmpegWidgets = function (chk)
  {
    if (chk) {
      this.mFfExePathBox.disabled = false;
      this.mFfOFmtList.disabled = false;
      this.mFfBitrList.disabled = false;
      if (this.mbRenderOK)
	this.mReencBtn.disabled = false;
      else
	this.mReencBtn.disabled = true;
    }
    else {
      this.mFfExePathBox.disabled = true;
      this.mFfOFmtList.disabled = true;
      this.mFfBitrList.disabled = true;
      this.mReencBtn.disabled = true;
    }
  };
  
  dlg.onFFmpegExePath = function ()
  {
    var oldval = util.chkCreateMozFile( this.mFfExePathBox.value );

    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    
    fp.init(window, "Select FFmpeg executable file", nsIFilePicker.modeOpen);
    
    if (this.mPovRender.mPlfName=="Windows_NT")
      fp.appendFilters(nsIFilePicker.filterApps);
    else
      fp.appendFilters(nsIFilePicker.filterAll);

    if (oldval && oldval.parent)
      fp.displayDirectory = oldval.parent;
    
    var res = fp.show();
    if (res!=nsIFilePicker.returnOK) {
      return;
    }
    
    // this.mPovRender.setPovExePath(fp.file.path);
    this.mFfExePathBox.value = fp.file.path;
    prefsvc.set(ffmpeg_exe_key, fp.file.path);
    dd("prefsvc "+ffmpeg_exe_key+" is set: "+fp.file.path);
  };

  dlg.onOutFmtChg = function (sel)
  {
    //let sel = aEvent.target.selectedItem.value;
    
    switch (sel) {
    case "mov_h264":
      this.mMainOpt.value = "-c:v libx264 -f mov";
      this.mFfOutFileExt = ".mov";
      break;
    case "mov_raw":
      this.mMainOpt.value = "-c:v rawvideo -f mov";
      this.mFfOutFileExt = ".mov";
      break;
    case "avi_h264":
      this.mMainOpt.value = "-c:v libx264 -f avi";
      this.mFfOutFileExt = ".avi";
      break;
    case "mp4_h264":
      this.mMainOpt.value = "-c:v libx264 -f mp4";
      this.mFfOutFileExt = ".mp4";
      break;
    case "wmv2":
      this.mMainOpt.value = "-c:v wmv2";
      this.mFfOutFileExt = ".wmv";
      break;
    }
  };
  
  dlg.submitFFmpegTasks = function (aDepTid)
  {
    if (!this.mFfChk.checked)
      return;

    let frate = this.mFPSVal;
    let nfrms = this.mFrames;
    let bitr = this.mFfBitrList.value;
    let inpath = this.mOutPath.clone();
    let base = this.mOutputBaseBox.value;

    inpath.append(base+"_frm_%04d.png");

    let outmov = this.mOutPath.clone();
    let outstem = this.mOutputBaseBox.value;
    outmov.append(outstem + this.mFfOutFileExt);
    
    let strargs = "";

    //////////

    // frame rate (input)
    strargs += " -r "+frate;

    // input image files
    strargs += " -i "+inpath.path;

    //////////

    // null audio
    strargs += " -an";

    // frame num (output)
    strargs += " -vframes "+nfrms;

    // bit rate
    if (this.mFfOFmtList.selectedItem.value=="mov_raw") {
      // raw format, no bitrate
    }
    else
      strargs += " -b:v "+bitr+"k";

    // output main options
    strargs += " " + this.mMainOpt.value;

    // pixel format
    let pixfmt = "";
    if (this.mMainOpt.value.indexOf("libx264")>0) {
      pixfmt = ",format=yuv420p";
    }

    // frame rate (output) / pixel format
    strargs += " -vf \"fps="+frate+pixfmt+"\" ";

    // overwrite
    strargs += " -y";

    // output movie file
    strargs += " "+outmov.path;

    let strdep = aDepTid.toString();
    if (aDepTid==-1) strdep = "";

    dd("ffmpeg: "+this.mFfExePathBox.value);
    dd("strargs: "+strargs);
    dd("strdep: "+strdep);
    this.appendLog("FFmpeg args: "+strargs+"\n\n");
    let tid = procMgr.queueTask(this.mFfExePathBox.value,
				strargs,
				strdep);
    dd("submit movie task="+tid);

    this.mOutMovPath = outmov;
  };

  dlg.startReenc = function (aEvent)
  {
    if (!this.mbRenderOK)
      return;

    var that = this;
    this.mTimer = timer.setInterval(function() {
      try {
	that.onTimerReenc();
      }
      catch (e) {
	dd("Error: "+e);
	debug.exception(e);
      }
    }, 100);

    this.disableButtons(true);
    this.submitFFmpegTasks(-1);
  };

  dlg.onTimerReenc = function()
  {
    let i;

    try {
      this.procTaskMsgs();
      if (procMgr.isEmpty()) {
	// all tasks have been done
	// --> reencoding completed
	this.finRenderTasks();
      }
    }
    catch (e) {
      // error: stop
      timer.clearInterval(this.mTimer);
      this.mTimer = null;
      procMgr.killAll();
      procMgr.setLogPath("");
      this._bRender = false;
      this.disableButtons(false);
      this.appendLog("Fatal error: "+e);
      this.appendLog("Tasks killed.");
      debug.exception(e);
      return;
    }
  };

  //////////////////////////////////////////////////////////////////

  dlg.onLoadPreviewPage = function ()
  {
    var that = this;

    this.mMovPreview = document.getElementById("movie_preview");
    this.mImgPreview = document.getElementById("image_preview");
    
    this.mSlider = document.getElementById("preview-anim-scale");
    this.mSlider.addEventListener(
      "dragStateChange", function (a) { try {that.onSliChg(a)} catch(e) {debug.exception(e)} }, false);

    dd("onLoadPreviewPage OK.");

    /*
    var elem = document.getElementById("movie_preview_play");
    elem.addEventListener("command", function(event){
      dd("xx:"+debug.dumpObjectTree(that.mMovPreview));
      that.mMovPreview.playPlugin();
    }, false);
     */
  };

  dlg.onSliChg = function (aEvent)
  {
    dd("isDrag "+aEvent.isDragging);
    if (aEvent.isDragging)
      return;
      
    let value = this.mSlider.value;
    dd("Slider chg value="+value);
    this.updatePreview(value);
  };

  dlg.mSerial=0;
  
  dlg.updatePreview = function (ifrm)
  {
    this.mSlider.min = 0;
    this.mSlider.max = this.mFrames-1;
    this.mSlider.value = ifrm;

    if (!this.mOutPath) return;
    
    let img = this.mOutPath.clone();
    if (!img)
      return;

    let base = this.mOutputBaseBox.value;
    let num = formatnum(ifrm, this.mFrames);
    base = base+"_frm_" + num;
    img.append(base + ".png");
    
    if (!img.exists())
      return;
    if (!img.isFile())
      return;

    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var URL = ios.newFileURI(img);
    dd("URL.spec="+URL.spec);

    var h = parseInt(this.mOutImgHeight.value);
    this.mImgPreview.setAttribute("src", URL.spec+"?dummy="+this.mSerial);
    ++this.mSerial;

    this.mImgPreview.setAttribute("width", this.mOutImgWidth.value);
    this.mImgPreview.setAttribute("height",h);

    this.mImgPreview.setAttribute("hidden",false);
    document.getElementById("imagebox-item").setAttribute("hidden",false);
    document.getElementById("moviebox-item").setAttribute("hidden",true);

    this.miPreviewFrm = ifrm;
  };

  dlg.startMovPreview = function ()
  {
    if (!this.mOutMovPath)
      return;
    if (!this.mOutMovPath.exists())
      return;
    if (!this.mOutMovPath.isFile())
      return;

    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var URL = ios.newFileURI(this.mOutMovPath);
    dd("URL.spec="+URL.spec);
    var h = parseInt(this.mOutImgHeight.value);
    this.mMovPreview.setAttribute("src", URL.spec);
    this.mMovPreview.setAttribute("width", this.mOutImgWidth.value);
    this.mMovPreview.setAttribute("height",h + 16);

    document.getElementById("imagebox-item").setAttribute("hidden",true);
    document.getElementById("moviebox-item").setAttribute("hidden",false);
    // this.mMovPreview.setAttribute("loop", true);
    
  };


  ////////////////////////////////////////////////////////
  // perform cleanup
  dlg.onUnload = function ()
  {
    // for the checkbox status to be correctly saved
    util.persistChkBox("pov-enable-clip-plane", document);
    util.persistChkBox("pov-enable-post-blend", document);
    util.persistChkBox("pov-enable-shadow", document);
    util.persistChkBox("pov-enable-edgelines", document);
    util.persistChkBox("ffmpeg-enable-check", document);
    util.persistChkBox("pov-enable-piximgs", document);

    // disable log recording
    procMgr.setLogPath("");
  };

  
} )();

