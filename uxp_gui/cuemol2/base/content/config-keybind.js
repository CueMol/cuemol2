//
// Keybinding configuration impl
// $Id: config-keybind.js,v 1.4 2011/02/13 15:59:35 rishitani Exp $
//

window.gKeybindPane = new Object();

( function () {

var uitarg = window.arguments[0];
var utils = require("util");

var that = this;

//addEventListener("load", function() {
//  try { that.init(); } catch (e) { debug.exception(e); }
//}, false);

addEventListener("unload", function() {that.fini();}, false);

addEventListener("dialogaccept", function() {
  try { that.onDialogAccept(); } catch (e) { debug.exception(e); }
}, false);
//addEventListener("dialogaccept", function() {alert("XXXXX");}, false);


this.mTreeView = new cuemolui.TreeView(window, "keybind-tree");
//this.mTreeView.clickHandler = function (ev, row, col) {
//  try { that.onTreeItemClick(ev, row, col); } catch (e) { debug.exception(e); }
//}

this.init = function ()
{
  try { 
    //alert("shortcut mgr: "+uitarg.shortcut);

    // onload is not called by event
    this.mTreeView._onLoad();

    this.mTreeView._tree.addEventListener("select",
                                          function (event) {
                                            try { that.onTreeItemSelect(); }
                                            catch (e) { debug.exception(e); }},
                                          false);
    this.mNameText = document.getElementById("keybind-name");
    this.mKeyList = document.getElementById("keybind-keylist");
    this.mKeyCtrl = document.getElementById("keybind-chk-ctrl");
    this.mKeyAlt = document.getElementById("keybind-chk-alt");
    this.mKeyShift = document.getElementById("keybind-chk-shift");

    this.buildTree();

    this.onTreeItemSelect();

#ifdef XP_MACOSX
    // BUG ??: flex is not set correctly, without following delayed setting code.
    setTimeout( function() {  
      var pane = document.getElementById("pane-keybinding");
      pane.setAttribute("flex", "1");
      dd("*** Pane attr flex="+pane.getAttribute("flex"));
    }, 0);
#endif

  } catch (e) { debug.exception(e); }
}

this.fini = function ()
{
}

this.buildTree = function ()
{
  var tab = uitarg.shortcut.mTable;
  var nodes = new Array();

  dd("Build Tree...");
  for (var id in tab) {
    dd("item id="+id);
    var node = new Object();
    node.name = id;
    node.collapsed = false;
    node.values = {
      "shortcut-key": this.keyToString(tab[id]),
      "shortcut-ctrl": this.modifContains(tab[id].modifs, "control"),
      "shortcut-alt": this.modifContains(tab[id].modifs, "alt"),
      "shortcut-shift": this.modifContains(tab[id].modifs, "shift"),
    };
    node.changed = false;
    nodes.push(node);
  }

  this._nodes = nodes;
  this.mTreeView.setData(this._nodes);
  this.mTreeView.buildView();
  this.mTreeView.setSelectedRow(0);
};

this.keyToString = function (aDef)
{
  if (aDef.keyCode)
    return aDef.keyCode;
  else
    return aDef.keyChar;
};

this.modifContains = function (aStr, aKey)
{
  var list = aStr.split(" ");
  return list.some( function (elem) {
    return elem==aKey;
  });
}

this.onTreeItemSelect = function ()
{
  var elem = this.mTreeView.getSelectedNode();
  var id = elem.name;
  var tab = uitarg.shortcut.mTable;
  
  dd("KeyBind> onTreeItemSel: "+id);

  if (! (id in tab) )
    return;

  var def = tab[id];
  this.mNameText.value = def.id;
  //this.mKeyList.value = def
  utils.selectMenuListByValue(this.mKeyList, elem.values["shortcut-key"]);
  this.mKeyCtrl.checked = elem.values["shortcut-ctrl"];
  this.mKeyAlt.checked = elem.values["shortcut-alt"];
  this.mKeyShift.checked = elem.values["shortcut-shift"];
}

/// Widget --> Intrn-data
this.validateWidget = function (aEvent)
{
  var id = aEvent.currentTarget.id;
  dd("KeyBind> validateWidget: "+id);

  var elem = this.mTreeView.getSelectedNode();
  if (elem===null||elem===undefined) return;

  switch (id) {
  case "keybind-keylist":
    elem.values["shortcut-key"] = aEvent.target.value;
    break;
  case "keybind-chk-ctrl":
    elem.values["shortcut-ctrl"] = aEvent.target.checked;
    break;
  case "keybind-chk-alt":
    elem.values["shortcut-alt"] = aEvent.target.checked;
    break;
  case "keybind-chk-shift":
    elem.values["shortcut-shift"] = aEvent.target.checked;
    break;
  }

  elem.changed = true;
  this.mTreeView.updateNode( function(aElem) {
    return (aElem.name==elem.name)?true:false;
  } );

}

this.encodeModif = function (aElem)
{
  var rval = new Array();
  if (aElem.values["shortcut-ctrl"])
    rval.push("control");
  if (aElem.values["shortcut-alt"])
    rval.push("alt");
  if (aElem.values["shortcut-shift"])
    rval.push("shift");

  return rval.join(" ");
};

this.onDialogAccept = function ()
{
  var nsize = this._nodes.length;
  var bChanged = false;
  for (var i=0; i<nsize; ++i) {
    var elem = this._nodes[i];
    if (!elem.changed)
      continue;

    var modif = this.encodeModif(elem);

    uitarg.shortcut.changeBinding(elem.name, elem.values["shortcut-key"], modif);
    bChanged = true;
    
    //alert("KeyBind> binding changed: "+elem.name+
    //", key="+elem.values["shortcut-key"]+
    //", modif="+modif);
  }

  if (bChanged)
    uitarg.shortcut.invalidateCache();
};

}.apply(window.gKeybindPane) );

