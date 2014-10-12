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
  else if ('coloring' in rend) {
    rend.applyStyles("DefaultCPKColoring");
  }
    
}

/// Do actual task for renderer setup:
/// Create renderer, and set initial props.
Qm2Main.prototype.doSetupRend = function(sc, result)
{
  let mol = sc.getObject(result.obj_id);
  let rend = mol.createRenderer(result.rendtype);

  let clsname = mol._wrapped.getClassName();

  // dd("doSetupRend> CALLED!! cls="+clsname);

  if (clsname === "DensityMap" ||
      clsname === "ElePotMap") {
    // no center
    result.center = false;
  }
  else if (clsname === "MolSurfObj") {
  }
  else {
    this.molPostProc(sc, mol, rend, result);
  }
  
  // set default styles
  this.setDefaultStyles(mol, rend);

  rend.name = result.rendname;

  if ("sel" in rend && result.sel)
    rend.sel = result.sel;

  if (result.center) {
    var pos = rend.getCenter();
    var view = this.mMainWnd.currentViewW;
    view.setViewCenter(pos);
  }

  return rend;
}

/////////////////////////////////////////////////////

Qm2Main.prototype.setupRendByObjID = function(aObjID, aRendGrp)
{
  var rend;
  let obj = cuemol.getObject(aObjID);
  let sc = obj.getScene();

  let data  = new Array();
  let i = 0;
      
  data[i] = new Object();
  data[i].uid = obj.uid;
  data[i].name = obj.name;
  data[i].rend_types = obj.searchCompatibleRendererNames();
  data[i].obj_type = obj._wrapped.getClassName();

  let option = new Object();
  option.target = data;
  option.sceneID = sc.uid;
  option.ok = false;
  option.bEditObjName = false;

  let result = this.doSetupRendDlg(option);
  if (!result.ok)
    return null;

  result.new_obj = false;
  sc.startUndoTxn("Create new representation");
  try {
    rend = this.doSetupRend(sc, result);
    if (aRendGrp)
      rend.group = aRendGrp;
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
  if (!rend) {
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);
    return;
  }
  var obj = rend.getClientObj();
  if (!obj) {
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);
    return;
  }
  var scene = rend.getScene();
  if (!scene) {
    throw ("DeleteRenderer: ERROR!! invalid renderer ID="+aRendID);
    return;
  }
  
  scene.startUndoTxn("Delete representation");
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

Qm2Main.prototype.SELOBJP_SCENE = 0x01;
Qm2Main.prototype.SELOBJP_OBJECT = 0x02;
Qm2Main.prototype.SELOBJP_RENDERER = 0x04;

Qm2Main.prototype.doSelectObjPrompt = function(dlg_title, filter_fn)
{
  var id, label, ok;
  var labellist = new Array();
  var uidlist = new Array();
  var selected = {};
  var re = /\(([0-9]+)\)$/, match;
  var scene;

  try {
    scene = this.mMainWnd.currentSceneW;
    var json = scene.getObjectTreeJSON();
    var obj = JSON.parse(json);
    for (var i=0; i<obj.length; ++i) {
      // if (i==0 && !(type_flag&this.SELOBJP_SCENE) )
      // continue;
      var target = obj[i];
      label = filter_fn((i==0)?"scene":"object", target);
      if (label!==null) {
        labellist.push(label);
        uidlist.push(target.ID);
      }
      //id = obj[i].ID;
      //label = ( (i===0)?"Scn ":"Obj " ) + obj[i].name + " (" + id + ")";
      //if (type_flag&this.SELOBJP_OBJECT)

      var rnds = target.rends;
      if (typeof rnds!='undefined' && 'length' in rnds) {
        for (var j=0; j<rnds.length; ++j) {
          target = rnds[j];
          label = filter_fn("renderer", target);
          if (label!==null) {
            labellist.push(label);
            uidlist.push(target.ID);
          }

          //id = rnds[j].ID;
          //label = "Rnd " + rnds[j].name + " (" + id + ")";
          //labellist.push(label);
        }
      }
    }
  }
  catch (e) {
    debug.exception(e);
    return null;
  }

  ok = this.mPrompts.select(window, document.title, dlg_title, 
                                labellist.length, labellist, selected);

  if (!ok)
    return null;

  target_ID = uidlist[selected.value];

  return target_ID;
}

Qm2Main.prototype.onChgRendProp = function()
{
  var id, ok;
  var scene;

  scene = this.mMainWnd.currentSceneW._wrapped;

  targetObj = this.doSelectObjPrompt("Select target object", 1+2+4);
  if (!targetObj)
    return;

  //////////

  var input = {value: ""};
  var dummy = {};
  var old_value, new_value, prop_name;

  ok = this.mPrompts.prompt(window, document.title,
                            "Prop name for "+(targetObj.getProp("name"))+":", input,
                            "", dummy
                            );
  if (!ok) return;
  prop_name = input.value;

  try {
    old_value = targetObj.getProp(input.value);
  }
  catch (e) {
    dump("error: " +e+ "\n");
    return;
  }

  //////////

  var dflag;

  try {
    dflag = targetObj.isPropDefault(input.value);
  }
  catch (e) {
    dump("error: " +e+ "\n");
    return;
  }

  // prop is not in default value
  if (dflag==1) {
    ok = this.mPrompts.confirm(window, "Default value",
                               "Do you want to reset "+prop_name+" (value="+old_value+")"+"to default?");
    if (ok) {
      
      try {
        targetObj.resetProp(input.value);
      }
      catch (e) {
        dump("error: " +e+ "\n");
        return;
      }
      return;
    }
  }

  //////////

  input.value = old_value;
  ok = this.mPrompts.prompt(window, document.title,
                            "Prop value for "+prop_name+" (old="+old_value+")"+":", input,
                            "", dummy
                            );
  if (!ok) return;

  // EDIT TXN START //
  scene.invoke1("startUndoTxn", "Change prop");
  try {
    targetObj.setProp(prop_name, input.value);
  }
  catch (e) {
    dump("error: " +e+ "\n");
  }
  scene.invoke0("commitUndoTxn");
  // EDIT TXN END //

}

//////////

