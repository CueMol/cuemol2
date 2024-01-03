// -*-Mode: C++;-*-
//
// $Id: cuemol2.js,v 1.153 2011/05/01 09:28:03 rishitani Exp $
//

dump("Initializing CueMol2...\n");
// dd("Platform ID="+util.getPlatformString());

var new_scid = -1;
var new_vwid = -1;

const pref = require("preferences-service");
const styleutil = require("styleutil");

if (cuemol.xpc.isInitialized()) {

  ////////////////////////////////
  // secondary window

  /*
  let bCmdLineOK = false;
  try {
    var cmdLine = window.arguments[0].QueryInterface(Ci.nsICommandLine);
    if (cmdLine) {
      // request for second instance with cmdline param from OS/Shell
      cuemol.cmdLineFiles = convCmdLineFiles(cmdLine);
      bCmdLineOK = true;
    }
  }
  catch (e) {}
   */

  if (/*!bCmdLineOK &&*/ window.arguments.length==2) {
    // request for new window from UI
    if (window.arguments[0]>=0)
      new_scid = window.arguments[0];
    if (window.arguments[1]>=0)
      new_vwid = window.arguments[1];
    dd("secondary win sc="+new_scid+", vw="+new_scid);
  }

}
else {

  ////////////////////////////////
  // initial startup

  // process command-line arguments (-conf flag)
  //  side effect: removes "-conf XXX" from cmdline array
  var confpath = util.getSysConfigFname(window.arguments);
  if (confpath===null) {
    alert(e);
    appStartup.quit(appStartup.eForceQuit);
  }

  // Initialize the application
  if (!cuemol.xpc.init(confpath)) {
    appStartup.quit(appStartup.eForceQuit);
  }

  // Load the user-defined global styles
  var stylem = cuemol.getService("StyleManager");
  var user_style = styleutil.getUserDefStyleFname();
  dd("User default style file: "+user_style);

  if (util.isFile(user_style))
    stylem.loadStyleSetFromFile(0, user_style, false);
  else
    stylem.createStyleSet("user", 0);

  var inconf = "DefaultViewInConf";
  if (pref.has("cuemol2.ui.viewinconf"))
    inconf = pref.get("cuemol2.ui.viewinconf");
  var vic = cuemol.getService("ViewInputConfig");
  vic.style = inconf+",UserViewConf";
}

cuemol.evtMgr = require("event").manager;

////////////////////////////////
// setup main object

function Qm2Main()
{
  // this.mQM = gQM;
  this.mMainWnd = null;
  this.mCallbkID = -1;
  this.mSceneCallbkID = -1;
  // this.mTgtView = null;
  this.mTgtScene = null;

  this.mSceSeqNo = 1;
  this.mViwSeqNo = 1;

  this.mCurHittestRes = null;

  this.mStrMgr = cuemol.getService("StreamManager");

  // prompt service
  this.mPrompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
    .getService(Ci.nsIPromptService);

  // window mediator
  this.mWinMed = Cc["@mozilla.org/appshell/window-mediator;1"]
    .getService(Ci.nsIWindowMediator);

  //this.mFilePick = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  // change the window title
  this.mWndTitleBase = "CueMol2 "+ cuemol.sceMgr.version + " (" + cuemol.sceMgr.ver_arch+")";
  this.setWindowTitle();

  var xthis = this;
  addEventListener("load", function () {xthis.onLoad();}, false);
  addEventListener("unload", function () {xthis.onUnLoad();}, false);

  // load selection history
  util.selHistory.loadFromPref();
}

////////////////////////////////
// setup canvas text renderer

Qm2Main.prototype.textRenderInit = function ()
{
  var canvas = document.createElementNS("http://www.w3.org/1999/xhtml", 'canvas');
  var handler2 = function (args) {
    var tr = args.obj;
    var text = tr.text;
    var fontstr = tr.font;
    var h = tr.height;
    dd("renderText handler called: "+text+", font="+fontstr);

    var width = ( function () {
      var ctx2 = canvas.getContext('2d');
      ctx2.font = fontstr;
      var mtx = ctx2.measureText(text);
      var w = Math.ceil(mtx.width);
      if (w%4 != 0)
        w += (4-w%4);
      return w;
    }) ();

    dd("renderText handler size: "+width);

    canvas.width = width;
    canvas.height = h;
    tr.width = width;
    
    var ctx2 = canvas.getContext("2d");
    ctx2.font = fontstr;
    ctx2.textBaseline = "bottom";
    ctx2.fillText(text, 0, h);
    
    var img = ctx2.getImageData(0,0,width, h);
    dd("img: "+img);
    var data = img.data;
    dd("data: "+data);
    var i, size = width * h;
    tr.resize(size);
    for (i=0; i<size; ++i) {
      //tr.setAt(i, data[i*4 + 0]+data[i*4 + 1]+data[i*4 + 2]+data[i*4 + 3]);
      tr.setAt(i, data[i*4 + 3]);
    }
  };

  var cbid2 =
    cuemol.evtMgr.addListener("renderText",
                              cuemol.evtMgr.SEM_EXTND, // event source type ID
                              cuemol.evtMgr.SEM_OTHER, // event type ID
                              cuemol.evtMgr.SEM_ANY, // source uid
                              handler2);
  
  addEventListener("unload", function () {
    //cuemol.evtMgr.removeListener(cbid);
    cuemol.evtMgr.removeListener(cbid2);
  }, false);
  
};

