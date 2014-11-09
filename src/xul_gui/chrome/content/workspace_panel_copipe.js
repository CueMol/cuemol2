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
      // TO DO: impl
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
  
  var type = this.checkSelTypes(elemList);
  if (type=="mixed") {
    util.alert(window, "Multiple items with differnt types selected.");
    return;
  }

  let clipboard = require("qsc-copipe");

  if (type=="renderer") {
    let args = new Array();
    for (var i=0; i<nsel; ++i) {
      let rend = cuemol.getRenderer(elemList[i].obj_id);
      args.push(rend._wrapped);
    }
    
    let xmldat = gQm2Main.mStrMgr.arrayToXML(args);

    clipboard.set(xmldat, "qscrendary");
  }
};

function convElemNodeTypes(type)
{
  if (type=="rendGroup")
    return "renderer";
  return type;
};

ws.checkSelTypes = function (elemList)
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
      let rends = gQm2Main.mStrMgr.arrayFromXML(xmldat, scene.uid);
      let nrends = rends.length;

      // EDIT TXN START //
      scene.startUndoTxn("Paste renderers");
      try {
	for (let i=0; i<nrends; ++i) {
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
    var target = scene.getCamera(elem.obj_id);
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


