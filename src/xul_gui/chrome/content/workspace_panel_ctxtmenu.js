//
//
//

ws.mSceneCtxtMenuID = "wspcPanelSceneCtxtMenu";
ws.mObjCtxtMenuID = "wspcPanelObjCtxtMenu";
ws.mRendCtxtMenuID = "wspcPanelRendCtxtMenu";

/// Context menu setup for Scene, Object, and RendGrp items
ws.onCtxtMenuShowing = function (aEvent)
{
  var clipboard = require("qsc-copipe");
  var item, xmlstr;
  try {
    if (aEvent.target.id=="wspcPanelObjCtxtMenu") {
      // Update the renderer-paste menu
      item = document.getElementById("wspcPanelObjCtxtMenu-Paste");
      if (clipboard.check("qscrend") || clipboard.check("qscrendary"))
        item.disabled = false;
      else
        item.disabled = true;

      // Update molsurf regenerate menu
      this.setupMolSurfCtxtMenu();
      
    }
    else if (aEvent.target.id=="wspcPanelRendGrpCtxtMenu") {
      // Update the renderer-paste in rendgrp menu 
      item = document.getElementById("wspcPanelRendGrpCtxtMenu-Paste");
      if (clipboard.check("qscrend") || clipboard.check("qscrendary"))
	item.disabled = false;
      else
        item.disabled = true;
    }
    else if (aEvent.target.id=="wspcPanelSceneCtxtMenu") {
      // Update the object-paste menu
      item = document.getElementById("wspcPanelSceneCtxtMenu-Paste");
      if (clipboard.check("qscobj"))
        item.disabled = false;
      else
        item.disabled = true;

      // Update color proofing mode
      item = document.getElementById("wspcUseColProof");
      var scene = cuemol.getScene(this.mTgtSceneID);
      if (scene.use_colproof &&
	  scene.icc_filename!="") {
	item.setAttribute("checked", "true");
      }
      else {
	item.removeAttribute("checked");
      }
    }

  } catch (e) { debug.exception(e); }
}

/////////////////
// scene menus


/////////////////
// molsurf menus

// Update molsurf regenerate menu
ws.setupMolSurfCtxtMenu = function ()
{
  item = document.getElementById("wspcPanelMolSurfRegen");
      
  let elem = this.mViewObj.getSelectedNode();
  item.hidden = true;
  if (elem.type!="object")
    return;

  let obj = cuemol.getObject(elem.obj_id);
  if (!obj || cuemol.getClassName(obj)!="MolSurfObj")
    return;

  item.hidden = false;
  item.disabled = true;
  
  dd("obj.orig_mol: "+obj.orig_mol);
  if (!obj.orig_mol)
    return;

  let scene = obj.getScene();
  let origobj = scene.getObjectByName(obj.orig_mol);
  if (origobj)
    item.disabled = false;
};

ws.onMolSurfRegen = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  if (elem.type!="object")
    return;

  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = this._mainWnd.getCurrentSceneID();

  var winMed = Cc["@mozilla.org/appshell/window-mediator;1"]
  .getService(Ci.nsIWindowMediator);

  var win = winMed.getMostRecentWindow("CueMol2:MsmsMakeSurfDlg");
  if (win) {
    dd("ERROR!!");
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/makesurf.xul",
		      "", stylestr, scene_id, elem.obj_id);
};

/////////////////////////////////
/// Setup rend context menu items
ws.onRendCtxtMenuShowing = function (aEvent)
{
  var paintitem = document.getElementById("wspcPanelPaintMenu");
  var clrngitem = document.getElementById("wspcPanelRendColMenu");
  var selitem = document.getElementById("wspcPanelRendSelMenu");
  var editiitem = document.getElementById("wspcPanelEditIntrMenu");
  var gensurfitem = document.getElementById("wspcPanelGenSurfObjMenu");

  editiitem.hidden = true;
  if (this.checkRend("atomintr")!=null)
    editiitem.hidden = false;

  gensurfitem.hidden = true;
  if (this.checkRend("isosurf")!=null)
    gensurfitem.hidden = false;

  var rend = this.getSelectedRend();
  if (rend==null ||
      rend.type_name=="*selection") {
    selitem.hidden = true;
    paintitem.disabled = true;
    clrngitem.disabled = true;
    document.getElementById("wspcPanelStyleMenu").disabled = true;
    document.getElementById("wspcPanelCopyMenu").disabled = true;
    return;
  }

  selitem.hidden = false;
  document.getElementById("wspcPanelStyleMenu").disabled = false;
  document.getElementById("wspcPanelCopyMenu").disabled = false;
  
  if (this.checkColoring()==null) {
    paintitem.disabled = true;
    clrngitem.disabled = true;
  }
  else if (this.checkPaintColoring()==null) {
    paintitem.disabled = true;
    clrngitem.disabled = false;
  }
  else {
    paintitem.disabled = false;
    clrngitem.disabled = false;
  }

}