Qm2Main.prototype.clearLogContents = function ()
{
  if (cuemolui.logpanel)
    cuemolui.logpanel.clearLogContents();
};


////////////////////////////////
/// Global initialization for window instance

Qm2Main.prototype.onLoad = function ()
{
  // canvas text rendering initialization
  this.textRenderInit();

  var xthis = this;

  this.mMainWnd = document.getElementById("main_view");
  this.mMainWnd.mPanelContainer.addEventListener("select",
  function(aEvent) {
    try {
      xthis.activeViewChanged(aEvent);
    } catch (e) {
      debug.exception(e);
    }
  }, false);

  this.mStatusLabel = document.getElementById("status");
  this.mCtxtMenu = document.getElementById("viewctxtmenu");
  this.mMainMenuBar = document.getElementById("main-menubar");
  //window.alert('gQm2Main.init'+mview);

  //////////
  // Undo/redo updating
  this.mCmdUndo = document.getElementById("cmd_undo");
  this.mCmdRedo = document.getElementById("cmd_redo");
  this.updateCmdUndoState();

  //////////
  // Create initial (empty) tab
  if (new_scid<0 || new_vwid<0) {
    // Create new empty scene
    this.onNewScene(null);
  }
  else {
    // Create new tabmolview by window arguments
    this.mMainWnd.addMolViewTab(new_scid, new_vwid);
  }

  //////////
  // process command-line files (dragdropopen.js)
  var that = this;
  var cmdLine = window.arguments[0].QueryInterface(Ci.nsICommandLine);
  if (cmdLine.length>0) {
    window.setTimeout( function () {
      that.openFromShell(cmdLine);
    }, 0);
  }

  //////////
  // Setup drag&drap function (dragdropopen.js)
  var that = this;
  window.addEventListener("dragover", function(aEvent) {
    that.onDragOver(aEvent);
  }, false);
  window.addEventListener("dragleave", function(aEvent) {
    that.onDragLeave(aEvent);
  }, false);
  window.addEventListener("drop", function(aEvent) {
    that.onDrop(aEvent);
  }, false);

  // Setup menu //

  this.setupUpdateMenu();

  // // Check app updates when the system is idle enough
  // this.idleAutoUpdateCheck();

  try {
    this.setupShortcutKeys();
  } catch (e) {
    debug.exception(e);
  }
  
  //////////

/*
  if (cuemol.hasClass("PythonBridge")) {
    try {
      var pybr = cuemol.getService("PythonBridge");
      if (pybr) {
        var elem = document.getElementById("exec_scr_menuitem");
        elem.disabled = false;
      }
    }
    catch (e) {
    }
  }
  
  //////////

*/

  if (cuemol.hasClass("XmlRpcManager")) {
    try {
      var xrmgr = cuemol.getService("XmlRpcManager");
      if (xrmgr)
        xrmgr.start();
    }
    catch (e) {
      debug.exception(e);
    }
  }
}
  

Qm2Main.prototype.onUnLoad = function _Qm2Main_fini ()
{
  var stylem = cuemol.getService("StyleManager");
  var user_style = styleutil.getUserDefStyleFname();
  var usuid = stylem.hasStyleSet("user", 0);
  if (usuid>=0) {
    stylem.saveStyleSetToFile(0, usuid, user_style);
  }
  
  //window.alert('gQm2Main.fini');
  this.detachFromCurrentView();

  // cleanup tabmolview
  this.mMainWnd.removeAllTabs();

  if (this.idleObsRemover)
    this.idleObsRemover();

  dd("Qm2Main.fini() OK.");
}

//////////

Qm2Main.prototype.detachFromCurrentView = function()
{
  //if (this.mCallbkID>=0)
  //cuemol.evtMgr.removeListener(this.mCallbkID);

  if (this.mSceneCallbkID>=0)
    cuemol.evtMgr.removeListener(this.mSceneCallbkID);
  
  /*
  if (this.mSceneCallbkID>=0 && this.mTgtScene) {
    var res = this.mTgtScene.invoke1("removeListener", this.mSceneCallbkID);
    dd("Toolbox detach from scene: removeListener res="+res);
  }
   */
}

// Active tab of tabmolview is changed
Qm2Main.prototype.activeViewChanged = function (aEvent)
{
  this.detachFromCurrentView();
  
  var newview = this.mMainWnd.currentViewW;
  var newsce = newview.getScene();
  var that = this;

  newsce.setActiveViewID(newview.uid);

  if (!this.mTgtScene ||
      newsce.uid!=this.mTgtScene.uid) {
    var handler_scene = function (args) {
      that.sceneChanged(args);
    }
    this.mSceneCallbkID = cuemol.evtMgr.addListener(
      "",
      cuemol.evtMgr.SEM_SCENE, // target type
      cuemol.evtMgr.SEM_ANY, // event type
      newsce.uid, // source uid
      handler_scene);
    this.mTgtScene = newsce;
  }

  let title = newsce.name + ":" + newview.name;
  this.setWindowTitle(title);
}

//////////
//
// Mouse event handling (context menu)
// Undo event handling (scene)
//

