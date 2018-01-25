//
// Copy & Paste
//

///
/// Top-level copy command handler
///
ws.onCopyCmd = function (aEvent)
{
  if (this.mViewObj.isMultiSelected()) {
    this.onMultiCopy(aEvent);
    return;
  }
  
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;


  try {
    let clipboard = require("qsc-copipe");

    if (elem.type=="renderer") {
      let rend = cuemol.getRenderer(id);
      let xmldat = gQm2Main.mStrMgr.toXML(rend);
      clipboard.set(xmldat, "qscrend");
    }
    else if (elem.type=="rendGroup") {
      let elemList = elem.childNodes;
      let grpName = elem.orig_name;
      dd("onCopy rendGroup name="+grpName);
      this.multiRendCopyImpl(elemList, grpName);
    }
    else if (elem.type=="object") {
      let obj = cuemol.getObject(id);
      let xmldat = gQm2Main.mStrMgr.toXML(obj);
      clipboard.set(xmldat, "qscobj");
    }
    
  } catch (e) { debug.exception(e); }
};

///
/// Multiple-copy handler
///
ws.onMultiCopy = function (aEvent)
{
  var elemList = this.mViewObj.getSelectedNodeList();
  var nsel = elemList.length;
  if (nsel<=0)
    return;
  
  var type = this.checkElemTypes(elemList);
  if (type=="mixed") {
    util.alert(window, "Multiple items with differnt types selected.");
    return;
  }

  if (type=="renderer") {
    this.multiRendCopyImpl(elemList);
  }

  if (type=="object") {
    util.alert(window, "Multiple copy of object: not supported.");
    return;
  }
};

ws.multiRendCopyImpl = function (aElemList, aGrpName)
{
  var nsel = aElemList.length;
  var clipboard = require("qsc-copipe");

  var args = new Array();
  for (var i=0; i<nsel; ++i) {
    let rend = cuemol.getRenderer(aElemList[i].obj_id);
    args.push(rend._wrapped);
  }
    
  if (aGrpName)
    xmldat = gQm2Main.mStrMgr.rendGrpToXML(args, aGrpName);
  else
    xmldat = gQm2Main.mStrMgr.arrayToXML(args);

  clipboard.set(xmldat, "qscrendary");
};

function convElemNodeTypes(type)
{
  if (type=="rendGroup")
    return "renderer";
  return type;
};

ws.checkElemTypes = function (elemList)
{
  var nsel = elemList.length;
  var rval = "";
  for (var i=0; i<nsel; ++i) {
    let elem = elemList[i];
    if (rval) {
      let nv = convElemNodeTypes(elem.type);
      if (rval!=nv)
	return "mixed";
    }
    else {
      rval = convElemNodeTypes(elem.type);
    }
  }

  return rval;
};