ws.checkPaintColoring = function ()
{
  var target = this.checkColoring();
  if (!target)
    return null;
  var coloring = target.coloring;

  var clsname = coloring._wrapped.getClassName();
  if (clsname!="PaintColoring") {
    dd("WS.coloringMol> Error, not paint coloring");
    return null;
  }

  return [coloring, target];
}

ws.checkColoring = function ()
{
  var target = this.getSelectedRend();

  if (target==null||
      target.type_name=="*selection" ||
      target.type_name=="*namelabel" ||
      target.type_name=="atomintr")
    return null;

  if (!('coloring' in target)) {
    //dd("WS.coloringMol> Error, coloring not supported in rend, "+elem.obj_id);
    return null;
  }

  return target;
};

ws.onColoringMol = function (aEvent)
{
  var target = this.checkColoring();
  if (target) {
    //alert("event value="+aEvent.target.value);
    gQm2Main.setRendColoring(aEvent.target.value, target);
  }
};

ws.onPaintMol = function (aEvent)
{
  dd("WS.paintMol: "+aEvent.target.localName);
  let value = aEvent.target.value;
  dd("WS.paintMol: "+value);

  let elem = this.mViewObj.getSelectedNode();
  let uobj = cuemol.getUIDObj(elem.obj_id);
  if (!('coloring' in uobj))
    return;
  let coloring = uobj.coloring;

  let sel = null;
  if ('getClientObj' in uobj) {
    // renderer
    var mol = uobj.getClientObj();
    if ('sel' in mol)
      sel = mol.sel;
  }    
  else if ('sel' in uobj) {
    // object
    sel = uobj.sel;
  }

  if (sel==null || sel.isEmpty()) {
    dd("WS.coloringMol> Error, cur sel is empty");
    util.alert(window, "Selection is empty");
    return;
  }

  let scene = uobj.getScene();

  // EDIT TXN START //
  scene.startUndoTxn("Insert paint entry");

  try {
    if (uobj._wrapped.isPropDefault("coloring"))
      uobj.coloring = coloring;
    coloring.insertBefore(0, sel, cuemol.makeColor(value));
  }
  catch (e) {
    dd("***** ERROR: insewrtBefore "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
};

////////////////////////////////
// Interaction renderer related methods

ws.checkRend = function (aName)
{
  var target = this.getSelectedRend();
  if (target==null||
      target.type_name !== aName)
    return null;
  return target;
}

ws.onEditIntr = function ()
{
  var rend = this.checkRend("atomintr");
  
  var args = Cu.getWeakReference({target: rend});
  window.openDialog("chrome://cuemol2/content/tools/aintr-edit-dlg.xul",
                    null,
                    "chrome,modal,resizable=no,dependent,centerscreen",
                    args);
}

////////////////////////////////
// MapSurf (isosurf) renderer related methods

ws.onGenSurfObj = function ()
{
  var rend = this.checkRend("isosurf");
  var obj = rend.getClientObj();
  var newobj = rend.generateSurfObj();
  var scene = rend.getScene();
  
  var sgnm = util.makeUniqName2(
    function (a) {return obj.name+"_sf"+a},
    function (a) {return scene.getObjectByName(a);} );

  let rendtype = "molsurf";
  let rendnm = util.makeUniqName2(
    function (a) {return rendtype+a; },
    function (a) {return scene.getRendByName(a);} );

  // EDIT TXN START //
  scene.startUndoTxn("Generate surfobj");
  try {
    newobj.name = sgnm;
    scene.addObject(newobj);
    let newrend = newobj.createRenderer(rendtype);
    newrend.name = rendnm;

    if (rend.colormode=="multigrad") {
      newrend.colormode = "multigrad";
      newrend.multi_grad.copyFrom(rend.multi_grad);
      newrend.elepot = rend.color_mapname;
    }
    else {
      //newrend.colormode = "solid";
      newrend.defaultcolor = rend.color;
    }
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
}

///////////////////////////////////
// Mol/rend context menu for styles

ws.onStyleShowing = function (aEvent)
{
  try {

    var elem = this.mViewObj.getSelectedNode();
    //dd("elem.type_name="+elem.type_name);

    if (elem.type!="renderer") return;

    var menu = aEvent.currentTarget.menupopup;

    var regex = null;
    regex = RegExp(elem.type_name+"$", "i");
    cuemolui.populateStyleMenus(this.mTgtSceneID, menu, regex, true);
    
    // add edge styles
    if (elem.type_name != "simple" &&
        elem.type_name != "trace" &&
        elem.type_name != "spline" &&
        elem.type_name != "*namelabel" &&
        elem.type_name != "*selection" &&
        elem.type_name != "coutour") {
      regex = /^EgLine/;
      util.appendMenuSep(document, menu);
      cuemolui.populateStyleMenus(this.mTgtSceneID, menu, regex, false);
    }

  } catch (e) { debug.exception(e); }
};

ws.styleMol = function (aEvent)
{
  try {
    var rend = this.getSelectedRend();
    if (rend==null)
      return;

    var value = aEvent.target.value;
    var remove_re = aEvent.target.getAttribute("remove_re");
    remove_re = remove_re.substr(1, remove_re.length-2);
    remove_re = RegExp(remove_re);

    var style = value.substr("style-".length);
    dd("style: "+style);
    dd("remove_re: "+remove_re);

    var curstyle = rend.style;
    curstyle = styleutil.remove(curstyle, remove_re);
    style =  styleutil.push(curstyle, style);
    dd("styleMol> new style: "+style);

    var scene = rend.getScene();

    // EDIT TXN START //
    scene.startUndoTxn("Change style");

    try {
      rend.applyStyles(style);
    }
    catch (e) {
      dd("***** ERROR: pushStyle "+e);
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //

  } catch (e) { debug.exception(e); }
};


////////////////////////////////
/// Initialize camera context menu
ws.onCamCtxtShowing = function (aEvent)
{
  try {
    //
    // Update the camera-paste menu
    //
    var item = document.getElementById("wspcCamCtxt-Paste");

    let clipboard = require("qsc-copipe");
    let xmlstr = clipboard.get("qsccam");
    if (xmlstr)
      item.disabled = false;
    else
      item.disabled = true;

    //
    // Update other menus
    //
    var elem = this.mViewObj.getSelectedNode();
    var tgt = Array.prototype.slice.call(this.mCamCtxtDisableTgt, 0);
    
    if (elem.type=="camera") {
      tgt.forEach( function (elem, ind, ary) {
	  elem.setAttribute("disabled", false);
	});
    }
    else {
      tgt.forEach( function (elem, ind, ary) {
	  elem.setAttribute("disabled", true);
	});
    }

    // update reload menu
    dd("elem type="+elem.type);
    if (elem.type=="camera") {
      let widget = document.getElementById("wspcCamCtxtReload");
      let name = elem.obj_id;
      let scene = this._mainWnd.currentSceneW;
      let cam = scene.getCameraRef(name);
      let srcpath = cam.src;
      if (srcpath.length==0)
        widget.disabled = true;
      else
        widget.disabled = false;
    }
    
  } catch (e) { debug.exception(e); }
};


/// initialize style context menu
ws.onStyCtxtShowing = function (aEvent)
{
  try {
    //
    // Update other menus
    //
    var elem = this.mViewObj.getSelectedNode();
    var tgt = Array.prototype.slice.call(this.mStyCtxtDisableTgt, 0);
    
    if (elem.type=="style") {
      // Style item node is selected
      tgt.forEach( function (elem, ind, ary) {
	  elem.setAttribute("disabled", false);
	});
    }
    else {
      // Style top node is selected
      tgt.forEach( function (elem, ind, ary) {
	  elem.setAttribute("disabled", true);
	});
    }

    // Update the style-paste menu
    {
      let clipboard = require("qsc-copipe");
      let item = document.getElementById("wspcStyleCtxtMenu-Paste");
      if (clipboard.check("qscsty"))
	item.disabled = false;
      else
	item.disabled = true;
    }

    dd("elem type="+elem.type);
    if (elem.type=="style") {
      // get target style set
      let stylem = cuemol.getService("StyleManager");
      let styleset = stylem.getStyleSet(elem.obj_id);

      // update reload menu
      let widget = document.getElementById("wspcStyCtxtReload");
      if (styleset.src.length>0)
        // external style set --> reloadable
        widget.setAttribute("disabled", false);
      else
        widget.setAttribute("disabled", true);

      // update toggle read-only menu
      widget = document.getElementById("wspcStyCtxtReadOnly");
      if (styleset.readonly)
        widget.setAttribute("checked", true);
      else
        widget.removeAttribute("checked");
      
      let item_copy = document.getElementById("wspcStyleCtxtMenu-Copy");
      if (elem.scene_id==0) {
	// global styles
	// disable "toggle readonly" menu
        widget.setAttribute("disabled", true);
	// disable copy menu
	item_copy.setAttribute("disabled", true);
      }
      else {
	// local styles
	// enable "toggle readonly" menu
        widget.setAttribute("disabled", false);
	// enable copy menu
	item_copy.setAttribute("disabled", false);
      }

      // modified style cannot be changed to read-only mode!!
      if (!styleset.readonly && styleset.modified)
        widget.setAttribute("disabled", true);
    }
    
  } catch (e) { debug.exception(e); }
};

/////////////////////////////////////////////

// Context menu setup for multiple selection
ws.onMulCtxtMenuShowing = function (event)
{
  var widget = document.getElementById("wspcMulCopy");
  var elemList = this.mViewObj.getSelectedNodeList();
  var type = this.checkSelTypes(elemList);
  if (type=="renderer") {
    // Only the multi-copy of renderer is supported
    // --> disable copy menu
    widget.disabled = false;
  }
  else {
    widget.disabled = true;
  }
};

ws.onShowHideCmd = function (aEvent, aShow)
{
  var elemList = this.mViewObj.getSelectedNodeList();
  var nsel = elemList.length;
  if (nsel<=0)
    return;

  var scene = cuemol.getScene(this.mTgtSceneID);

  // EDIT TXN START //
  scene.startUndoTxn("Change visibilities");
  try {

    for (var i=0; i<nsel; ++i) {
      let elem = elemList[i];
      if (elem.type=="object") {
	let obj = cuemol.getObject(elem.obj_id);
	if (obj.visible != aShow)
	  obj.visible = aShow;
      }
      else if (elem.type=="renderer") {
	let rend = cuemol.getRenderer(elem.obj_id);
	if (rend.visible != aShow)
	  rend.visible = aShow;
      }
      else if (elem.type=="rendGroup") {
	// TO DO: renderer group impl
      }
    }
  }
  catch (e) {
    dd("***** ERROR: Change group visibility "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

ws.onApplyStyle = function (aEvent)
{
  if (this.mViewObj.isMultiSelected()) {
    // TO DO: show error msg
    util.alert(window, "Multiple items are selected.");
    return;
  }

  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;

  if (elem.type!="renderer")
    return;

  let rend = cuemol.getRenderer(id);
  let scene = rend.getScene();

  // Show Modal Dialog to apply styles to rend
  var argobj = {
  scene_id: scene.uid,
  rend_id: id
  };
  
  var stylestr = "chrome,modal,resizable=yes,dependent,centerscreen";
  window.openDialog("chrome://cuemol2/content/style/apply_rend_style.xul",
		    "", stylestr, argobj);

  dd("dialg result: "+debug.dumpObjectTree(argobj, 1));
  if (!argobj.bOK)
    return;

};

ws.onCreateStyle = function (aEvent)
{
  if (this.mViewObj.isMultiSelected()) {
    // TO DO: show error msg
    util.alert(window, "Multiple items are selected.");
    return;
  }
  
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;

  if (elem.type!="renderer")
    return;

  let rend = cuemol.getRenderer(id);
  let scene = rend.getScene();

  // Show Modal Dialog to get new style's name, etc.
  var argobj = {
  scene_id: scene.uid,
  rend_id: id
  };
  
  var stylestr = "chrome,modal,resizable=no,dependent,centerscreen";
  window.openDialog("chrome://cuemol2/content/style/rendstyle_create.xul",
		    "", stylestr, argobj);

  // dd("dialg result: "+debug.dumpObjectTree(argobj, 1));
  if (!argobj.bOK)
    return;
  
  // Create new style
  let ssetid = argobj.style_setid;
  let stylename = argobj.style_name;

  try {
    let rend = cuemol.getRenderer(id);
    let scene = rend.getScene();
    let stylem = cuemol.getService("StyleManager");
    stylem.createStyleFromObj(scene.uid, ssetid, stylename, rend)
  } catch (e) {
    debug.exception(e);
  }
};