Qm2Main.prototype.sceneChanged = function(args)
{
  var type_id = args.evtType;
  dd("Qm2Main> sceneChanged type_id="+type_id);
  if (type_id==cuemol.evtMgr.SEM_CHANGED &&
      args.method=="sceneUndoInfo") {
    dd("Qm2Main> sceneChanged - UNDOINFO");
    this.updateCmdUndoState();
  }
  else
  if (type_id==cuemol.evtMgr.SEM_PROPCHG &&
           args.obj.propname=="name") {
    //this.setWindowTitle(this.mTgtScene.name);
    let newview = this.mMainWnd.currentViewW;
    let newsce = newview.getScene();
    let title = newsce.name + ":" + newview.name;
    this.setWindowTitle(title);
  }
  return;
}

Qm2Main.prototype.setWindowTitle = function(scene_name)
{
  var win_elem = document.getElementById("cuemol2");
  if (scene_name)
    win_elem.setAttribute("title", this.mWndTitleBase + " - " + scene_name);
  else
    win_elem.setAttribute("title", this.mWndTitleBase);
}

////////////////////////////////////////////

Qm2Main.prototype.undo = function(n)
{
  if (n===undefined)
    n=0;
  // alert("undo: "+this.mTgtView);
  var scene = this.mMainWnd.currentSceneW;
  if (!scene)
    return;
  scene.undo(n);
  this.updateCmdUndoState();
  //scene = null;
}

Qm2Main.prototype.redo = function(n)
{
  if (n===undefined)
    n=0;
  var scene = this.mMainWnd.currentSceneW;
  if (!scene)
    return;
  scene.redo(n);
  this.updateCmdUndoState();
  //scene = null;
}

Qm2Main.prototype.updateCmdUndoState = function()
{
  // alert("UpdateUndoState: "+this.mTgtView);
  var scene = this.mMainWnd.currentSceneW;
  if (!scene) {
    dd("updateUndoRedoMenu> Error; Invalid Scene!!");
    this.mCmdUndo.setAttribute('disabled', true);
    this.mCmdRedo.setAttribute('disabled', true);
    return;
  }

  var bUndo = scene.isUndoable();
  var sUndoDesc = scene.getUndoDesc(0);
  this.mCmdUndo.setAttribute('disabled', !bUndo);
  this.mCmdUndo.setAttribute('label', "Undo: "+sUndoDesc);

  var bRedo = scene.isRedoable();
  var sRedoDesc = scene.getRedoDesc(0);
  this.mCmdRedo.setAttribute('disabled', !bRedo);
  this.mCmdRedo.setAttribute('label', "Redo: "+sRedoDesc);

  //scene = null;
}

Qm2Main.prototype.populateUndoMenu = function(aEvent)
{
  var menu = aEvent.currentTarget;
  dd("PopulateUndoMenu: "+menu.id);

  var scene = this.mMainWnd.currentSceneW;

  //while (menu.firstChild)
  //menu.removeChild(menu.firstChild);
  util.clearMenu(menu);
  var nundo = scene.getUndoSize();
  for (var i=0; i<nundo; ++i)
    util.appendMenu(document, menu, i, scene.getUndoDesc(i));
}

Qm2Main.prototype.populateRedoMenu = function(aEvent)
{
  var menu = aEvent.currentTarget;
  dd("PopulateUndoMenu: "+menu.id);

  var scene = this.mMainWnd.currentSceneW;

  //while (menu.firstChild)
  //menu.removeChild(menu.firstChild);

  util.clearMenu(menu);
  var nredo = scene.getRedoSize();
  for (var i=0; i<nredo; ++i)
    util.appendMenu(document, menu, i, scene.getRedoDesc(i));
}

Qm2Main.prototype.popupUndo = function(aEvent)
{
  aEvent.stopPropagation();
  var value = parseInt(aEvent.target.value);
  dd("undo: "+ value);
  this.undo(value);
}

Qm2Main.prototype.popupRedo = function(aEvent)
{
  aEvent.stopPropagation();
  var value = parseInt(aEvent.target.value);
  dd("redo: "+ value);
  this.redo(value);
}

Qm2Main.prototype.clearUndoData = function()
{
  let scene = this.mMainWnd.currentSceneW;
  if (!scene)
    return;

  scene.clearUndoData();
  this.updateCmdUndoState();
}

////////////////////////////////////////////

/// Main implementation for tab-close operation
Qm2Main.prototype.closeTabImpl = function(tab, bCloseLastTab)
{
  var bMakeNewTab = false;
  if (!bCloseLastTab && this.mMainWnd.getTabCount()<=1) {
    // util.alert(window, "Can't close the Last Tab !!");
    // return false;
    bMakeNewTab = true;
  }

  //var tab  = this.mMainWnd.selectedTab;
  //var scene = this.mMainWnd.currentSceneW;
  var scid = tab.linkedSceneID;
  dd("CloseTabImpl> scene id="+scid);
  if (typeof scid === "undefined" || scid === null) {
    dd("closeTabImpl(): scene ID for tab "+tab+" is NULL");
    return false;
  }
  var scene = cuemol.sceMgr.getScene(scid);

  var nViewCnt = scene.getViewCount();

  if (nViewCnt==1 && scene.modified) {
    var scene_name = scene.name;
    if (!scene_name) scene_name = "";
    var result = util.confirmYesNoCancel(
      window, "Scene \""+scene_name+"\" is not saved. Save changes?");

    // alert("result="+result);
    if (result==0) {
      // Yes -> save changes and close
      if (!this.onSaveScene()) {
        // save scene (as) is canceled --> cancel closing
        return false;
      }
    }
    else if (result==1) {
      // Cancel -> cancel closing
      return false;
    }
    else {
      // No -> close immediately
    }
  }

  // remove the tab
  if (this.mMainWnd.getTabCount()==1) {
    // the last tab cannot be removed by removeTab()
    this.mMainWnd.removeAllTabs();
    if (bMakeNewTab)
      this.onNewScene(null);
  }
  else {
    this.mMainWnd.removeTab(tab);
  }
  // alert("tab removed, cnt= "+this.mMainWnd.getTabCount());
  
  return true;
}

