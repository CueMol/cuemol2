// -*-Mode: C++;-*-
//
// File-open renderer option page
//
// $Id: fopen-renderopt-page.js,v 1.13 2011/04/29 17:38:47 rishitani Exp $
//

var FopenRenderOptPage;

( function () {

const histry_name_prefix = "cuemol2.ui.histories.new_renderer_type";
const pref = require("preferences-service");
const util = require("util");

// constructor
FopenRenderOptPage = function (aData)
{
  this.mData = aData; //window.arguments[0];
  this.mRendTypeBox = null;

  this.mRendNameDefault = true;

  var xthis = this;
  addEventListener("load", function() {try {xthis.init();} catch (e) {debug.exception(e);}}, false);
  addEventListener("unload", function() {xthis.fini();}, false);
}

var klass = FopenRenderOptPage.prototype;

klass.init = function ()
{
  var that = this;

  this.mRendNameEdit = document.getElementById('renderopt-rendname');
  this.mRendNameEdit.addEventListener("change", function (a) { that.onRendNameChanged(a); }, false);
  
  this.mSelCheck = document.getElementById('selection-check');
  this.mSelCheck.addEventListener("command", function () { that.onSelCheck();}, false);

  this.mCenOptDeck = document.getElementById("recenter-options");

  /////

  this.mSelList = document.getElementById('mol-selection-list');
  this.mSelList.targetSceID = this.mData.sceneID;
  var objs = this.mData.target;
  if (objs.length==1) {
    var obj0 = objs[0];
    if ( cuemol.implIface(obj0.obj_type, "MolCoord") ) {
      if ("uid" in obj0) {
	this.mSelList.molID = obj0.uid;
	( function () { try {
	    var tmp = cuemol.getObject(obj0.uid);
	    if (tmp.sel.toString().length>0) {
	      // target is mol and has valid selection --> enable selection option
	      this.mSelCheck.checked = true;
	      this.mSelList.disabled = false;
	    }
	  } catch (e) { debug.exception(e); } } ).apply(this);
      }
    }
    else {
      // target is not molecule --> disable selection option
      this.mSelList.disabled = true;
      this.mSelCheck.checked = false;
      this.mSelCheck.disabled = true;

      if ( cuemol.implIface(obj0.obj_type, "DensityMap") ) {
        // scalar object type: enable redraw/center options
        this.mCenOptDeck.selectedIndex = 1;
      }

    }
  }
  else if (objs.length>1) {
    // multiple object target: ???
    /*
    var testobj = cuemol.getObject(objs[0].uid);
    if (testobj) {
      this.mSelList.targetSceID = testobj.scene_uid;
    }*/
  }
  
  this.mSelList.buildBox();
  
  /////

  this.mObjNameEdit = document.getElementById('renderopt-objname');
  this.mRendTypeSel = document.getElementById('renderopt-rendtype-sel');
  this.mRendTypeSel.addEventListener("select", function (a) { that.onRendTypeSelChanged(a); }, false);
  
  this.setupObjBox();
  this.setupRendTypeBox();
}

klass.fini = function ()
{
  // for the checkbox status to be correctly saved
  util.persistChkBox("center", document);
};

klass.onSelCheck = function ()
{
  this.mSelList.disabled = !this.mSelCheck.checked;
}

klass.onRendTypeSelChanged = function (aEvent)
{
  if (!this.mRendNameDefault)
    return;

  this.setDefaultRendName();

  // if (this.mRendTypeSel.selectedItem.value=="*group") {
  // }
  // else {
  // }
}

klass.onRendNameChanged = function (aEvent)
{
  // dd("onRendNameChanged: "+this.mRendNameEdit.value.length);

  if (this.mRendNameEdit.value.length==0) {
    this.mRendNameDefault = true;
    this.setDefaultRendName();
    return;
  }

  this.mRendNameDefault = false;
}

////////////////////

klass.setDefaultRendName = function ()
{
  if (this.mRendTypeSel.selectedItem==null)
    return;
  
  var selvalue = this.mRendTypeSel.selectedItem.value;
  dd("setDefaultRendName> selected item="+selvalue);

  if (selvalue.charAt(0)=="*")
    selvalue = selvalue.substr(1);

  dd("setDefaultRendName: scene ID="+this.mData.sceneID);
  var scene = cuemol.getScene(this.mData.sceneID);

  var sgnm = util.makeUniqName2(
    function (a) {return selvalue+a; },
    function (a) {return scene.getRendByName(a);} );

  dd("suggested name="+sgnm);
  //this.mRendNameEdit.emptyText = sgnm;
  this.mRendNameEdit.value = sgnm;

  // delete scene;
}

klass.setupObjBox = function ()
{
  var scene = cuemol.getScene(this.mData.sceneID);
  var objs = this.mData.target;
  var newname = objs[0].name;

  if ('bEditObjName' in this.mData &&
      this.mData.bEditObjName===false) {
    this.mObjNameEdit.value = newname;
    this.mObjNameEdit.disabled = true;
    return;
  }

  if (scene.getObjectByName(newname)==null)
    this.mObjNameEdit.value = newname;
  else {
    var sgnm = util.makeUniqName2(
      function (a) {return newname+"("+a+")"},
      function (a) {return scene.getObjectByName(a);} );
    
    this.mObjNameEdit.value = sgnm;
  }
}

klass.setupRendTypeBox = function ()
{
  var objs = this.mData.target;

  var ind = 0;
  var typs = objs[ind].rend_types;
  var typl = typs.split(",");

  // window.alert("typl: ["+typs+"] len="+typl.length);
  if (!typs || typl.length==0) {
    this.mRendTypeSel.disabled = true;
    return;
  }

  this.mRendTypeSel.removeAllItems();

  /*
  if (objs[0].obj_type=="MolCoord" &&
      (this.mData.bRendGrp || this.mData.bEditObjName)) {
    this.mRendTypeSel.appendItem("Composite", "composite");
  }
  */
  if (objs[ind].preset_types!=null &&
      objs[ind].preset_types.length>0) {
    let nlen = objs[ind].preset_types.length;
    for (let i=0; i<nlen; ++i) {
      this.mRendTypeSel.appendItem(objs[ind].preset_types[i].desc,
				   objs[ind].preset_types[i].name);
    }
    util.appendMenuSep(document, this.mRendTypeSel.menupopup);
  }

  for (var i=0; i<typl.length; ++i) {
    //window.alert("addtype: "+typl[i]);
    if (typl[i].charAt(0)=="*")
      continue;
    if (typl[i]=="ms2test"||typl[i]=="symm") //||typl[i]=="unitcell")
      continue;
    
    this.mRendTypeSel.appendItem(typl[i], typl[i]);
  }
  
  if (this.mData.bRendGrp) {
    // Add renderer group item
    util.appendMenuSep(document, this.mRendTypeSel.menupopup);
    this.mRendTypeSel.appendItem("Group", "*group");
  }
  
  this.mRendTypeSel.selectedIndex = 0;
  this.mRendTypeSel.disabled = false;
  
  var histry_name = histry_name_prefix + objs[ind].obj_type;
  dd("has histry = "+pref.has(histry_name));
  dd("histry_name = "+pref.get(histry_name));
  
  try {
    
    if (pref.has(histry_name)) {
      var prev_name = pref.get(histry_name);
      for (i=0; i<this.mRendTypeSel.itemCount; ++i) {
        var name = this.mRendTypeSel.getItemAtIndex(i).value;
        dd("name="+name);
        dd("prevname="+prev_name);
        if (name==prev_name) {
          this.mRendTypeSel.selectedIndex = i;
          break;
        }
      }
    }
    
  }catch (e) {
    debug.exception(e);
  }

}

////////////////////
// Event handlers

klass.onObjSelChanged = function (ev)
{
  var uid = parseInt(ev.target.value);
  //window.alert("selobj: "+uid+" "+ev.target.label);

  // change the target object
  // this.mObj = this.mScene.invoke1("getObject", uid);
  this.setupRendTypeBox();
}

klass.onDialogAccept = function(event)
{
  try {

    var selectedSel = this.mSelList.selectedSel;
    if (this.mSelCheck.checked) {
      if (selectedSel==null)
        return false; // prevent closing
      // Save selection to the history
      util.selHistory.append(selectedSel.toString());
    }

    if (!this.mRendTypeSel.value) {
      // invalid renderer type
      var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Ci.nsIPromptService);
      prompts.alert(window, document.title, "Cannot create renderer: \""+this.mRendTypeSel.value+"\"");
      // same as canceling
      return true;
    }

    if (this.mCenOptDeck.selectedIndex==0)
      this.mData.center = document.getElementById("center").checked;
    else {
      this.mData.center = document.getElementById("center-view").selected;
      this.mData.redraw = document.getElementById("redraw-view").selected;
    }

    this.mData.rendtype  = this.mRendTypeSel.value;

    this.mData.obj_id  = this.mData.target[0].uid;

    // renderer name
    this.mData.rendname = this.mRendNameEdit.value;

    // selection
    if (this.mSelCheck.checked)
      this.mData.sel = selectedSel;
    else
      this.mData.sel = null;

    // object name
    this.mData.target[0].name = this.mObjNameEdit.value;

    dd("this.mData.sel: "+this.mData.sel);

    // save selected renderer type index
    var histry_name = histry_name_prefix + this.mData.target[0].obj_type;
    dd("histry_name = "+histry_name);
    pref.set(histry_name, this.mData.rendtype);

    dd("FopenRendoptPage accept OK.");

    this.mData.ok = true;
  }
  catch (e) {
    debug.exception(e);
  }

  return true;
}

} )();

window.gRenderOptPage = new FopenRenderOptPage(window.arguments[0]);

