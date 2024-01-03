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
denmap.mMapList.addPropChgListener("*", function(args){denmap.onPropChanged(args);});

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
denmap.onPropChanged = function (args)
{
  if (this.mTgtRend===null)
    return;
  // filter out unrelated events
  if (this.mTgtRend.uid!=args.obj.target_uid)
    return;

  var propname = args.obj.propname;
  // var parentname = args.obj.parentname;
  dd("DenmapPanel> TargetPropChanged prop: "+propname);

  if (propname=="styles") {
    this.updateWidget(this.mTgtRend);
  }
  else
    this.updateWidget(this.mTgtRend, propname);
}

// MapList change event
denmap.onListChanged = function (aEvent)
{
  if (aEvent.itemCount==0)
    this.setDisabled(true);
  else
    this.setDisabled(false);
}

denmap.onSelChanged = function (aEvent)
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

denmap.onMenuChanged = function (aEvent)
{
  let val = aEvent.originalTarget.value;
  dd("onMenuChanged selected="+val);
  
  if (val=="level-sigma") {
    this.changeProp("use_abslevel", false);
    return;
  }
  else if (val=="level-abs") {
    this.changeProp("use_abslevel", true);
    return;
  }
  else if (val=="color-solid") {
    this.changeProp("colormode", "solid");
    return;
  }
  else if (val=="color-multigrad") {
    this.changeProp("colormode", "multigrad");
    return;
  }
};

denmap.onMenuShowing = function (aEvent)
{
  let rend = this.mTgtRend;

  let sigma = document.getElementById("denmap-panel-levelopt-sigma");
  let abs = document.getElementById("denmap-panel-levelopt-abs");
  let solid = document.getElementById("denmap-panel-coloropt-solid");
  let multig = document.getElementById("denmap-panel-coloropt-multig");

  if (rend==null) {
    sigma.disabled = true;
    abs.disabled = true;
    solid.disabled = true;
    multig.disabled = true;
  }
  else {
    sigma.disabled = false;
    abs.disabled = false;
    solid.disabled = false;
    multig.disabled = false;

    dd("denmap.onMenuShowing> rend.use_abslevel = "+rend.use_abslevel);
    if (rend.use_abslevel) {
      sigma.removeAttribute("checked");
      abs.setAttribute("checked", true);
    }
    else {
      sigma.setAttribute("checked", true);
      abs.removeAttribute("checked");
    }

    dd("denmap.onMenuShowing> rend.colormode = "+rend.colormode);
    if (rend.colormode=="multigrad") {
      solid.removeAttribute("checked");
      multig.setAttribute("checked", true);
    }
    else {
      solid.setAttribute("checked", true);
      multig.removeAttribute("checked");
    }

  }
};

denmap.setDisabled = function (aValue)
{
  if (!('mRedraw' in this))
    this.setupWidget();

  this.mRedraw.disabled =  aValue;
  this.mShowCell.disabled =  aValue;
  this.mColor.disabled =  aValue;
  this.mTransp.disabled =  aValue;
  this.mLevel.disabled =  aValue;
  this.mExtent.disabled = aValue;

  document.getElementById("denmap-panel-menubtn").disabled = aValue;
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
      aPropName=="bufsize" ||
      aPropName=="max_grids") {
    dd(">>>>> Max extent="+aRend.maxExtent);
    if (this.mExtent.value>aRend.maxExtent)
      this.mExtent.value = aRend.maxExtent;
    this.mExtent.max = aRend.maxExtent;
  }

  if (aPropName==undefined ||
      aPropName=="extent") {
    dd(">>>>> Extent="+aRend.extent);
    if (aRend.extent>this.mExtent.max)
      this.mExtent.value = this.mExtent.max;
    else
      this.mExtent.value = aRend.extent;
  }

  if (aPropName==undefined ||
      aPropName=="use_abslevel" ||
      aPropName=="siglevel") {

    dd(">>>>> map level min="+aRend.minLevel+" max="+aRend.maxLevel);

    if (aRend.use_abslevel) {
      let obj = aRend.getClientObj();
      let sig = obj.den_sigma;
      let rng = (aRend.maxLevel - aRend.minLevel)*sig
      this.mLevel.value = aRend.siglevel*sig;
      this.mLevel.max = aRend.maxLevel*sig;
      this.mLevel.min = aRend.minLevel*sig;
      this.mLevel.setAttribute("unit", "");
      //dd(">>>>> slider rng="+rng);
      let x = Math.log10(rng/100.0);
      //dd(">>>>> slider log(rng/100)="+x);
      x = Math.floor(x);
      //dd(">>>>> slider floor(log(rng/100))="+x);
      let delta = Math.pow(10, x );
      dd(">>>>> slider delta="+delta);
      this.mLevel.setAttribute("increment", delta);
      this.mLevel.setAttribute("decimalplaces", -x);
    }
    else {
      this.mLevel.value = aRend.siglevel;
      this.mLevel.max = aRend.maxLevel;
      this.mLevel.min = aRend.minLevel;
      this.mLevel.setAttribute("unit", String.fromCharCode(963)); // sigma
      this.mLevel.setAttribute("increment", 0.1);
      this.mLevel.setAttribute("decimalplaces", 1);
    }
  }

  if (aPropName==undefined ||
      aPropName=="colormode") {
    if (aRend.colormode=="multigrad") {
      document.getElementById("denmap-panel-color-deck").selectedIndex = 1;
    }
    else {
      document.getElementById("denmap-panel-color-deck").selectedIndex = 0;
    }
      
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
      dd(">>>>>>>> this.mTgtRend.use_abslevel="+this.mTgtRend.use_abslevel);
      if (this.mTgtRend.use_abslevel) {
	let obj = this.mTgtRend.getClientObj();
	let sig = obj.den_sigma;
	value /= sig;
      }
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

    this.changeProp(propname, value);

  } catch (e) { debug.exception(e); }

};

denmap.changeProp = function (aPropName, aPropVal)
{
  var scene = this.mTgtRend.getScene();

  // EDIT TXN START //
  scene.startUndoTxn("Change map renderer prop");
  try {
    this.mTgtRend._wrapped.setProp(aPropName, aPropVal);
  }
  catch (e) {
    dd("PaintPanel.commitPropChg> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

// redraw map (setcenter)
denmap.onRedraw = function (aEvent)
{
  //var view = document.getElementById("main_view").currentViewW;
  //vcenter = view.getViewCenter();
  let vcenter = document.getElementById("main_view").viewCenter;
  let scene = this.mTgtRend.getScene();

  
  let diff = this.mTgtRend.center.sub(vcenter).length();
  if (diff<0.1) {
    dd("denmap-panel> ignore small movement: "+diff);
    return;
  }
  
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

denmap.onEditColor = function (aEvent)
{
  let rend = this.mTgtRend;
  let scene = rend.getScene();

  var argobj = {
  scene_id: scene.uid,
  rend_id: rend.uid
  };

  var stylestr = "chrome,modal,resizable=yes,dependent,centerscreen";
  window.openDialog("chrome://cuemol2/content/tools/multigrad_editor.xul",
		    "", stylestr, argobj);

};

} )();

}