/// close single active tab (from menu)
Qm2Main.prototype.onCloseTab = function()
{
  var tab  = this.mMainWnd.selectedTab;
  this.closeTabImpl(tab, false);
}

/// close all tabs in the window (from onClose event)
Qm2Main.prototype.onCloseEvent = function()
{
  try {
    dd("Window close requested.");
    var res;
    while (this.mMainWnd.getTabCount()>0) {
      res = this.closeTabImpl(this.mMainWnd.selectedTab, true);
      if (!res) {
        // alert("Close-app cancel requested");
        return false;
      }
    }
    
    // save panel arrangement
    cuemolui.sidepanel.saveSession("left");

    // save selection history
    util.selHistory.saveToPref();
  }
  catch (e) {
    debug.exception(e);
    return false;
  }

  // close window and quit application if required
  this.closeWindow();

  return true;
}

// 
Qm2Main.prototype.closeWindow = function()
{
  var windowCount = 0;
  var wm = this.mWinMed;
  var e = wm.getEnumerator("cuemol2:mainwnd");
  
  while (e.hasMoreElements()) {
    var w = e.getNext();
    if (++windowCount == 2) 
      break;
  }
  
  // If we're down to the last window and someone tries to shut down, check to make sure we can!
  if (windowCount == 1) {
    if (!canQuitApplication("lastwindow")) {
      return false;
    }
    else {
      window.close();
      goQuitApplication();
      return true;
    }
  }

  window.close();
  return true;
};

////////////////////////////////

Qm2Main.prototype.showPovRenderDlg = function()
{
  var stylestr = "chrome,resizable=yes,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:RenderPovDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/render-pov-dlg.xul",
		      "", stylestr, scene_id, view_id);
}

////////////////

Qm2Main.prototype.createNewView = function(sc, vwname, binhr)
{
  if (!sc)
    return null;

  var vw;
  vw = sc.createView();
  vw.name = vwname;

  if (binhr)
    sc.loadViewFromCam( vw.uid, "__current" );

  return vw;
}

Qm2Main.prototype.createNewScene = function(scname)
{
  if (!scname) {
    var strbundle = document.getElementById("strings");
    scname = util.makeUniqName(strbundle, "cuemol2_defaultSceneName",
                                          function (a) {return cuemol.sceMgr.getSceneByName(a);} );
  }

  var sc, vw;

  sc = cuemol.sceMgr.createScene();
  sc.setName(scname);

  // Load optional default style files (read-only)
  var stylem = cuemol.getService("StyleManager");
  // stylem.loadStyleSetFromFile(sc.uid, "em_style.xml", true);

  // Initial view's name is always "0"
  vw = this.createNewView(sc, "0", false);

  return [sc, vw];
}

Qm2Main.prototype.onNewScene = function(scname)
{
  var result = this.createNewScene(scname);
  this.mMainWnd.addMolViewTab(result[0].uid, result[1].uid);
  return result;
}

Qm2Main.prototype.onNewTabWindow = function(bWin)
{
  var args = new Object();
  var cursc = args.cursc = this.mMainWnd.currentSceneW;
  args.bWin = bWin;
  args.ok = false;
  args.bView = false;
  args.bInhr = false;
  args.name = null;
  window.openDialog("chrome://cuemol2/content/new-tabwnd-dlg.xul",
		    "New Tab",
		    "chrome,modal,resizable=no,dependent,centerscreen",
                    args);
  
  if (!args.ok)
    return;

  if (args.bInhr && args.bView) {
    let vwid = this.mMainWnd.getCurrentViewID();
    //cursc.invoke2("saveViewToCam", vwid, "__current");
    cursc.saveViewToCam(vwid, "__current");
  }

  if (!args.bWin) {
    // Open in tab
    if (args.bView) {
      let newvw = this.createNewView(cursc, args.name, args.bInhr);
      let newvw_id = newvw.uid;
      let cursc_id = cursc.uid;
      this.mMainWnd.addMolViewTab(cursc_id, newvw_id);
      cursc.loadViewFromCam(newvw_id, "__current");
    }
    else {
      this.onNewScene(args.name);
    }
  }
  else {
    // Open in new window
    let newvw_id = -1;
    let cursc_id = -1;
    if (args.bView) {
      let vw = this.createNewView(cursc, args.name, args.bInhr);
      if (!vw)
        return;
      cursc_id = cursc.uid;
      newvw_id = vw.uid;
      cursc.loadViewFromCam(newvw_id, "__current");
    }
    window.openDialog("chrome://cuemol2/content/cuemol2.xul",
                      "",
                      "chrome,all,dialog=no", cursc_id, newvw_id);
  }
}

