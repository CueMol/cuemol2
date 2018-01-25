//
// densitymap-panel.js
//
// $Id: densitymap-panel.js,v 1.8 2011/02/06 12:59:12 rishitani Exp $
//


if (!("denmap" in cuemolui.panels)) {

( function () {

var denmap = cuemolui.panels.denmap = new Object();

// panel's ID
denmap.id = "denmap-panel";
// Menu checkbox's ID
denmap.command_id = "menu-denmap-panel-toggle";
  
denmap.collapsed = false;
  
denmap.mMapList = new cuemolui.ObjMenuList(
  "denmap-rend-list", window,
  function (elem) {
    if (elem.type=="contour"||
	elem.type=="isosurf"||
	elem.type=="gpu_mapmesh"||
	elem.type=="gpu_mapvol") return true;
    return false; },
  cuemol.evtMgr.SEM_RENDERER);
  
// Observe properties of the selected map
// to update the panel widgets
denmap.mMapList.addPropChgListener("*", function(args){denmap.propChange(args);});

window.addEventListener("load", function(){denmap.onLoad();}, false);
//window.addEventListener("unload", function() {denmap.onUnLoad();}, false);
denmap.mTgtRend = null;

denmap.onLoad = function ()
{
  var that = this;
  if (!('mRedraw' in this))
    this.setupWidget();
}

//denmap.onUnLoad = function ()
//{
//}

denmap.setupWidget = function ()
{
  this.mRedraw = document.getElementById("denmap-panel-redraw");
  this.mShowCell = document.getElementById("denmap-panel-showcell");
  this.mColor = document.getElementById("denmap-panel-color");
  this.mTransp = document.getElementById("denmap-panel-transp");
  this.mLevel = document.getElementById("denmap-panel-level");
  this.mExtent = document.getElementById("denmap-panel-extent");
}

// (any) prop of (any) renderer changed
denmap.propChange = function (args)
{
  if (this.mTgtRend===null)
    return;
  // filter out unrelated events
  if (this.mTgtRend.uid!=args.obj.target_uid)
    return;

  var propname = args.obj.propname;
  // var parentname = args.obj.parentname;
  dd("DenmapPanel> TargetPropChanged prop: "+propname);

  this.updateWidget(this.mTgtRend, propname);
}

// MapList change event
denmap.listChg = function (aEvent)
{
  if (aEvent.itemCount==0)
    this.setDisabled(true);
  else
    this.setDisabled(false);
}

denmap.selChg = function (aEvent)
{
  var seli = this.mMapList._widget.selectedIndex;
  dd("denmapPanel targetChanged() "+seli);
  if (seli<0) {
    // this.setDisabled(true);
    this.mTgtRend = null;
    return;
  }
  var id = this.mMapList._data[seli].uid;
  var rend = cuemol.getRenderer(id);
  if (!rend) {
    this.setDisabled(true);
    this.mTgtRend = null;
    return;
  }

  this.mTgtRend = rend;
  this.updateWidget(rend);
}

denmap.setDisabled = function (aValue)
{
  if (!('mRedraw' in this))
    this.setupWidget();

  this.mRedraw.disabled = 
    this.mShowCell.disabled = 
      this.mColor.disabled = 
	this.mTransp.disabled = 
	  this.mLevel.disabled = 
	    this.mExtent.disabled = aValue;
}
  
// data (renderer) --> widget
denmap.updateWidget = function (aRend, aPropName)
{
  var value;

  if (aPropName==undefined ||
      aPropName=="alpha") {
    this.mTransp.value = aRend.alpha;
  }

  if (aPropName==undefined ||
      aPropName=="color") {
    this.mColor.setTargetSceneID(aRend.getScene().uid);
    this.mColor.setColorObj(aRend.color);
  }

  if (aPropName==undefined ||
      aPropName=="extent") {
    this.mExtent.value = aRend.extent;
  }

  if (aPropName==undefined ||
      aPropName=="bufsize" ||
      aPropName=="max_grids") {
    if (this.mExtent.value>aRend.maxExtent)
      this.mExtent.value = aRend.maxExtent;
    this.mExtent.max = aRend.maxExtent;
  }

  if (aPropName==undefined ||
      aPropName=="siglevel") {
    this.mLevel.value = aRend.siglevel;
    this.mLevel.max = aRend.maxLevel;
    this.mLevel.min = aRend.minLevel;
    dd("map level min="+aRend.minLevel+" max="+aRend.maxLevel);
  }
}

// widget --> data (renderer)
denmap.validateWidget = function (aEvent)
{
  try {

    if (this.mTgtRend===null) return;

    // dd("*** isDragging="+aEvent.isDragging);
    //dd("*** isMouse="+aEvent.isMouse);
    //dd("*** isKey="+aEvent.isKey);

    // Ignore the event for starting of slider thumb drag
    if ('isDragging' in aEvent && aEvent.isDragging)
      return;

    var id = aEvent.currentTarget.id;
    var value=null, propname=null;

    switch (id) {
    case "denmap-panel-transp":
      value = this.mTransp.value;
      propname = "alpha";
      break;
    case "denmap-panel-extent":
      value = this.mExtent.value;
      propname = "extent";
      break;
    case "denmap-panel-level":
      value = this.mLevel.value;
      propname = "siglevel";
      break;
    case "denmap-panel-color":
      value = this.mColor.getColorObj()._wrapped;
      propname = "color";
      break;
    default:
      dd("DenMap.validate> unknown ID="+id);
      return;
    }

    dd("DenMap.validate> propname="+propname);
    dd("DenMap.validate> value="+value);

    if (value===null||propname===null)
      return;

    var scene = this.mTgtRend.getScene();

    // EDIT TXN START //
    scene.startUndoTxn("Change map renderer prop");
    try {
      this.mTgtRend._wrapped.setProp(propname, value);
    }
    catch (e) {
      dd("PaintPanel.commitPropChg> FATAL ERROR: "+e);
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //

  } catch (e) { debug.exception(e); }

};

// redraw map (setcenter)
denmap.onRedraw = function (aEvent)
{
  //var view = document.getElementById("main_view").currentViewW;
  //vcenter = view.getViewCenter();
  var vcenter = document.getElementById("main_view").viewCenter;
  var scene = this.mTgtRend.getScene();
  
  // EDIT TXN START //
  scene.startUndoTxn("Change map renderer center");
  try {
    this.mTgtRend.center = vcenter;
  }
  catch (e) {
    dd("DenmapPanel.onRedraw> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
};

// Show unit-cell renderer
denmap.onShowCell = function (aEvent)
{
  var vcenter = document.getElementById("main_view").viewCenter;
  var scene = this.mTgtRend.getScene();
  
  let obj = this.mTgtRend.getClientObj();
  if (!obj) return;

  let rend = obj.getRendererByType("*unitcell");
  if (rend) return; // unitcell renderer already exists

  // EDIT TXN START //
  scene.startUndoTxn("Show unitcell");

  try {
    // create new renderer
    rend = obj.createRenderer("*unitcell");
    rend.name = "unitcell";
  }
  catch (e) {
    dd("*** Cannot create unitcell renderer Reason : "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
};

} )();

}

