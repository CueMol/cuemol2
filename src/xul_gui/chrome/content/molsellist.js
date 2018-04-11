//
// $Id: molsellist.js,v 1.6 2011/04/03 11:11:06 rishitani Exp $
//

////////////////////////////////
// define class MolSelList

if (!("MolSelList" in cuemolui)) {

cuemolui.MolSelList = ( function () {

/// constructor
var MolSelList = function (aOuter)
{
  this._outer = aOuter;
}

var cls = MolSelList.prototype;

cls.init = function ()
{
  try {
    var that = this;
    var elem = this._outer.mSelBox;

    elem.addEventListener(
      "select",
      function(event){try{that.onMListSelected(event)}catch(e){ debug.exception(e) }},
      false);

    elem.inputField.addEventListener(
      "change",
      function(event){try{that.onTBoxChange(event);}catch(e){debug.exception(e);}},
      false);

    elem.inputField.addEventListener(
      "select",
      function(event){try{that.onTboxSelected(event);}catch(e){debug.exception(e);}},
      false);

/*
    dd("MolSel.init> menupopup = "+elem.menupopup);
    elem.menupopup.addEventListener(
      "select",
      function(event){try{that.onPopupShowing(event);}catch(e){debug.exception(e);}},
      false);
    elem.menupopup.addEventListener(
      "popuphiding",
      function(event){try{that.onPopupHiding(event);}catch(e){debug.exception(e);}},
      false);
*/
    this.targetSceID = null;
    this.targetObjID = null;

    this.mOrigSel = null;
    this.mSelectedSel = null;

    this.mCurSelIndex = -1;
  }
  catch (e) { debug.exception(e); }
};

cls.setOrigSel = function (aVal)
{
    if (typeof aVal == 'string')
      this.mOrigSel = cuemol.makeSel(aVal, this.targetSceID);
    else
      this.mOrigSel = aVal;
    return aVal;
};

cls.buildBox = function (aResvSel)
{
  dd("MolSel.buildBox> enter, aResvSel="+aResvSel);
  var stylem = cuemol.getService("StyleManager");
  var element = this._outer.mSelBox;
  
  var initselval = null;
  if (aResvSel && element.selectedItem) {
    dd("MolSel.buildBox> Old selected item: "+element.selectedItem.label);
    initselval = element.selectedItem.value;
  }

  ///////////////////////////////
  // start menulist building

  // Remove all items in the menulist.
  // dd("MolSel.buildBox> removeAllItems()");
  element.removeAllItems();
  
  // Create the history list
  let his = require("util").selHistory;
  let nitems = his.getLength();
  let hislist = new Array();
  for (let i=0; i<nitems; ++i) {
    let val = his.getEntry(i);
    if (val=="*"||val=="none"||val=="")
      continue; // Exclude*/none/(empty) from history list
    hislist.push(val);
  }

  // Append the original selection
  dd("MolSel.buildBox> orig sel: <"+this.mOrigSel+">");
  if (this.mOrigSel) {
    let origsel_str = this.mOrigSel.toString();
    if (!hislist.find(function (elem) {
      return elem == origsel_str;
    })) {
      this.appendMenuItem(element, this.mOrigSel.toString(), this.mOrigSel.toString());
      this.appendSeparator(element);
    }
    // set origSel as the initial selection
    if (initselval==null)
      initselval = origsel_str;
  }
  
  var sce_id = null;
  
  // Append the Object's current selection
  if (this.targetObjID) {
    var obj = cuemol.getObject(this.targetObjID);
    sce_id = obj.scene_uid;
    // Also update scene ID
    if (this.targetSceID==null)
      this.targetSceID = sce_id;
    if ("sel" in obj) {
      var selstr = obj.sel.toString();
      if (selstr.length>0) {
	this.appendMenuItem(element, "current ("+selstr+")", selstr);
        if (initselval==null)
          initselval=selstr;
      }
    }
  }
  else if (this.targetSceID) {
    sce_id = this.targetSceID;
  }
  
  this.appendMenuItem(element, "all (*)", "*");
  this.appendMenuItem(element, "none", "");
  var prev_sep = this.appendSeparator(element);
  if (initselval==null)
    initselval=""; // init value is not set --> set as "none"
  
  // Selection history
  if (hislist.length>0) {
    for (let i=0; i<hislist.length; ++i) {
      let val = hislist[i];
      this.appendMenuItem(element, val, val);
    }
    prev_sep.setAttribute("label", "History");
    prev_sep = this.appendSeparator(element);
    // if (initselval==null)
    //  initselval=hislist[0];
  }

  // Scene's selection defs
  if (sce_id !== null) {
    var json = stylem.getStrDataDefsJSON("sel", sce_id);
    dd("scene selection defs: "+json);
    if (this.appendSelJSON(element, json)!=0) {
      prev_sep.setAttribute("label", "Scene");
      prev_sep = this.appendSeparator(element);
    }
  }
  
  // global selection defs
  json = stylem.getStrDataDefsJSON("sel", 0);
  if (this.appendSelJSON(element, json)!=0) {
    prev_sep.setAttribute("label", "Global");
  }
  
  ///////////////////////////////
  // setup the initial menulist selection

  this.mCurSelIndex = -1;

  //if (aResvSel && initselval) {
  if (initselval!=null) {
    dd("MolSel.buildBox oldsel="+initselval);
    let nitems = element.menupopup.childNodes.length;
    let i;
    for (i=0; i<nitems; ++i) {
      var item = element.menupopup.childNodes[i];
      if (item && item.value == initselval) {
        dd("=== BuildBox oldsel is selected"+item.label);
        element.selectedIndex = i;
        break;
      }
    }
    if (i==nitems)
      element.selectedIndex = 0;
  }
  else {
    element.selectedIndex = 0;
  }
};

cls.appendMenuItem = function (aElem, aLabel, aValue)
{
  var label = aLabel;
  if (aLabel.length>32) {
    label = aLabel.substr(0, 32) + "...";
  }
  aElem.appendItem(label, aValue);
};

cls.appendSeparator = function (aElem, aLabel)
{
  var item = document.createElement("menuseparator");
  if (aLabel)
    item.setAttribute("label", aLabel);
  aElem.menupopup.insertBefore(item, null);
  return item;
};

cls.appendSelJSON = function (aElem, aJson)
{
  var nappend = 0;
  var that = this;
  try {
    var seldefs = JSON.parse(aJson);
    seldefs.forEach(function (em) {
      that.appendMenuItem(aElem, em, em);
      ++nappend;
    }, this);
  }
  catch (e) {
    dd("error : "+aJson);
    debug.exception(e);
  }
  return nappend;
};

cls.updateCurrentSel = function ()
{
  dd("MolSel.updateCurrentSel> "+this.targetObjID);
  this.buildBox(false);
};

/// Menu list selected event
cls.onMListSelected = function (aEvent)
{
  //dd("onMListSelected: "+debug.dumpObjectTree(aEvent));

  var sbox = this._outer.mSelBox;
  if (sbox.selectedItem==null) {
    //dd("onMListSelected: error, selectedItem is NULL!!"+debug.dumpObjectTree(aEvent));
    dd("onMListSelected: error, selectedItem is NULL!!");
    return;
  }
  
  var val = sbox.selectedItem.value;
  var lab = sbox.selectedItem.label;
  var ind = sbox.selectedIndex;
  dd("onMListSelected> index="+ind+", val="+val+", lab="+lab);

  //if (typeof val == 'undefined' || val===null || val.length==0) {
  if (typeof val == 'undefined' || val===null) {
    dd("MolSel ERROR> mSelBox.selectedItem.value is invalid: "+ val);
    return;
  }
  dd("onMListSelected> val="+val);

  var sel = cuemol.makeSel(val, this.targetSceID);
  
  this.mSelectedSel = sel;
  if (this._outer.mSelErrBox)
    this._outer.mSelErrBox.setAttribute("noerr", "yes"); //value = "";

  if (val!==lab) {
    dd("MolSel> InputField changed to: "+val);
    sbox.inputField.value = val;
  }
};

/// Text box selection changed event
cls.onTboxSelected = function (aEvent)
{
  dd("MolselList textbox selection changed");
  // Prevent to further invoke the select event of the menulist
  aEvent.stopPropagation();
};

/// Text box changed event
cls.onTBoxChange = function ()
{
  var val = this._outer.mSelBox.inputField.value;
  var bOK = false;
  
  try {
    var sel = cuemol.makeSel(val, this.targetSceID);
    if (sel) {
      this.mSelectedSel = sel;
      bOK = true;
    }
  }
  catch (e) {
    dd("exception: "+e);
    debug.exception(e);
  }
  
  //window.alert("SelBoxChange:"+bOK);
  //dd("***** this._outer.mSelBox: "+this._outer.mSelBox);
  //dd("***** this._outer.mSelErrBox: "+this._outer.mSelErrBox);
  
  var error_box = this._outer.mSelErrBox;
  if (error_box===null || error_box===undefined) {
    dd("molsellist> Warning: No error box is defined");
    return;
  }

  if (bOK)
    error_box.setAttribute("noerr", "yes"); //value = "";
  else {
    error_box.removeAttribute("noerr"); //value = "Error in the selection code!!";
    this.mSelectedSel = null;
    // window.alert(this._outer.mSelErrBox.value);
  }
};

/// Implementation of Getter for selectedSel 
cls.getSelectedSel = function ()
{
    var sbox = this._outer.mSelBox;
    var listval = null;
    if (sbox.selectedItem)
	listval = sbox.selectedItem.value;
    var tboxval = sbox.inputField.value;
    dd("GetSel> listval="+listval);
    dd("GetSel> tboxval="+tboxval);
    dd("GetSel> sel="+this.mSelectedSel.toString());
    // var cmd = this.mSelectedSel.toString();

    // try textbox value
    try {
	var sel = cuemol.makeSel(tboxval, this.targetSceID);
	if (sel) {
	    this.mSelectedSel = sel;
	    return sel;
	}
    }
    catch (e) {
	dd("exception: "+e);
	debug.exception(e);
    }

    // try menulist value
    try {
	var sel = cuemol.makeSel(listval, this.targetSceID);
	if (sel) {
	    this.mSelectedSel = sel;
	    return sel;
	}
    }
    catch (e) {
	dd("exception: "+e);
	debug.exception(e);
    }

    // return the value of mSelectedSel
    return this.mSelectedSel;
};

cls.addHistorySel = function ()
{
  if (this.mSelectedSel) {
    var cmd = this.mSelectedSel.toString();
    if (cmd)
      util.selHistory.append(cmd);
  }
};

return MolSelList;

})();
}


