// -*-Mode: C++;-*-
//
// $Id: renderer.js,v 1.55 2011/04/29 18:14:07 rishitani Exp $
//

Qm2Main.prototype.doSetupRendDlg = function(data)
{
  var result;

  window.openDialog("chrome://cuemol2/content/setupRenderer.xul",
		    "Setup renderer",
		    "chrome,modal,resizable=no,dependent,centerscreen",
                    data);

  // result is set in the argument, data
  return data;
}

Qm2Main.prototype.createDefPaintColoring = function()
{
  // dd("===== createDefPaintColoring called!!");
  var rval = cuemol.createObj("PaintColoring");
  rval.append(cuemol.makeSel("sheet"), cuemol.makeColor("SteelBlue"));
  rval.append(cuemol.makeSel("helix"), cuemol.makeColor("khaki"));
  rval.append(cuemol.makeSel("nucleic"), cuemol.makeColor("yellow"));
  rval.append(cuemol.makeSel("*"), cuemol.makeColor("FloralWhite"));
  return rval;
};

Qm2Main.prototype.molPostProc = function(sc, mol, rend, result)
{
  var sel_rend;
  var colscm;

  // auto-create selection renderer
  try {
    sel_rend = mol.getRendererByType("*selection");
    if (!sel_rend) {
      // create new renderer
      sel_rend = mol.createRenderer("*selection");
    }

    if (result.new_obj)
      mol.coloring = this.createDefPaintColoring();

    if (result.rendtype== "disorder" ) {
      // setup disorder renderer
      // set default target renderer name (tube, ribbon, catoon, or nucl)
      var rend_names = cuemol.getRendNameList(mol, "tube", "ribbon", "cartoon", "nucl");
      if (rend_names[0])
        rend.target = rend_names[0];
    }
  }
  catch (e) {
    dd("*** Cannot create selection renderer Reason : "+e);
    debug.exception(e);
  }
  
}

Qm2Main.prototype.setDefaultStyles = function(mol, rend)
{
  let rend_type = rend.type_name;
    
  // set coloring scheme
  if (rend_type === "tube" ||
      rend_type === "spline") {
    rend.applyStyles("DefaultHSCPaint");
  }
  else if (rend_type === "ribbon") {
    rend.applyStyles("DefaultRibbon,DefaultHSCPaint");
  }
  else if (rend_type === "cartoon") {
    rend.applyStyles("DefaultCartoon,DefaultHSCPaint");
  }
  else if (rend_type === "nucl") {
    rend.applyStyles("DefaultNucl");
  }
  else if (rend_type === "anisou") {
    rend.applyStyles("DefaultAnIsoU,DefaultCPKColoring");
  }
  else if (rend_type === "ballstick") {
    rend.applyStyles("DefaultBallStick,DefaultCPKColoring");
  }
  else if (rend_type === "cpk") {
    rend.applyStyles("DefaultCPK,DefaultCPKColoring");
  }
  else if (rend_type === "contour") {
    rend.applyStyles("DefaultContour");
  }
  else if ('coloring' in rend) {
    rend.applyStyles("DefaultCPKColoring");
  }
    
};

Qm2Main.prototype.doSetupCompRend = function (sc, result)
{
  var rendopt = {
  obj_id: result.obj_id,
  center: false
  };

  var orig_selstr = "";
  var res;
  
  if (result.sel) {
    orig_selstr = result.sel.toString();
  }
  
  /////

  rendopt.rendtype = "*group";
  rendopt.rendname = result.rendname;
  rendopt.new_obj = true;

  let resgrp = this.doSetupRend(sc, rendopt);

  /////

  rendopt.rendtype = "ribbon";
  rendopt.rendname = result.rendname+"prot";
  if (orig_selstr)
    selstr = "protein & ("+orig_selstr+")";
  else
    selstr = "protein";
  rendopt.sel = cuemol.makeSel(selstr);
  rendopt.new_obj = false;;

  res = this.doSetupRend(sc, rendopt);
  res.group = resgrp.name;

  /////

  rendopt.rendtype = "nucl";
  rendopt.rendname = result.rendname+"nucl";
  if (orig_selstr)
    selstr = "nucleic & ("+orig_selstr+")";
  else
    selstr = "nucleic";
  rendopt.sel = cuemol.makeSel(selstr);
  rendopt.new_obj = false;

  res = this.doSetupRend(sc, rendopt);
  res.group = resgrp.name;

  /////

  rendopt.rendtype = "ballstick";
  rendopt.rendname = result.rendname+"lgnd";
  if (orig_selstr)
    selstr = "(!nucleic&!protein) & ("+orig_selstr+")";
  else
    selstr = "!nucleic&!protein";
  rendopt.sel = cuemol.makeSel(selstr);
  rendopt.new_obj = false;

  res = this.doSetupRend(sc, rendopt);
  res.group = resgrp.name;

  /////

  if (result.center) {
    let view = this.mMainWnd.currentViewW;
    let obj = sc.getObject(result.obj_id);
    //let pos = obj.getCenterPos(false);
    //view.setViewCenter(pos);
    if (orig_selstr)
      obj.fitView2(result.sel, view);
    else
      obj.fitView(false, view);
  }  

};

