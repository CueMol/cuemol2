//
// Measure toolribbon
//
// $Id: measure-toolribbon.js,v 1.7 2011/05/02 12:42:55 rishitani Exp $
//

if (!("MeasToolRibbon" in cuemolui)) {

cuemolui.MeasToolRibbon = ( function() {

// constructor
var ctor = function (aIdBase)
{
  this.mParent = null;
  this.name = aIdBase;
  this.mTabId = aIdBase+"-ribbon-tab";
  this.mTabPanelId = aIdBase+"-ribbon-tabpanel";
  
  // attach to the load/unload event for the target document/window
  var that = this;
  window.addEventListener("load", function(){that.onLoad();}, false);
  // aWindow.addEventListener("unload", function() {that.onUnLoad();}, false);

  this.mCurMode = 1;
  this.mPickNum = 2;
}

var klass = ctor.prototype;

//////

// private initialization routine
klass.onLoad = function ()
{
  var that = this;
  document.getElementById("measure-ribbon-distbtn").addEventListener(
    "command", function (a) { that.onRadioBtn(a); }, false);
  document.getElementById("measure-ribbon-anglbtn").addEventListener(
    "command", function (a) { that.onRadioBtn(a); }, false);
  document.getElementById("measure-ribbon-torsbtn").addEventListener(
    "command", function (a) { that.onRadioBtn(a); }, false);

  this.mTgtList = document.getElementById("measure-ribbon-tgtlist");

  this.mTgtList.addEventListener("popupshowing", function (a) { that.onTgtListShowing(a); }, false);
}

klass.onRadioBtn = function (aEvent)
{
  var sel = null;
  switch (aEvent.target.id) {
  case "measure-ribbon-distbtn":
    sel = 1;
    break;
  case "measure-ribbon-anglbtn":
    sel = 2;
    break;
  case "measure-ribbon-torsbtn":
    sel = 3;
    break;
  }

  if (sel==this.mCurMode)
    return;

  this.mCurMode = sel;
  this.mPickNum = sel+1;

  this.mPickArray = new Array();
  if (this.mDrawObj) {
    this.mDrawObj.enabled = false;
    this.mDrawObj.enabled = true;

    var view = this.mParent.getTgtView();
    if (!view)
      return;
    view.invalidate();
    view = null;
  }
}

klass.onActivated = function ()
{
  dd("Meas Tool activated");
  var view = this.mParent.getTgtView();
  if (!view)
    return;

  this.mDrawObj = view.getDrawObj("DistPickDrawObj");
  view = null;

  if (!this.mDrawObj)
    return;

  this.mDrawObj.enabled = true;
  dd("Meas Tool activated: "+ this.mDrawObj.enabled);

  this.mPickArray = new Array();
}

klass.onInactivated = function ()
{
  if (this.mDrawObj)
    this.mDrawObj.enabled = false;
  this.mDrawObj = null;

  var view = this.mParent.getTgtView();
  if (!view)
    return;
  view.invalidate();

  view = null;
}

klass.onCtxtMenu = function (aEvent)
{
}

klass.onTgtListShowing = function (aEvent)
{
  try {
    var rend_names = new Array();
    var scene = cuemol.getScene(this.mParent.mTgtSceneID);
    var objary = util.toIntArray( scene.obj_uids );

    dd("ListShowing> objary: "+ objary);
    var nobjs = objary.length;

    for (var i=0; i<nobjs; ++i) {
      var obj_id = objary[i];
      var obj = scene.getObject(obj_id);
      rend_names = rend_names.concat( cuemol.getRendNameList(obj,"atomintr") );
      //dd("*** "+rend_names);
/*
      var rendary = util.toIntArray( obj.rend_uids );
      var nrends = rendary.length;

      //dd("Obj "+i+"; "+obj);
      //dd(" "+rendary);
      //dd(" "+obj.name);

      for (var j=0; j<nrends; ++j) {
	var rend_id = rendary[j];
	//dd("rend_id "+rend_id+" type="+typeof rend_id);
	var rend = obj.getRenderer(rend_id);
	dd("  Rend "+j+"; "+rend);
	if (rend.type_name=="atomintr") {
	  rend_names.push(rend.name);
	}
      }
      rendary = null;
*/
    }
    objary = null;

    var menu = this.mTgtList.menupopup;

    while (menu.firstChild)
      menu.removeChild(menu.firstChild);

    if (rend_names.length==0) {
      util.appendMenu(document, menu, 0, "measure");
      return;
    }

    rend_names.forEach(function (aElem) {
      util.appendMenu(document, menu, 0, aElem);
    });

  } catch (e) {debug.exception(e);}
}

klass.onMouseClicked = function (x, y, mod)
{
  dd("MeasTool: mouse clicked");

  var res = this.mParent.getHittestRes(x, y);
  if (!res)
    return;
  
  var view = this.mParent.getTgtView();
  if (!view)
    return;

  if ( cuemol.implIface(res.objtype, "MolCoord") ) {
    var obj_id = res.obj_id;
    var atom_id = res.atom_id;
    this.mPickArray.push({"obj_id": obj_id, "atom_id": atom_id});

    if (this.mPickArray.length>=this.mPickNum) {
      this.defineDistLabel();
      this.reset();
    }
    else if (this.mDrawObj) {
      this.mDrawObj.append(obj_id, atom_id);
      var atomnm = "["+res.obj_name+"] "+res.message;
      gQm2Main.mStatusLabel.label = this.mPickArray.length+" atom ("+atomnm+") is picked.";
    }
    view.invalidate();
  }

  view = null;
  return;
}

function searchRend(obj, labeltype, labelname)
{
    const size = obj.getRendCount();
    for (var i=0; i<size; ++i) {
	var rend = obj.getRendererByIndex(i);
	if (rend) {
	    if (rend.type_name==labeltype &&
		rend.name==labelname) {
		return rend;
	    }
	}
    }

    return null;
};

klass.reset = function ()
{
  this.mPickArray = new Array();
  this.mDrawObj.enabled = false;
  this.mDrawObj.enabled = true;
};

klass.defineDistLabel = function ()
{
  const labeltype = "atomintr";
  const labelname = this.mTgtList.value;
  //alert("distlabel labelname="+labelname);
  
  var objid = this.mPickArray[0].obj_id;
  var obj = cuemol.getObject(objid);
  if (!obj) return;

  var scene = cuemol.getScene(this.mParent.mTgtSceneID);
  if (!scene) {
    dd("*** FATAL ERROR: Scene is null, cannot make distlabels!! ***");
    return;
  }

  if (this.mCurMode==1) {
    if (this.mPickArray[0].obj_id == this.mPickArray[1].obj_id &&
	this.mPickArray[0].atom_id == this.mPickArray[1].atom_id) {
      gQm2Main.mStatusLabel.label = "Atom pick canceled.";
      return;
    }
  }
  else if (this.mCurMode==2) {
    if ((this.mPickArray[0].obj_id == this.mPickArray[1].obj_id &&
	 this.mPickArray[0].atom_id == this.mPickArray[1].atom_id) ||
	(this.mPickArray[1].obj_id == this.mPickArray[2].obj_id &&
	 this.mPickArray[1].atom_id == this.mPickArray[2].atom_id) ||
	(this.mPickArray[2].obj_id == this.mPickArray[0].obj_id &&
	 this.mPickArray[2].atom_id == this.mPickArray[0].atom_id)) {
      gQm2Main.mStatusLabel.label = "Atom pick canceled.";
      return;
    }
  }

  // EDIT TXN START //
  scene.startUndoTxn("Define Label(s)");

  // var label_rend = obj.getRendererByType(labeltype);
  var label_rend = searchRend(obj, labeltype, labelname);
  dd("label rend getRendererByType: "+label_rend);
  if (!label_rend) {
    // create new renderer
    label_rend = obj.createRenderer(labeltype);
    //label_rend.showlabel = true;
    //label_rend.mode = "simple";

    label_rend.name = labelname;
    label_rend.applyStyles("DefaultLabel,DefaultAtomIntr");
  }

  try {
    switch (this.mCurMode) {
    case 1:
      label_rend.appendById(this.mPickArray[0].atom_id,
			    this.mPickArray[1].obj_id,
                            this.mPickArray[1].atom_id, true);
      gQm2Main.mStatusLabel.label = "Distance label is defined";
      break;
      
    case 2:
      label_rend.appendAngleById(this.mPickArray[0].atom_id,
                                 this.mPickArray[1].obj_id,
                                 this.mPickArray[1].atom_id,
                                 this.mPickArray[2].obj_id,
                                 this.mPickArray[2].atom_id);
      gQm2Main.mStatusLabel.label = "Angle label is defined";
      break;
      
    case 3:
      label_rend.appendTorsionById(this.mPickArray[0].atom_id,
                                   this.mPickArray[1].obj_id,
                                   this.mPickArray[1].atom_id,
                                   this.mPickArray[2].obj_id,
                                   this.mPickArray[2].atom_id,
                                   this.mPickArray[3].obj_id,
                                   this.mPickArray[3].atom_id);
      gQm2Main.mStatusLabel.label = "Torsion label is defined";
      break;
    }
  }
  catch(e) {
    dd("DefineDistLabel Error!!");
    debug.exception(e);
    scene.rollbackUndoTxn();
    cuemol.putLogMsg("DefineDistLabel Error!!");
    scene = null;
    obj = null;
    label_rend = null;
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  scene = null;
  obj = null;
  label_rend = null;

}

return ctor;

} )();

}

