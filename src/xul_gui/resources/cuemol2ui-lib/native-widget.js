// -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
//
// Native widget handling code
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const cuemol = require("cuemol");
const dd = debug_util.dd;

const pref = require("preferences-service");

//const NATWIN_CID = "@cuemol.org/XPCNativeWindow";
//const XPCCUEMOL_CID = "@cuemol.org/XPCCueMol";
//var xpc = Cc[XPCCUEMOL_CID].getService(Ci.qICueMol);

function setupScriptResize(aFrm)
{
  var boxObj = aFrm.boxObject;
  var natwin = aFrm.native_window;
  dd("boxObj: "+boxObj);
  
  //var target = aFrm.contentWindow;
  dd("aFrm.contentWindow = "+aFrm.contentWindow);

  function onResize(aEvent)
  {
    try {
      //var boxObj = aFrm.boxObject;
      //dd("onResize aFrm: "+aFrm);
      //dd("onResize boxObj: "+boxObj);
      // cuemol.putLogMsg("onResize "+boxObj.x+", "+boxObj.y+", "+boxObj.width+", "+boxObj.height);
      dd("onResize "+boxObj.x+", "+boxObj.y+", "+boxObj.width+", "+boxObj.height);
      natwin.resize(boxObj.x, boxObj.y, boxObj.width, boxObj.height);
    }
    catch (e) {
      debug_util.exception(e);
    }
  }
  aFrm.contentWindow.addEventListener("resize", onResize, false);

  //////////
  // LOAD

  function onLoad(aEvent) {
    dd("NativeWidget: load");
    dd("SIZE "+boxObj.x+", "+boxObj.y+", "+boxObj.width+", "+boxObj.height);
    natwin.resize(boxObj.x, boxObj.y, boxObj.width, boxObj.height);
    natwin.show();
  }
  aFrm.contentWindow.addEventListener("load", onLoad, false);

  //////////
  // MOUSE WHEEL

  function onMouseWheel(aEvent) {
    //dd("NativeWidget: onMouseWheel");
    natwin.handleEvent(aEvent);
  }
  aFrm.contentWindow.addEventListener("DOMMouseScroll", onMouseWheel, false);

  //////////
  // UNLOAD

  function onUnload(aEvent)
  {
    dd("NativeWidget: remove native window lisnters.");
    aFrm.contentWindow.removeEventListener("resize", onResize, false);
    aFrm.contentWindow.removeEventListener("DOMMouseScroll", onMouseWheel, false);
    natwin.unload();
  }
  aFrm.addEventListener("unload", onUnload, false);

  //natwin.resize(boxObj.x, boxObj.y, boxObj.width, boxObj.height);
};

/*
function setupNativeResize(aFrm)
{
  var natwin = aFrm.native_window;

  var el = natwin.QueryInterface(Ci.nsIDOMEventListener);
  aFrm.addEventListener("resize", el, false);

  function onUnload(aEvent)
  {
    dd("NativeWidget: remove native window lisnters.");
    aFrm.removeEventListener("resize", el, false);
    natwin.unload();
  }
  aFrm.contentWindow.addEventListener("unload", onUnload, false);
}
*/

var mNatwinTab = {};

function makeTabKey(natwin)
{
    var scid = natwin.sceneID;
    var vwid = natwin.viewID;
    var key = "k-"+scid+"-"+vwid;
    return key;
};

exports.setup = function (window, aFrm, aScID, aVwID)
{

  try {
    //var natwin = Cc[NATWIN_CID].createInstance(Ci.qINativeWindow);
    var natwin = cuemol.xpc.createNativeWidget();
    if (!natwin) {
      dd("FATAL ERROR: cannot create native widget.");
      window.alert("FATAL ERROR: cannot create native widget.");
      return;
    }

    // Get base window object
    var treeOwner = window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShellTreeItem)
          .treeOwner;
    var docShell = treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIXULWindow)
        .docShell;

    var baseWindow = docShell.QueryInterface(Ci.nsIBaseWindow);
    var baseWindow2 = treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
      .QueryInterface(Ci.nsIBaseWindow);

    //dd("**** Parent Native Window = " + baseWindow.parentNativeWindow);
    dd("**** Native Handle = " + baseWindow2.nativeHandle);

    natwin.setup(docShell, baseWindow);
    aFrm.native_window = natwin;

    // dd("Native widget overlay target elem: "+aFrm);

    // set preferences from gecko-prefs
    setPrefs(natwin);

    // setup OpenGL, etc
    natwin.load(aScID, aVwID);

    setupScriptResize(aFrm);
    //setupNativeResize(aFrm);

    var key = makeTabKey(natwin);
    mNatwinTab[key] = natwin;

    return natwin;
  }
  catch (e) {
    debug_util.exception(e);
  }
};

/// Re-setup molview (for event handler)
exports.resetup = function (window, aFrm)
{
  try {
    setupScriptResize(aFrm);
    //setupNativeResize(aFrm);
  }
  catch (e) {
    debug_util.exception(e);
  }
};

exports.finalize = function (natwin)
{
    var key = makeTabKey(natwin);
    delete mNatwinTab[key];
    natwin.unload();
};

exports.updateNatWins = function ()
{
  for (var i in mNatwinTab) {
    dd("Update: "+i);
    var natwin = mNatwinTab[i];
    setPrefs(natwin);
  }
};

function setPrefs(natwin)
{
  //window.alert("use-gl-shader = "+natwin.useGlShader);
  dd("********** Use-gl-shader = "+natwin.useGlShader);
  if (pref.has("cuemol2.ui.view.use_gl_shader")) {
    let val = pref.get("cuemol2.ui.view.use_gl_shader");
    dd("********** pref use-gl-shader = "+val);
    natwin.useGlShader = val;
  }
  else
    natwin.useGlShader = false; // default: not use glshader

  if (pref.has("cuemol2.ui.view.use_hidpi"))
    natwin.useHiDPI = pref.get("cuemol2.ui.view.use_hidpi");
  
  if (pref.has("cuemol2.ui.mouse-multitouch-pad"))
    natwin.useMultiPad = pref.get("cuemol2.ui.mouse-multitouch-pad");
  
  if (pref.has("cuemol2.ui.mouse-emulate-rbutton"))
    natwin.useRbtnEmul = pref.get("cuemol2.ui.mouse-emulate-rbutton");

  if (pref.has("cuemol2.ui.mouse-momentum-scroll")) {
    let vwid = natwin.viewID;
    dd("setPrefs view="+vwid);
    let view = cuemol.getView(vwid);
    if (view) {
      let f = pref.get("cuemol2.ui.mouse-momentum-scroll");
      dd("setPrefs mms="+ f );
      view.trans_mms = view.rot_mms = f;
    }
  }
};