Qm2Main.prototype.openAboutDialog = function()
{
  var win = this.mWinMed.getMostRecentWindow("CueMol2:About");
  if (win)
    win.focus();
  else
    window.openDialog("chrome://cuemol2/content/aboutDialog.xul",
		      "About", "centerscreen,chrome,resizable=no");
}

Qm2Main.prototype.onMolMerge1 = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:MolMrgDlg");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/mol_merge.xul",
                      "", stylestr, scene_id, view_id);
  }
};

Qm2Main.prototype.onMolDelete1 = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:MolDelDlg");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/mol_delete.xul",
                      "", stylestr, scene_id, view_id);
  }
};

Qm2Main.prototype.onChgChName1 = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:ChgChnmDlg");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/chg_chname.xul",
                      "", stylestr, scene_id, view_id);
  }
};

Qm2Main.prototype.onShiftResIndex1 = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:ChgResIndDlg");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/chg_resindex.xul",
                      "", stylestr, scene_id, view_id);
  }
};

Qm2Main.prototype.onSSMSup1 = function()
{
  //var stylestr = "centerscreen,chrome,resizable=no";
  //var stylestr = "chrome,modal,resizable=no,dependent,centerscreen";
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:SSMSupDlg");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/ssm_sup.xul",
		      "", stylestr, scene_id, view_id);
  }

};

Qm2Main.prototype.onMolBondEditor = function ()
{
  var stylestr = "chrome,resizable=yes,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var args = Cu.getWeakReference({scene_id: scene_id});

  var win = this.mWinMed.getMostRecentWindow("CueMol2:BondEditDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/bond-edit-dlg.xul",
		      "", stylestr, args);
};

Qm2Main.prototype.calcMolSurf = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:MsmsMakeSurfDlg");
  if (win)
    win.focus();
  else
    window.openDialog("chrome://cuemol2/content/tools/makesurf.xul",
		      "", stylestr, scene_id);
};

Qm2Main.prototype.calcMsmsSurf = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  // var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:MsmsMakeSurfDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/msms-makesurf.xul",
		      "", stylestr, scene_id);
}

Qm2Main.prototype.calcApbsPot = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  // var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:ApbsCalcPotDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/apbs-calcpot.xul",
		      "", stylestr, scene_id);
}

Qm2Main.prototype.surfCutByPlaneTool = function()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this.mMainWnd.getCurrentSceneID();
  var view_id = this.mMainWnd.getCurrentViewID();
  var win = this.mWinMed.getMostRecentWindow("CueMol2:SurfCutByPlaneDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/surf-cutbyplane.xul",
		      "", stylestr, scene_id, view_id);
}

Qm2Main.prototype.showConfigDlg = function ()
{
#ifdef XP_MACOSX
  var stylestr = "chrome,titlebar,toolbar,centerscreen,dialog=yes,resizable=yes";
#else
  var stylestr = "chrome,titlebar,toolbar,centerscreen,resizable=yes, modal";
#endif

  var win = this.mWinMed.getMostRecentWindow("CueMol2:Config");
  if (win)
    win.focus();
  else {
    window.openDialog("chrome://cuemol2/content/config-dialog.xul",
                      "Options", stylestr, cuemolui);
  }
}

Qm2Main.prototype.showPropDlg = function (aTarget, aScene, aWindow, aTypeName)
{
  var URL;

  URL = "chrome://cuemol2/content/generic-propdlg.xul";
  if (aTypeName && aTypeName=="renderer") {
    if (aTarget.type_name == "simple" ||
	aTarget.type_name == "trace" )
      URL = "chrome://cuemol2/content/property/simple-propdlg.xul";
    else if (aTarget.type_name == "ballstick" ||
	     aTarget.type_name == "anisou")
      URL = "chrome://cuemol2/content/property/ballstick-propdlg.xul";
    else if (aTarget.type_name == "tube")
      URL = "chrome://cuemol2/content/property/tube-propdlg.xul";
    else if (aTarget.type_name == "ribbon")
      URL = "chrome://cuemol2/content/property/ribbon-propdlg.xul";
    else if (aTarget.type_name == "cartoon")
      URL = "chrome://cuemol2/content/property/cartoon-propdlg.xul";
    else if (aTarget.type_name == "atomintr")
      URL = "chrome://cuemol2/content/atomintr-propdlg.xul";
    else if (aTarget.type_name == "molsurf")
      URL = "chrome://cuemol2/content/property/molsurf-propdlg.xul";
    else if (aTarget.type_name == "dsurface")
      URL = "chrome://cuemol2/content/dsurf-propdlg.xul";
    else if (aTarget.type_name == "contour" ||
             aTarget.type_name == "gpu_mapmesh" ||
             aTarget.type_name == "gpu_mapvol")
      URL = "chrome://cuemol2/content/property/contour-propdlg.xul";
    else if (aTarget.type_name == "isosurf")
      URL = "chrome://cuemol2/content/property/isosurf-propdlg.xul";
    else if (aTarget.type_name == "cpk")
      URL = "chrome://cuemol2/content/property/cpk-propdlg.xul";
    else if (aTarget.type_name == "nucl")
      URL = "chrome://cuemol2/content/property/nucl-propdlg.xul";
    else if (aTarget.type_name == "disorder")
      URL = "chrome://cuemol2/content/property/disorder-propdlg.xul";
    else
      URL = "chrome://cuemol2/content/property/renderer-propdlg.xul";
  }
  else if (aTypeName && aTypeName=="object") {
    URL = "chrome://cuemol2/content/property/object-propdlg.xul";
  }
  
#ifdef XP_MACOSX
  var style = "chrome,resizable=yes,dependent,centerscreen,modal";
  var parent_win = null;
#else
  var style = "chrome,resizable=yes,dependent,centerscreen,modal";
  var parent_win = aWindow;
#endif

  var args_obj = {target: aTarget, scene: aScene, bOK: false};
  var args = Cu.getWeakReference(args_obj);

  var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

  dd("ShowPropDlg: "+URL);
  var win = ww.openWindow(parent_win,
			  URL, "Object properties",
                          style, args);

  dd("done OK="+args_obj.bOK);
  return args_obj.bOK;
}

