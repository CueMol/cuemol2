//
//
// $Id: fakedial-panel.js,v 1.1 2011/02/19 14:44:13 rishitani Exp $

if (!("fakedial" in cuemolui.panels)) {

( function () {

var panel = cuemolui.panels.fakedial = new Object();

// panel's ID
panel.id = "fakedial-panel";

panel.collapsed = true;
panel.command_id = "menu-fakedial-panel-toggle";

panel.mTgtViewID = -1;
window.addEventListener("load", function(){panel.onLoad();}, false);

panel.onLoad = function ()
{
  var that = this;
  var mw = this._mainWnd = document.getElementById("main_view");

  this.targetViewChanged(mw.getCurrentViewID());
  mw.mPanelContainer.addEventListener("select", function(aEvent) {
    var vwid = mw.getCurrentViewID();
    if (vwid != that.mTgtViewID)
      that.targetViewChanged(vwid);
  }, false);

  this.mRotXWheel = document.getElementById("fdl-rotx-wheel");
  this.mRotXWheel.addEventListener("change", function (e) { panel.onWhChgR(e); }, false);
  this.mRotXVal = document.getElementById("fdl-rotx-val");
  this.mRotXVal.addEventListener("change", function (e) { panel.onValChgR(e); }, false);

  this.mRotYWheel = document.getElementById("fdl-roty-wheel");
  this.mRotYWheel.addEventListener("change", function (e) { panel.onWhChgR(e); }, false);
  this.mRotYVal = document.getElementById("fdl-roty-val");
  this.mRotYVal.addEventListener("change", function (e) { panel.onValChgR(e); }, false);

  this.mRotZWheel = document.getElementById("fdl-rotz-wheel");
  this.mRotZWheel.addEventListener("change", function (e) { panel.onWhChgR(e); }, false);
  this.mRotZVal = document.getElementById("fdl-rotz-val");
  this.mRotZVal.addEventListener("change", function (e) { panel.onValChgR(e); }, false);
  
  //////////
  
  this.mTraXWheel = document.getElementById("fdl-trax-wheel");
  this.mTraXWheel.addEventListener("change", function (e) { panel.onWhChgT(e); }, false);
  this.mTraXVal = document.getElementById("fdl-trax-val");
  this.mTraXVal.addEventListener("change", function (e) { panel.onValChgT(e); }, false);

  this.mTraYWheel = document.getElementById("fdl-tray-wheel");
  this.mTraYWheel.addEventListener("change", function (e) { panel.onWhChgT(e); }, false);
  this.mTraYVal = document.getElementById("fdl-tray-val");
  this.mTraYVal.addEventListener("change", function (e) { panel.onValChgT(e); }, false);

  this.mTraZWheel = document.getElementById("fdl-traz-wheel");
  this.mTraZWheel.addEventListener("change", function (e) { panel.onWhChgT(e); }, false);
  this.mTraZVal = document.getElementById("fdl-traz-val");
  this.mTraZVal.addEventListener("change", function (e) { panel.onValChgT(e); }, false);

  //////////

  this.mZoomWheel = document.getElementById("fdl-zoom-wheel");
  this.mZoomWheel.addEventListener("change", function (e) { panel.onWhChgZs(e); }, false);
  this.mSlabWheel = document.getElementById("fdl-slab-wheel");
  this.mSlabWheel.addEventListener("change", function (e) { panel.onWhChgZs(e); }, false);
  this.mDistWheel = document.getElementById("fdl-dist-wheel");
  this.mDistWheel.addEventListener("change", function (e) { panel.onWhChgZs(e); }, false);

  this.mZoomVal = document.getElementById("fdl-zoom-val");
  this.mZoomVal.addEventListener("change", function (e) { panel.onValChgZs(e); }, false);
  this.mSlabVal = document.getElementById("fdl-slab-val");
  this.mSlabVal.addEventListener("change", function (e) { panel.onValChgZs(e); }, false);
  this.mDistVal = document.getElementById("fdl-dist-val");
  this.mDistVal.addEventListener("change", function (e) { panel.onValChgZs(e); }, false);

  this.updateTransVal();
  this.updateZsVal();
}

panel.targetViewChanged = function (id)
{
  dd("ViewPanel> Target view changed: "+id);
  try {
    if (id==this.mTgtViewID)
      return;
    this._detachView(this.mTgtViewID);
    // attach to the new active scene
    this._attachView(id);
  }
  catch (e) {
    debug.exception(e);
  }
}

// detach from the previous active view
panel._detachView = function (oldid)
{
  if (oldid<0) return;

  var oldview = cuemol.getView(oldid);
  if (oldview && this._callbackID)
    cuemol.evtMgr.removeListener(this._callbackID);
  this._callbackID = null;
}

panel._attachView = function (id)
{
  var view = cuemol.getView(id);
  if (!view)
    return;

  this.mTgtViewID = id;

  var that = this;
  var handler = function (args) {
    // dd("%%% VIEW event handler: "+debug.dumpObjectTree(args));
    if (args.obj.dragging) return;
    switch (args.obj.propname) {
    case "setCamera":
      that.updateTransVal();
      that.updateZsVal();
      break;
    case "center":
      that.updateTransVal();
      break;
    case "zoom":
    case "slab":
    case "distance":
      that.updateZsVal();
      break;
    }
  };
  
  this._callbackID = cuemol.evtMgr.addListener("",
					       cuemol.evtMgr.SEM_VIEW, // target type
					       cuemol.evtMgr.SEM_PROPCHG, // event type
					       view.getScene().uid, // source scene UID
                                               handler);
}

//////////

panel.onWhChgR = function (aEvent)
{
  var id = aEvent.target.id;
  var val = aEvent.value;
  var state = aEvent.state;

  if (state=="start") {
    dd("RotBtnCmd: start "+id);
    //this.mOrigQuat = this._mainWnd.rotQuat;
    this.mRotXVal.value = 0;
    this.mRotYVal.value = 0;
    this.mRotZVal.value = 0;
    return;
  }
  else if (state=="end") {
    return;
  }
  
  switch (id) {
  case "fdl-rotx-wheel":
    //this._mainWnd.rotQuat = this.mOrigQuat.rotateX(val);
    this._mainWnd.rotateView(aEvent.delta, 0, 0);
    this.mRotXVal.value = val;
    break;
  case "fdl-roty-wheel":
    //this._mainWnd.rotQuat = this.mOrigQuat.rotateY(val);
    this._mainWnd.rotateView(0, aEvent.delta, 0);
    this.mRotYVal.value = val;
    break;
  case "fdl-rotz-wheel":
    dd("RotBtnCmd: Drag RotZ "+val+", origQ="+this.mOrigQuat);
    //this._mainWnd.rotQuat = this.mOrigQuat.rotateZ(val);
    this._mainWnd.rotateView(0, 0, aEvent.delta);
    this.mRotZVal.value = val;
    break;
  }
}

panel.onWhChgT = function (aEvent)
{
  try {

  var id = aEvent.target.id;
  dd("TraBtnCmd: "+id);
  //var val = aEvent.value;
  var del = aEvent.delta;
  var state = aEvent.state;

  if (state=="start")
    return;
  let bDrag = true;
  if (state=="end")
    bDrag = false;
  
  switch (id) {
  case "fdl-trax-wheel":
    this._mainWnd.translateView(del, 0, 0, bDrag);
    break;
  case "fdl-tray-wheel":
    this._mainWnd.translateView(0, del, 0, bDrag);
    break;
  case "fdl-traz-wheel":
    this._mainWnd.translateView(0, 0, del, bDrag);
    break;
  }

  this.updateTransVal();

  } catch (e) { debug.exception(e); }
}

panel.onValChgR = function (aEvent)
{

  var id = aEvent.target.id;
  var quat = this._mainWnd.rotQuat;
  var val;
  
  dd("RotVal Change: "+id);
  dd("PrevQ: "+quat);

  switch (id) {
  case "fdl-rotx-val":
    val = parseFloat(this.mRotXVal.value);
    if (!isNaN(val)) {
      quat = quat.rotateX(val);
      this._mainWnd.rotQuat = quat;
      dd("AfterQ: "+quat);
      this.mRotXVal.value = 0;
    }
    break;

  case "fdl-roty-val":
    val = parseFloat(this.mRotYVal.value);
    if (!isNaN(val)) {
      quat = quat.rotateY(val);
      this._mainWnd.rotQuat = quat;
      dd("AfterQ: "+quat);
      this.mRotYVal.value = 0;
    }
    break;

  case "fdl-rotz-val":
    val = parseFloat(this.mRotZVal.value);
    if (!isNaN(val)) {
      quat = quat.rotateZ(val);
      this._mainWnd.rotQuat = quat;
      dd("AfterQ: "+quat);
      this.mRotZVal.value = 0;
    }
    break;
  }

}

panel.onValChgT = function (aEvent)
{

  var id = aEvent.target.id;
  var vec = this._mainWnd.viewCenter;
  var val;
  
  dd("TraVal Change: "+id);

  switch (id) {
  case "fdl-trax-val":
    val = parseFloat(this.mTraXVal.value);
    if (!isNaN(val)) {
      vec.x = val;
      this._mainWnd.viewCenter = vec;
    }
    break;
  case "fdl-tray-val":
    val = parseFloat(this.mTraYVal.value);
    if (!isNaN(val)) {
      vec.y = val;
      this._mainWnd.viewCenter = vec;
    }
    break;
  case "fdl-traz-val":
    val = parseFloat(this.mTraZVal.value);
    if (!isNaN(val)) {
      vec.z = val;
      this._mainWnd.viewCenter = vec;
    }
    break;
  }

}

panel.updateTransVal = function ()
{
  var vec = this._mainWnd.viewCenter;
  var val = vec.x;
  this.mTraXVal.value = val.toFixed(2);
  var val = vec.y;
  this.mTraYVal.value = val.toFixed(2);
  var val = vec.z;
  this.mTraZVal.value = val.toFixed(2);
}

//////////

panel.onWhChgZs = function (aEvent)
{
  var id = aEvent.target.id;
  dd("TraBtnCmd: "+id);
  var val;
  var del = aEvent.delta;
  var state = aEvent.state;

  if (state=="start") {
    return;
  }
  else if (state=="end") {
    return;
  }
  
  switch (id) {
  case "fdl-zoom-wheel":
    val = this._mainWnd.zoomView(-del);
    this.mZoomVal.value = val.toFixed(0);
    break;
  case "fdl-slab-wheel":
    val = this._mainWnd.slabView(-del);
    this.mSlabVal.value = val.toFixed(0);
    break;
  case "fdl-dist-wheel":
    val = this._mainWnd.distance + del;
    if (val<0.0) val = 0.0;
    this._mainWnd.distance = val;
    this.mDistVal.value = val.toFixed(0);
    break;
  }
}

panel.onValChgZs = function (aEvent)
{
  var id = aEvent.target.id;
  var val;
  
  dd("Z/SVal Change: "+id);

  switch (id) {
  case "fdl-zoom-val":
    val = parseFloat(this.mZoomVal.value);
    if (!isNaN(val) && val>0.0)
      this._mainWnd.zoom = val;
    break;
  case "fdl-slab-val":
    val = parseFloat(this.mSlabVal.value);
    if (!isNaN(val) && val>0.0)
      this._mainWnd.slab = val;
    break;
  case "fdl-dist-val":
    val = parseFloat(this.mDistVal.value);
    if (!isNaN(val) && val>0.0)
      this._mainWnd.distance = val;
    break;
  }
}

panel.updateZsVal = function ()
{
  var val = this._mainWnd.zoom;
  this.mZoomVal.value = val.toFixed(0);

  var val = this._mainWnd.slab;
  this.mSlabVal.value = val.toFixed(0);

  var val = this._mainWnd.distance;
  this.mDistVal.value = val.toFixed(0);
}

} )();

}