///
/// Paste renderer
///
ws.onPasteRend = function (aEvent)
{
  try {
    let elem = this.mViewObj.getSelectedNode();
    if (!elem) return;
    let id = elem.obj_id;

    let clipboard = require("qsc-copipe");

    let destgrp = "";
    var obj;
    if (elem.type=="rendGroup") {
      let rendgrp = cuemol.getRenderer(id);
      destgrp = rendgrp.name;
      obj = rendgrp.getClientObj();
    }
    else if (elem.type=="object") {
      obj = cuemol.getObject(id);
    }
    else
      return;

    let bary = false;
    let xmldat = clipboard.get("qscrend");
    if (!xmldat) {
      xmldat = clipboard.get("qscrendary");
      if (!xmldat) {
	dd("PasteRend, ERROR: "+xmldat);
	return;
      }
      bary = true;
    }

    let scene = obj.getScene();
    if (bary) {
      // let rends = gQm2Main.mStrMgr.arrayFromXML(xmldat, scene.uid);
      let rends = gQm2Main.mStrMgr.rendArrayFromXML(xmldat, scene.uid);
      let nrends = rends.length -1;

      // alert("group="+rends[0]);

      // EDIT TXN START //
      scene.startUndoTxn("Paste renderers");
      try {
	if (destgrp=="" && rends[0]!="") {
	  // create new group & paste rend
	  dd("Paste new group="+rends[0]);
	  destgrp=rends[0];
	  let rend = obj.createRenderer("*group");
	  rend.name = destgrp;
	}

	for (let i=1; i<=nrends; ++i) {
	  let rend = cuemol.convPolymObj( rends[i] );
	  this.pasteRendImpl(obj, rend, destgrp);
	}
      }
      catch (e) {
	dd("Paste renderer error: "+e);
	debug.exception(e);
	scene.rollBackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //
      return;
    }
    else {
      let rend = gQm2Main.mStrMgr.fromXML(xmldat, scene.uid);
      // EDIT TXN START //
      scene.startUndoTxn("Paste renderer");
      try {
	this.pasteRendImpl(obj, rend, destgrp);
      }
      catch (e) {
	dd("Paste renderer error: "+e);
	debug.exception(e);
	scene.rollBackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //
    }

  }
  catch (e) {
    debug.exception(e);
  }
};

ws.pasteRendImpl = function (aObj, aRend, aDestGrp)
{
  if (!aRend.isCompatibleObj(aObj)) {
    let msg =
      "Cannot paste renderer ("+aRend.name+") to incompatible object ("+aObj.name+").";
    util.alert(window, msg);
    return;
  }
  
  // check the uniqueness of renderer's name
  let name = aRend.name;
  if (aObj.getRendererByName(name)) {
    // duplicated --> set differernt name
    name = util.makeUniqName2(
      // function (a) {return "copy"+a+"_"+name; },
      function (a) {return name+"("+a+")"; },
      function (a) {return aObj.getRendererByName(a);} );
  }
  aRend.name = name;
  
  // check & change the group
  aRend.group = aDestGrp;

  aObj.attachRenderer(aRend);
  
};

///////////////////////////////////

ws.onPasteObj = function (aEvent)
{
  var elem, id, name;
  var scene, obj, xmldat;

  try {
    elem = this.mViewObj.getSelectedNode();
    if (!elem) return;
    id = elem.obj_id;
    scene = cuemol.getScene(id);

    let clipboard = require("qsc-copipe");

    if (elem.type!="scene")
      return;

    xmldat = clipboard.get("qscobj");
    if (!xmldat) {
      dd("PasteObj, ERROR: "+xmldat);
      return;
    }
  } catch (e) { debug.exception(e); }

  try {
    // dd("XML: length="+xmldat.length);
    obj = gQm2Main.mStrMgr.fromXML(xmldat, scene.uid);
  }
  catch (e) {
    dd("ERROR XML ="+xmldat);
    debug.exception(e);
  }

  try {
    name = obj.name;
    if (scene.getObjectByName(name)) {
      name = util.makeUniqName2(
	function (a) {return "copy"+a+"_"+name; },
	function (a) {return scene.getObjectByName(a);} );
    }

    obj.name = name;

    // EDIT TXN START //
    scene.startUndoTxn("Paste object");
    try {
      scene.addObject(obj);
    }
    catch (e) {
      dd("***** ERROR: Paste object "+e);
      debug.exception(e);
      scene.rollBackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //


  } catch (e) { debug.exception(e); }
};

/////////////////////
// camera copy&paste

ws.onCameraCopy = function (aEvent)
{
  try {
    var elem = this.mViewObj.getSelectedNode();
    if (!elem || elem.type!="camera")
      return;

    var scene = cuemol.getScene(this.mTgtSceneID);
    var target = scene.getCameraRef(elem.obj_id);
    if (target==null)
      return;

    let clipboard = require("qsc-copipe");

    // alert("copy camera: "+target.name);

    let xmldat = gQm2Main.mStrMgr.toXML(target);
    clipboard.set(xmldat, "qsccam");

  } catch (e) { debug.exception(e); }
};

ws.onCameraPaste = function (aEvent)
{
  try {
    let elem = this.mViewObj.getSelectedNode();
    if (!elem) return;
    if (elem.type!="cameraRoot" && elem.type!="camera") return;
    
    let clipboard = require("qsc-copipe");

    let xmldat = clipboard.get("qsccam");
    if (!xmldat) {
      dd("PasteCamera, ERROR: "+xmldat);
      return;
    }

    dd("XML: "+xmldat);
    let scene = cuemol.getScene(this.mTgtSceneID);
    let cam = gQm2Main.mStrMgr.fromXML(xmldat, scene.uid);

    let name = cam.name;
    if (scene.hasCamera(name)) {
      // make a unique name, if the same name exists
      name = util.makeUniqName2(
	function (a) {return "copy"+a+"_"+name; },
        function (a) {return (scene.hasCamera(a)?1:null);} );
    }
    
    // cam.name = name;
    // alert("paste camera: "+name);
    
    // EDIT TXN START //
    scene.startUndoTxn("Paste camera");
    try {
      scene.setCamera(name, cam);
      cam.notifyLoaded(scene);
    }
    catch (e) {
      dd("***** ERROR: Paste camera "+e);
      debug.exception(e);
      scene.rollBackUndoTxn();
      cam = null;
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
    
    cam = null;
  }
  catch (e) {
    debug.exception(e);
  }
};

/////////////////////
// style copy&paste


ws.onCopyStyle = function (aEvent)
{
  if (this.mViewObj.isMultiSelected()) {
    // TO DO: show error msg
    util.alert(window, "Multiple items are selected.");
    return;
  }

  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  if (elem.type!="style") {
    throw "onCopyStyle called for a non-style node";
  }

  let stylem = cuemol.getService("StyleManager");
  let styleset = stylem.getStyleSet(elem.obj_id);
  if (styleset==null) {
    throw "onCopyStyle called for a non-existing style: "+elem.obj_id;
  }

  try {
    let clipboard = require("qsc-copipe");
    
    let xmldat = gQm2Main.mStrMgr.toXML(styleset);
    clipboard.set(xmldat, "qscsty");
  }
  catch (e) { debug.exception(e); }

};

ws.onPasteStyle = function (aEvent)
{
  var new_name = "";
  var styleset;
  var sceneid = this.mTgtSceneID;
  var scene = cuemol.getScene(sceneid);
  var clipboard = require("qsc-copipe");
  var stylem = cuemol.getService("StyleManager");
  var bDestroy = false;

  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  if (elem.type!="styleRoot" && elem.type!="style") return;

  try {
    let xmldat = clipboard.get("qscsty");
    if (!xmldat) {
      dd("PasteStyle, ERROR: "+xmldat);
      return;
    }

    dd("XML: "+xmldat);
    styleset = gQm2Main.mStrMgr.fromXML(xmldat, sceneid);

    if (styleset==null) {
      dd("PasteStyle, fromXML ERROR: "+xmldat);
      return;
    }

    new_name = styleset.name;
    let oldsetid = stylem.hasStyleSet(new_name, sceneid);
    if (oldsetid!=0) {
      let res = util.confirm(window, "Style \""+new_name+"\" already exists. Replace?");
      if (!res)
	return;
      bDestroy = true;
    }

  }
  catch (e) {
    debug.exception(e);
    return;
  }
  

  // EDIT TXN START //
  scene.startUndoTxn("Paste style");
  try {
    if (bDestroy)
      stylem.destroyStyleSet(sceneid, new_name);
    stylem.registerStyleSet(styleset, 0, sceneid);
  }
  catch (e) {
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //


};