Qm2Main.prototype.setBgColor = function (aStrCol)
{
  var scene = this.mMainWnd.currentSceneW;
  var col = cuemol.makeColor(aStrCol, scene.uid);

  dd("Qm2Main.setBgColor> new color="+aStrCol);
  // EDIT TXN START //
  scene.startUndoTxn("Set background color");
  try {
    scene.bgcolor = col;
  }
  catch (e) {
    dd("***** ERROR: Change bgcolor "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  dd("Qm2Main.setBgColor> OK.");
};


Qm2Main.prototype.setRendColoring = function (aType, aRend)
{
  var rend, coloring = null, clsname = "", scene;
  try {
    coloring = aRend.coloring;
    clsname = coloring._wrapped.getClassName();
  }
  catch (e) {
    debug.exception(e);
    return;
  }

  var rend_type = "";
  if ('type_name' in aRend)
    rend_type = aRend.type_name;

  // check molsurf painting
  var bChgColMode = false;
  if (rend_type=="molsurf") {
    if (aRend.colormode == "molecule") {
      // already in molecule mode --> does not force to change
    }
    else {
      // change to molecule mode --> force change in coloring
      bChgColMode = true;
      clsname = "";
    }
  }
  
  scene = aRend.getScene();
  if (!scene) {
    dd("panel.onChgColoring> Error; scene is NULL!!");
    return;
  }

  coloring = null;
  var style = null;

  if (aType.indexOf("style-")==0) {
    style = aType.substr("style-".length); //"DefaultHSCPaint";
    var curstyle = aRend.style;
    curstyle = styleutil.remove(curstyle, /Paint$/);
    style =  styleutil.push(curstyle, style);
    dd("setRendColoring> new style: "+style);

    // EDIT TXN START //
    scene.startUndoTxn("Change coloring style");
    try {
      if (bChgColMode)
	aRend.colormode = "molecule";
      cuemol.resetProp(aRend, "coloring");
      aRend.applyStyles(style);
    }
    catch (e) {
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
  }
  else {
    var cmode = "molecule";
    switch (aType) {

    case "paint-type-cpk":
      //if (clsname=="CPKColoring")
      //return;
      coloring = cuemol.createObj("CPKColoring");
      coloring.col_C = cuemol.makeColor("$molcol", scene.uid);
      break;
      
    case "paint-type-cpk-darkgray":
      coloring = cuemol.createObj("CPKColoring");
      coloring.col_C = cuemol.makeColor("#404040", scene.uid);
      break;

    case "paint-type-cpk-lightgray":
      coloring = cuemol.createObj("CPKColoring");
      coloring.col_C = cuemol.makeColor("#C0C0C0", scene.uid);
      break;

    case "paint-type-bfac":
    if (clsname=="BfacColoring")
      return;
    coloring = cuemol.createObj("BfacColoring");
    break;

    case "paint-type-rainbow":
    if (clsname=="RainbowColoring")
      return;
    coloring = cuemol.createObj("RainbowColoring");
    break;

    case "paint-type-paint":
      if (clsname=="PaintColoring")
        return;
      coloring = this.createDefPaintColoring();
      break;
      
    case "paint-type-solid":
      if (clsname=="SolidColoring")
        return;
      coloring = cuemol.createObj("SolidColoring");
      break;

    default:
      dd("setRendColoring> Error unknown id="+aType);
      return;
    } // switch

    // EDIT TXN START //
    scene.startUndoTxn("Change coloring");
    try {
      if (bChgColMode)
	aRend.colormode = cmode;
      if (coloring)
	aRend.coloring = coloring;
    }
    catch (e) {
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
    
    //delete coloring;
    coloring = null;


  }
  
};

Qm2Main.prototype.toggleHWStereo = function ()
{
  var view = this.mMainWnd.currentViewW;
  var natwin = this.mMainWnd.currentNativeWidget;
  var curMode = view.stereoMode;

  if (curMode=="hardware") {
    view.stereoMode = "none";
    natwin.reload();
  }
  else if (curMode=="none") {
    view.stereoMode = "hardware";
    natwin.reload();
  }

  // delete view;
}

Qm2Main.prototype.togglePerfMeas = function (ev)
{
  let sm = cuemol.getService("SceneManager");
  let bchk = ev.target.checked;
  if (!bchk) {
    // start measure
    this.clearLogContents();
    sm.enablePerfMeas(1);
    ev.target.checked = true;
  }
  else {
    sm.disablePerfMeas();
    ev.target.checked = false;
  }
}

///////////////
// Updater functions

Qm2Main.prototype.idleAutoUpdateCheck = function ()
{
  const time = 10;
  var that = this;

  if (pref.get("cuemol2.ui.updater.dontcheck")) {
    return;
  }

  var idleService = Cc["@mozilla.org/widget/idleservice;1"]
    .getService(Ci.nsIIdleService);
  var idleObserver = {
  observe: function(subject, topic, data) {
    if (topic=="back") return;
    // alert("topic: " + topic + "\ndata: " + data);
    idleService.removeIdleObserver(idleObserver, time);
    this.idleObsRemover = null;
    that.checkForUpdates();
  }
  };

  idleService.addIdleObserver(idleObserver, time);
  this.idleObsRemover = function () {
    idleService.removeIdleObserver(idleObserver, time);
  }
}

Qm2Main.prototype.checkForUpdates = function ()
{
}

Qm2Main.prototype.setupUpdateMenu = function ()
{
//   var updates =Cc["@mozilla.org/updates/update-service;1"].
//     getService(Ci.nsIApplicationUpdateService);
  
//   // Disable the UI if the update enabled pref has been locked by the
//   // administrator or if we cannot update for some other reason
//   var checkForUpdates = document.getElementById("help-menu-update");
//   var canCheckForUpdates = updates.canCheckForUpdates;
// // alert("canCheckForUpdates: "+canCheckForUpdates);
//   checkForUpdates.setAttribute("disabled", !canCheckForUpdates);

//   //if (!canCheckForUpdates)
//   //return;
}

Qm2Main.prototype.closeUpdatePopup = function (event)
{
  var neverchk = document.getElementById('never-update-check').checked;
  document.getElementById('update-alert-popup').hidePopup();

  //const pref = require("preferences-service");

  pref.set("cuemol2.ui.updater.dontcheck", neverchk);

  pref.set("cuemol2.ui.updater.checkedversion", this.mUpdateVer);
  this.mUpdateURL = null;
  this.mUpdateVer = null;
}

Qm2Main.prototype.goDownloadSite = function ()
{
  document.getElementById('update-alert-popup').hidePopup();

  if (! 'mUpdateURL' in this || !this.mUpdateURL)
    return;
  
  // first construct an nsIURI object using the ioservice
  var ioservice = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var uriToOpen = ioservice.newURI(this.mUpdateURL, null, null);

  //const pref = require("preferences-service");
  pref.set("cuemol2.ui.updater.checkedversion", this.mUpdateVer);
  this.mUpdateURL = null;
  this.mUpdateVer = null;

  var extps = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService);

  // now, open it!
  extps.loadURI(uriToOpen, null);
};

Qm2Main.prototype.setupShortcutKeys = function ()
{
  var keyset = document.getElementById("shortcutKeyset");
  cuemolui.shortcut.init(keyset);
}

///////////////
// MRU menus

Qm2Main.prototype.populateFileMRUMenu = function (aEvent)
{
  try {
    //alert("Populate MRU: "+aEvent.target.id);
    var mru = require("mru-files");
    mru.buildMRUMenu(document, aEvent.target);
  }
  catch (e) {
    debug.exception(e);
  }
}

Qm2Main.prototype.onFileOpenMRU = function (aEvent)
{
  var elem = aEvent.target;
  var fname = elem.getAttribute("fname");
  var ftype = elem.getAttribute("ftype");
  var label = elem.getAttribute("label");

  //alert("onFileOpenMRU: "+debug.dumpObjectTree(aEvent.target));
  //alert("onFileOpenMRU: "+aEvent.target.localName);
  //alert("onFileOpenMRU: "+fname+", type="+ftype);

  if (ftype=="qsc_xml" || ftype=="psefile")
    this.openSceneImpl(fname, ftype);
  else if (ftype=="scr-intjs")
    this.execIntJS(fname);
  else if (ftype=="scr-python")
    this.execPython(fname);
  else
    this.fileOpenHelper1(fname, label, ftype);
};

Qm2Main.prototype.clearMRUMenu = function (aEvent)
{
  var mru = require("mru-files");
  mru.clearMRU();
};

/////////
// View/Scene menu routines

Qm2Main.prototype.showScenePropDlg = function ()
{
  var target = this.mMainWnd.currentSceneW;
  this.showPropDlg(target,
                   target,
		   window, "scene");
};

Qm2Main.prototype.onSceneMenuShowing = function (aEvent)
{
  var scene = this.mMainWnd.currentSceneW;

  item = document.getElementById("mainmenuUseColProof");
  if (scene.use_colproof &&
      scene.icc_filename!="") {
    item.setAttribute("checked", "true");
      }
  else {
    item.removeAttribute("checked");
  }
};

Qm2Main.prototype.onToggleColProof = function (aEvent)
{
  var scene = this.mMainWnd.currentSceneW;

  if (scene.use_colproof &&
      scene.icc_filename!="") {
    // turn of proofing
    scene.use_colproof = false;
  }
  else {
    // turn on proofing
    scene.use_colproof = true;
    if (scene.icc_filename=="") {
      // use default CMYK colorspace
      scene.icc_filename="GenericCMYK.icm";
    }
  }
};

Qm2Main.prototype.showViewPropDlg = function ()
{
  var target = this.mMainWnd.currentViewW;
  this.showPropDlg(target,
		   target.getScene(),
		   window, "view");
};

Qm2Main.prototype.onViewMenuShowing = function (aEvent)
{
  var target = this.mMainWnd.currentViewW;

  var elem_pers = document.getElementById("view-menu-perspec");
  var elem_ortho = document.getElementById("view-menu-ortho");
  if (target.perspective) {
    elem_pers.setAttribute("checked", true);
    elem_ortho.removeAttribute("checked");
  }
  else {
    dd("perspec "+target.perspective);
    elem_pers.removeAttribute("checked");
    elem_ortho.setAttribute("checked", true);
  }
};

Qm2Main.prototype.onViewProjChg = function (aEvent)
{
  var id = aEvent.target.id;
  var target = this.mMainWnd.currentViewW;
  if (id=="view-menu-ortho") {
    target.perspective = false;
  }
  else {
    target.perspective = true;
  }
};

//

Qm2Main.prototype.onViewMenuMarkShowing = function (aEvent)
{
  var target = this.mMainWnd.currentViewW;

  var elem_cross = document.getElementById("view-menu-mark-cross");
  var elem_axis = document.getElementById("view-menu-mark-axis");
  var elem_none = document.getElementById("view-menu-mark-none");
  var val = target.centerMark;
  if (val=="crosshair") {
    elem_cross.setAttribute("checked", true);
    elem_axis.removeAttribute("checked");
    elem_none.removeAttribute("checked");
  }
  else if (val=="axis") {
    elem_axis.setAttribute("checked", true);
    elem_cross.removeAttribute("checked");
    elem_none.removeAttribute("checked");
  }
  else {
    elem_none.setAttribute("checked", true);
    elem_cross.removeAttribute("checked");
    elem_axis.removeAttribute("checked");
  }
};

Qm2Main.prototype.onViewMarkChg = function (aEvent)
{
  var id = aEvent.target.id;
  var target = this.mMainWnd.currentViewW;
  if (id=="view-menu-mark-cross") {
    target.centerMark="crosshair";
  }
  else if (id=="view-menu-mark-axis") {
    target.centerMark="axis";
  }
  else {
    target.centerMark="none";
  }
};

Qm2Main.prototype.onWinListPopupShowing = function (aEvent)
{
  let typ = null;
  let enm = this.mWinMed.getEnumerator(typ);
  
  let base = this.mWndTitleBase+" - ";

  let win_list = [];
  let dlg_list = [];

  while (enm.hasMoreElements()) {
    let win = enm.getNext();
    let nm = "";
    
    let win_elem_list = win.document.getElementsByTagName("window");
    if (win_elem_list.length>0) {
      let win_elem = win_elem_list[0];
      nm = win_elem.getAttribute("title");
      if (nm.lastIndexOf(base)==0) {
        let label = nm.substr(base.length);
        win_list.push([nm, label]);
      }
      else {
        dlg_list.push([nm, nm]);
      }
    }
    else {
      let dlg_elem_list = win.document.getElementsByTagName("dialog");
      if (dlg_elem_list.length>0) {
        let dlg_elem = dlg_elem_list[0];
        nm = dlg_elem.getAttribute("title");
        dlg_list.push([nm, nm]);
      }
    }
    
    dd("Win: "+nm);
  }

  const util = require("util");
  let menu = aEvent.target;
  util.clearMenu(menu);

  let win_elem = document.getElementById("cuemol2");
  let thiswnd = win_elem.getAttribute("title");
  let n = win_list.length;
  let i;
  for (i=0; i<n; i++) {
    let value = win_list[i][0];
    let label = win_list[i][1];
    dd("Win "+i+", val="+value+", lab="+label);
    var item = util.appendMenu(document, menu, value, label);
    item.setAttribute("oncommand", "gQm2Main.onWinListSel(event)");
    item.setAttribute("type", "radio");
    item.setAttribute("autocheck", "false");
    if (value==thiswnd)
      item.setAttribute("checked", "true");
  }

  n = dlg_list.length;
  if (n>0)
    util.appendMenuSep(document, menu);

  for (i=0; i<n; i++) {
    let value = dlg_list[i][0];
    let label = dlg_list[i][1];
    var item = util.appendMenu(document, menu, value, label);
    item.setAttribute("oncommand", "gQm2Main.onWinListSel(event)");
  }
};

Qm2Main.prototype.onWinListSel = function (aEvent)
{
  let typ=null;
  //let value = aEvent.target.value;
  //dd("Window: val="+value);
  let value = aEvent.target.getAttribute("value");
  dd("Window: val2="+value);

  let enm = this.mWinMed.getEnumerator(typ);
  while (enm.hasMoreElements()) {
    let win = enm.getNext();
    let win_elem_list = win.document.getElementsByTagName("window");
    if (win_elem_list.length>0) {
      let win_elem = win_elem_list[0];
      let nm = win_elem.getAttribute("title");
      if (nm==value) {
        win.focus();
        return;
      }
    }
    else {
      let dlg_elem_list = win.document.getElementsByTagName("dialog");
      if (dlg_elem_list.length>0) {
        let dlg_elem = dlg_elem_list[0];
        let nm = dlg_elem.getAttribute("title");
        if (nm==value) {
          win.focus();
          return;
        }
      }
    }
  }
};

