// -*-Mode: C++;-*-
//
//  Tool-ribbonbar manager implementation
//
// $Id: tool-ribbon.js,v 1.18 2011/02/06 12:59:12 rishitani Exp $
//

if (!("ToolRibbon" in cuemolui)) {

cuemolui.ToolRibbon = ( function() {

// constructor
var ctor = function (aMolWndId, aTabsId)
{
  this.mMolWndId = aMolWndId;
  this.mTabsId = aTabsId;
  this.mTools = new Object();
  
  // attach to the load/unload event for the target document/window
  var that = this;
  window.addEventListener("load", function(){that.onLoad();}, false);
  window.addEventListener("unload", function() {that.onUnLoad();}, false);

  this.mClkCallbkID = -1;
  this.mDblClkCallbkID = -1;

  this.mTgtViewID = null;
  this.mTgtSceneID = null;
  this.mActiveTool = null;
}

var klass = ctor.prototype;

/////////////////////////////////////

// private initialization routine
klass.onLoad = function ()
{
  var that = this;

  this.mMainWnd = document.getElementById(this.mMolWndId);
  this.mMainWnd.mPanelContainer.addEventListener(
    "select",
    function(aEvent) { try { that.activeViewChanged(); } catch (e) {debug.exception(e);}},
    false);

  this.mTabContainer = document.getElementById(this.mTabsId);
  this.mTabContainer.addEventListener("select", function (aEvent) {
    that.onTabSelect();
    // show ribbon, if collapsed
    that.setCollapsed(false);
  }, false);

  if (this.mTabContainer.selectedItem) {
    that.onTabSelect();
  }

  this.activeViewChanged();
}

klass.onUnLoad = function ()
{
  this.detachFromCurrentView();
}

klass.getTgtView = function ()
{
  var vid = this.mTgtViewID;
  if (!vid)
    return null;

  return cuemol.getView(vid);
}

// Active tab of tabmolview is changed
klass.activeViewChanged = function ()
{
  this.detachFromCurrentView();
  
  var newview = this.mMainWnd.currentViewW;
  var newsce = newview.getScene();
  var that = this;

  if (!this.mTgtViewID ||
      newview.uid!=this.mTgtViewID) {

    this.mClkCallbkID = cuemol.evtMgr.addListener(
      "mouseClicked",
      cuemol.evtMgr.SEM_INDEV, // target type
      cuemol.evtMgr.SEM_ANY, // event type
      newview.uid, // source uid
      function (args) {
        that.mouseClicked(args.obj.x, args.obj.y, args.obj.mod);
      });

    this.mDblClkCallbkID = cuemol.evtMgr.addListener(
      "mouseDoubleClicked",
      cuemol.evtMgr.SEM_INDEV, // target type
      cuemol.evtMgr.SEM_ANY, // event type
      newview.uid, // source uid
      function (args) {
        that.mouseDoubleClicked(args.obj.x, args.obj.y, args.obj.mod);
      });

    this.mTgtViewID = newview.uid;
  }

  if (!this.mTgtScene ||
      newsce.uid!=this.mTgtScene.uid) {

    this.mTgtSceneID = newsce.uid;

  /*
    var handler_scene = function (args) {
      that.sceneChanged(args);
    }

    this.mSceneCallbkID = cuemol.evtMgr.addListener(
      "",
      cuemol.evtMgr.SEM_SCENE, // target type
      cuemol.evtMgr.SEM_ANY, // event type
      newsce.uid, // source uid
      handler_scene);
   */

    // this.setWindowTitle(this.mTgtScene.name);
  }

  this.onTabSelect();
}

klass.detachFromCurrentView = function()
{
  if (this.mClkCallbkID>=0)
    cuemol.evtMgr.removeListener(this.mClkCallbkID);
  if (this.mDblClkCallbkID>=0)
    cuemol.evtMgr.removeListener(this.mDblClkCallbkID);

  //if (this.mSceneCallbkID>=0)
  //cuemol.evtMgr.removeListener(this.mSceneCallbkID);
  
  var old_tool = this.mActiveTool;
  if (old_tool && 'onInactivated' in old_tool && typeof old_tool.onInactivated=='function')
    old_tool.onInactivated();
  this.mActiveTool = null;
}

klass.onTabSelect = function ()
{
  // Inactivate old tool obj
  var old_tool = this.mActiveTool;
  if (old_tool && 'onInactivated' in old_tool && typeof old_tool.onInactivated=='function')
    old_tool.onInactivated();

  // select new active tool
  var sel = this.mTabContainer.selectedItem;
  var tool_name = sel.id.substr(0, sel.id.length-11);
  var toolobj = this.mTools[tool_name];
  this.mActiveTool = toolobj;

  // activate the new selected tool
  if (toolobj && 'onActivated' in toolobj && typeof toolobj.onActivated=='function')
    toolobj.onActivated();

  dd("selected: "+tool_name);
  dd("selected: "+toolobj);
  dd("selected: "+this.mActiveTool);
}

klass.mouseClicked = function(x, y, mod)
{
  this.mCurHittestRes = null;
  var toolobj = this.mActiveTool;
  // dd("ToolRibbon mouse clicked: "+toolobj);
  if (toolobj && 'onMouseClicked' in toolobj && typeof toolobj.onMouseClicked=='function')
    toolobj.onMouseClicked(x, y, mod);

  // atompicker
  if (this.mCurHittestRes) {
    var ap = require("atom-picker");
    var fn = ap.getHandler();
    if (fn && typeof fn=='function')
      fn(this.mCurHittestRes.obj_id, this.mCurHittestRes.atom_id);
  }
};

klass.mouseDoubleClicked = function(x, y, mod)
{
  // dd("mouse double clicked: "+x+", "+y);

  this.mCurHittestRes = null;
  var toolobj = this.mActiveTool;

  if (toolobj && 'onMouseDoubleClicked' in toolobj && typeof toolobj.onMouseDoubleClicked=='function')
    toolobj.onMouseDoubleClicked(x, y, mod);
};

klass.registerTool = function (aObj)
{
  this.mTools[aObj.name] = aObj;
  aObj.mParent = this;
  // dd("************ Tool registered: "+aObj.name);
}

klass.getTool = function (aName)
{
  return this.mTools[aName];
}

klass.getHittestRes = function (x, y)
{
  if (this.mCurHittestRes)
    return this.mCurHittestRes;

  if (arguments.length==0)
    return null;

  var res=null;
  var view = cuemol.getView(this.mTgtViewID);
  try {
    var sres = view.hitTest(x, y);
    if (!sres) return null;
    dump("Hittest result: "+sres+"\n");
    res = JSON.parse(sres);
  }
  catch(e) {
    debug.exception(e);
    return null;
  }

  this.mCurHittestRes = res;
  return res;
}

klass.centerAtomAt = function()
{
  var res = this.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);
  var atom = obj.getAtomByID(res.atom_id);
  var pos = atom.pos;
  
  var view = this.mMainWnd.currentViewW;
  view.setViewCenter(pos);
  
  // cleanup the consumed hittest result
  this.mCurHittestRes = null;
}

klass.setCollapsed = function(aVal)
{
  var elem = document.getElementById("ribbon-tabpanels");
  var btn =  document.getElementById("ribbon-collapse-button");
  if (elem.hasAttribute("collapsed") &&
      elem.getAttribute("collapsed") && !aVal) {
    // not collapsed
    elem.removeAttribute("collapsed");
    btn.setAttribute("state", "off");
  }
  else if (aVal) {
    // collapsed
    elem.setAttribute("collapsed", true);
    btn.setAttribute("state", "on");
  }
}

klass.getCollapsed = function()
{
  var elem = document.getElementById("ribbon-tabpanels");
  if (elem.hasAttribute("collapsed") &&
      elem.getAttribute("collapsed")) {
    return true;
  }
  else {
    return false;
  }
}

klass.toggleCollapse = function()
{
  this.setCollapsed(!this.getCollapsed());
}

klass.onToggleCollapse = function(aEvent)
{
  var bcol = !this.getCollapsed();
  this.setCollapsed(bcol);
  if (bcol) {
    // collapsed
    aEvent.target.setAttribute("state", "on");
  }
  else {
    // not collapsed
    aEvent.target.setAttribute("state", "off");
  }
}

return ctor;

} )();

}