Qm2Main.prototype.getCompatibleRendPresetNames = function(aObjTypeName, aSceneID)
{
  let stylem = cuemol.getService("StyleManager");
  let json_str = stylem.getStyleNamesJSON(aSceneID);
  alert("getCompatibleRendPresetNames("+aObjTypeName+","+aSceneID+") JSON="+json_str);
  let styles = JSON.parse(json_str);
  
  let nlen = styles.length;
  if (nlen==0) {
    return [];
  }

  let typenm = aObjTypeName + "-rendpreset";
  let rval = [];
  for (let i=0; i<nlen; ++i) {
    if (styles[i].type!=typenm)
      continue;
    let name = styles[i].name;
    let desc = styles[i].desc;
	
    rval.push({"name": name, "desc": desc});
  }

  dd("getCompatibleRendPresetNames result="+rval.join(","));
  return rval;
};


/// Do actual task for renderer setup:
/// Create renderer, and set initial props.
Qm2Main.prototype.doSetupRend = function(sc, result)
{
  //if (result.rendtype=="composite") {
  //this.doSetupCompRend(sc, result);
  //return;
  //}

  let obj = sc.getObject(result.obj_id);
  let rend = null;

  if (result.rendtype=="composite") {
    rend = obj.createPresetRenderer("Default1RendPreset", result.rendname, result.rendname);
  }
  else {
    rend = obj.createRenderer(result.rendtype);
  }

  let clsname = obj._wrapped.getClassName();

  // dd("doSetupRend> CALLED!! cls="+clsname);

  if (clsname === "ElePotMap") {
    // no center
    result.center = false;
  }
  else if (clsname === "MolSurfObj") {
  }
  else if (clsname === "DensityMap") {
  }
  else {
    // perform default setup for MolCoord (and derived classes) specifics
    this.molPostProc(sc, obj, rend, result);
  }
  
  // set default styles
  this.setDefaultStyles(obj, rend);

  rend.name = result.rendname;

  if ("sel" in rend && result.sel)
    rend.sel = result.sel;

  if (result.center) {
    let view = this.mMainWnd.currentViewW;
    if (clsname === "DensityMap") {
      // in the case of density map,
      // we set the view center to the map center
      let pos = view.getViewCenter();
      rend.center = pos;
    }
    else if (rend.has_center) {
      var pos = rend.getCenter();
      view.setViewCenter(pos);
    }
  }

  // special treatment for the call from netpdbopen.js
  if (clsname === "DensityMap") {
    if (result.mapcolor && result.mapsigma) {
      // in fo-fc map case, change the default color and sigma
      rend.color = cuemol.makeColor(result.mapcolor, sc.uid);
      rend.siglevel = result.mapsigma;
    }
  }
  
  return rend;
}

/////////////////////////////////////////////////////

Qm2Main.prototype.setupRendByObjID = function(aObjID, aRendGrp)
{
  var rend;
  let obj = cuemol.getObject(aObjID);
  let sc = obj.getScene();
  let sceneID = sc.uid;

  let data  = new Array();
  let i = 0;
      
  data[i] = new Object();
  data[i].uid = obj.uid;
  data[i].name = obj.name;
  data[i].rend_types = obj.searchCompatibleRendererNames();
  data[i].obj_type = obj._wrapped.getClassName();

  data[i].preset_types = this.getCompatibleRendPresetNames(data[i].obj_type, sceneID);

  let option = new Object();
  option.target = data;
  option.sceneID = sceneID;
  option.ok = false;
  option.bEditObjName = false;

  if (!aRendGrp)
    option.bRendGrp = true;

  let result = this.doSetupRendDlg(option);
  if (!result.ok)
    return null;

  result.new_obj = false;
  sc.startUndoTxn("Create new "+result.rendtype+" renderer");
  try {
    rend = this.doSetupRend(sc, result);
    if (aRendGrp) {
      // move the new renderer into the group aRendGrp
      rend.group = aRendGrp;
    }
  }
  catch (e) {
    dd("CreateRend> failed: "+e);
    debug.exception(e);
    sc.rollbackUndoTxn();
    util.alert(window, "ERROR: Create new representation; "+e);
    return;
  }
  sc.commitUndoTxn();

  return rend;
}

Qm2Main.prototype.deleteRendByID = function(aRendID)
{
  var rend = cuemol.getRenderer(aRendID);
  if (!rend)
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);

  var obj = rend.getClientObj();
  if (!obj)
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);

  var scene = rend.getScene();
  if (!scene)
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);

  var name = "";
  var objname = "";
  try { name = rend.name; objname = obj.name; } catch (e) {}
  
  scene.startUndoTxn("Delete renderer "+objname+"/"+name);
  var ok;
  try {
    ok = obj.destroyRenderer(aRendID);
  }
  catch (e) {
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();

  return;
}

