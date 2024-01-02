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

  try {
    // auto-create selection renderer
    cuemolui.autoCreateSelRend(mol);

    // set default painting for mol
    if (result.new_obj)
      mol.coloring = this.createDefPaintColoring();

    // setup disorder renderer
    if (result.rendtype== "disorder" ) {
      // set default target renderer name (tube, ribbon, catoon, or nucl)
      var rend_names = cuemol.getRendNameList(mol, "tube", "ribbon", "cartoon", "nucl");
      if (rend_names[0])
        rend.target = rend_names[0];
    }

  }
  catch (e) {
    dd("*** Perform mol renderer post proc failed: "+e);
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
  else if (rend_type === "isosurf") {
    rend.applyStyles("DefaultIsoSurf");
  }
  else if ('coloring' in rend) {
    rend.applyStyles("DefaultCPKColoring");
  }
    
};

Qm2Main.prototype.getCompatibleRendPresetNames = function(aObjTypeName, aSceneID)
{
  let stylem = cuemol.getService("StyleManager");

  let json_str = stylem.getStyleNamesJSON(0);
  dd("getCompatibleRendPresetNames("+aObjTypeName+",0) JSON="+json_str);
  let styles = JSON.parse(json_str);

  if (aSceneID) {
    json_str = stylem.getStyleNamesJSON(aSceneID);
    dd("getCompatibleRendPresetNames("+aObjTypeName+","+aSceneID+") JSON="+json_str);
    styles = styles.concat( JSON.parse(json_str) );
  }
  
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

  let preset_re = /RendPreset$/;
  //if (result.rendtype=="composite") {
  if (result.rendtype.match(preset_re)) {
    rend = obj.createPresetRenderer(result.rendtype, result.rendname, result.rendname);
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

  let view = this.mMainWnd.currentViewW;
  if (result.center) {
    //alert("result.center="+result.center);
    //alert("rend.has_center="+rend.has_center);
    if (clsname === "DensityMap") {
      // recenter to the volume center / size
      obj.fitView(view, false);
    }
    else if (rend.has_center) {
      var pos = rend.getCenter();
      view.setViewCenter(pos);
    }
  }
  else if (result.redraw && clsname === "DensityMap") {
    // Redraw option
    // --> we set the view center to the map center
    let pos = view.getViewCenter();
    rend.center = pos;
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
  
  scene.startUndoTxn("Delete renderer: "+objname+"/"+name);
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

