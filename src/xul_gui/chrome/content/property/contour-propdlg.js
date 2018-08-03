// -*-Mode: C++;-*-
//
// contour-propdlg.js
//  MapMeshRenderer Property Editor Page
//

// Make main page object
var gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
var gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

var gMapMesh = ( function () { try {

var util = require("util");

var ContourPropEdit = function ()
{
  // dd("ContourPropEdit> Constructor called");
  this.mLimTarg = new cuemolui.ObjMenuList("map-limtarg", window,
					   function (elem) {
                                             return cuemol.implIface(elem.type, "MolCoord");
                                           },
					   cuemol.evtMgr.SEM_OBJECT);
  this.mLimTarg._tgtSceID = gMain.getSceneID();
};

ContourPropEdit.prototype.onLoad = function ()
{
  let that = this;
  let scid = gMain.getSceneID();

  this.mUpdate = document.getElementById("map-update");
  this.mWidth = document.getElementById("map-width");
  this.mBufSize = document.getElementById("map-bufsize");
  this.mUsePBC = document.getElementById("use-pbc");

  this.mMapLim = document.getElementById("map-limit");

  this.mLimSel = document.getElementById("map-limsel");
  this.mLimSel.sceneID = scid;
  this.mLimSel.buildBox();

  this.mLimRng = document.getElementById("map-limrng");

  // Set event handler after the initialization,
  //  to avoid that default selection (elem 0) invoke selchg event
  setTimeout(function () {
      that.mLimTarg.addSelChanged(function(aEvent) {
	  try { that.validateWidgets(aEvent);}
	  catch (e) { debug.exception(e); }
	});
    }, 0);
};

ContourPropEdit.prototype.onActivate = function ()
{
  // dd("ContourPropPage> ENTER");
  this.updateWidgets();
};

ContourPropEdit.prototype.onInactivate = function ()
{
  // dd("ContourPropPage> LEAVE");
  // MacOS UI requires to validate widgets here,
  // since the change event is not fired on the tabsel change or closing the dialog
  this.validateWidgets();
};

/// Intrn-data --> widget
ContourPropEdit.prototype.updateWidgets = function ()
{
  var elem;

  elem = gMain.findPropData("width");
  this.mWidth.value = elem.value;

  elem = gMain.findPropData("bufsize");
  this.mBufSize.value = elem.value;

  elem = gMain.findPropData("use_pbc");
  this.mUsePBC.checked = elem.value;

  elem = gMain.findPropData("autoupdate");
  var value;
  if (elem.value) {
    elem = gMain.findPropData("dragupdate");
    if (elem.value)
      value = "drag";
    else
      value = "auto";
  }
  else {
    value = "none";
  }
  util.selectMenuListByValue(this.mUpdate, value);

  elem = gMain.findPropData("bndry_molname");
  if (elem.value) {
    this.mLimTarg.selectObjectByName(elem.value);
    this.mMapLim.checked = true;
  }
  else {
    this.mMapLim.checked = false;
  }

  elem = gMain.findPropData("bndry_sel");
  var selstr = elem.value;

  this.mLimSel.origSel = selstr;
  this.mLimSel.buildBox();

  elem = gMain.findPropData("bndry_rng");
  this.mLimRng.value = elem.value;

  this.updateDisabledState();
};

/// Widget --> Intrn-data
ContourPropEdit.prototype.validateWidgets = function (aEvent)
{
  var new_val;
  //var tgt_id = null;
  //if (aEvent)
  //tgt_id = aEvent.currentTarget.id;

  new_val = this.mUpdate.value;
  dd("Validate> Update="+new_val);
  if (new_val=="auto") {
    gMain.updateData("autoupdate", true);
    gMain.updateData("dragupdate", false);
  }
  else if (new_val=="drag") {
    gMain.updateData("autoupdate", true);
    gMain.updateData("dragupdate", true);
  }
  else {
    gMain.updateData("autoupdate", false);
    gMain.updateData("dragupdate", false);
  }

  new_val = parseFloat(this.mWidth.value);
  if (isNaN(new_val) || new_val<=0.0)
    return;
  gMain.updateData("width", new_val);

  new_val = parseInt(this.mBufSize.value);
  if (isNaN(new_val))
    return;
  if (new_val<=50) {
    cuemol.putLogMsg("Too small ("+new_val+") bufsize is truncated to 50");
    new_val = 50;
  }
  else if (new_val>200) {
    cuemol.putLogMsg("Too large ("+new_val+") bufsize is truncated to 200");
    new_val = 200;
  }
  gMain.updateData("bufsize", new_val);

  gMain.updateData("use_pbc", this.mUsePBC.checked);

  var bMapLim = this.mMapLim.checked;
  dd("Validate> MapLim = "+bMapLim);
  this.updateDisabledState();
  if (!bMapLim) {
    gMain.updateData("bndry_molname", "");
    gMain.updateData("bndry_sel", "");
  }
  else {
    new_val = this.mLimTarg.getSelectedObj();
    gMain.updateData("bndry_molname", new_val.name);

    new_val = this.mLimSel.selectedSel;
    gMain.updateData("bndry_sel", new_val.toString());
    this.mLimSel.addHistorySel();

    new_val = parseFloat(this.mLimRng.value);
    if (isNaN(new_val) || new_val<=0.0)
      return;
    gMain.updateData("bndry_rng", new_val);

  }

  //elem = gMain.findPropData("bndry_molname");
  //dd("Validate>> BndryMolname = "+elem.value);
};

ContourPropEdit.prototype.updateDisabledState = function ()
{
  if (this.mMapLim.checked) {
    if (this.mLimTarg._widget)
      this.mLimTarg._widget.disabled = false;
    this.mLimSel.disabled = false;
    this.mLimRng.disabled = false;
  }
  else {
    if (this.mLimTarg._widget)
      this.mLimTarg._widget.disabled = true;
    this.mLimSel.disabled = true;
    this.mLimRng.disabled = true;
  }
};

return new ContourPropEdit();

} catch (e) {debug.exception(e)}
} ) ();

gMain.registerPage("contour-tab", gMapMesh);

