// -*-Mode: C++;-*-
//
// sidepanelholder.js:  sidepanel management class
//
// $Id: sidepanelholder.js,v 1.18 2011/03/04 17:12:03 rishitani Exp $
//

if (!("SidePanelHolder" in cuemolui)) {

cuemolui.SidePanelHolder = ( function()
{

const SIDEPANEL_DROP_TYPE = 'application/x-ptb-tabdrag'

// private
var _outer = null;

// private
var _storage = require("simple-storage");

// panel definitions
var _defs = new Object();

// panel data for the current panel arrangement
var _data = new Array();

// default panel arrangement data
var _defaultData = new Array();
  
// private
var _root = null;

// unique instance of the SidePanelHolder
var _self = null;

/////////////////////////////////////

// private
var PanelObj = function() {
  this.id = "";
  this.hidden = false;
  this.collapsed = false;
  this.width = 0;
  this.height = 0;
}

// perform deep copy of aObj
PanelObj.prototype.copyFrom = function(aObj) {

  if ('id' in aObj)
    this.id = aObj.id;
    
  if ('hidden' in aObj)
    this.hidden = aObj.hidden;
  
  if ('collapsed' in aObj)
    this.collapsed = aObj.collapsed;
  
  if ('width' in aObj)
    this.width = aObj.width;
  
  if ('height' in aObj)
    this.height = aObj.height;

}

// private
/// Populate _data member from storage data
function _populateData(aStor)
{
  dd("===== SidePane._populateData =====");

  if (!('length' in aStor))
    return;

  var map = new Object();
  for (var nm in _defs) {
    map[nm] = false;
  }

  var i, j;
  var len1 = aStor.length;
  var panel;

  // reinitialize _data array
  _data = new Array();

  // Carefully copy the deserialized obj tree from the storage,
  // to avoid contaminating with invalid data from json file.
  for (i=0; i<len1; ++i) {
    var src_panel = aStor[i];

    dd("Populate panel from storage: "+i+", id="+src_panel.id);

    if (src_panel.id in _defs) {
      panel = new PanelObj();
      panel.copyFrom(src_panel);
      _data.push(panel);
      map[src_panel.id] = true;
    }
    else {
      dd("WARN: Panel id=["+src_panel.id+"] is in storage but not defined in the code--> ignore");
      // map[src_panel.id] = false;
      // skip
    }
  }

  // Make new panel from the definition data
  for (var nm in _defs) {
    if (!map[nm]) {
      dd("New panel is added to the last, id="+nm);
      panel = new PanelObj();
      panel.copyFrom(_defs[nm]);
      _data.push(panel);
    }
  }

  // dd("Built panels:");
  // dd(debug.dumpObjectTree(_data, 10, false, 0));
}

/////////////////////////////////////
  
// constructor
var ctor = function (aOuter)
{
  _self = this;
  _outer = aOuter;
  _data = new Array();
  _root = document.getAnonymousElementByAttribute(_outer, "anonid", "panel-container");
}

// public
ctor.prototype.saveSession =
function _saveSession(aName)
{
  var nm = aName+"_panels_data";

  const nlen = _data.length;
  var value;

  for (var i=0; i<nlen; ++i) {
    if (_data[i].domobj) {
      value = _data[i].domobj.getAttribute("width");
      if (value>0)
        _data[i].width = value;

      value = _data[i].domobj.getAttribute("height");
      if (value>0)
        _data[i].height = value;
    }
  }

  _storage.storage[nm] = _data;
}

// public
// Load session from storage
ctor.prototype.loadSession = function (aName)
{
  try {

    var nm = aName+"_panels_data";

    if (_storage.storage[nm]) {
      // destroy old data
      if (_data.length>0)
        _data = new Array();
      _populateData(_storage.storage[nm]);

      return true;
    }

    // cannot find the session in the storage
    return false;
  }
  catch (e) {
    debug.exception(e);
  }

  // this.realize();
  return false;
}

// public
/// Restore default panel arrangement
ctor.prototype.restoreDefault = function _restoreDefault(aName)
{
  // copy data from the default data defined at registerPanel
  var nlen = _defaultData.length;
  for (var i=0; i<nlen; ++i) {
    _data[i] = new Object();
    for (var p in _defaultData[i])
      _data[i][p] = _defaultData[i][p];
    
  }
}

// public
// clean-up all internal data
ctor.prototype.clearAllData =
function _clearAllData()
{
  _data = new Array();
  _defs = new Object();
}

// public
ctor.prototype.registerPanel = function _registerPanel(aDef)
{
  // dd("registerPanel: "+aDef);

  _defs[aDef.id] = aDef;

  var res, panel, pal;

  // check if the panel is already registered in _data
  if (res = this.findPanel(aDef.id)) {
    // already registered
    dd("Fatal error: the same panel id="+aDef.id+" is already registered!!");
    return;
  }

  panel = new PanelObj();
  panel.copyFrom(aDef);
  panel.id = aDef.id;

  // append to the (default) panel data
  _defaultData.push(panel);

  // setup DOM related entries
  var domobj = document.getElementById(panel.id);
  // dd("RegisterPanel, setupDOM "+panel.id+" DOM obj "+domobj);
  aDef.domobj = domobj;
  if (!("originalParent" in aDef))
    aDef.originalParent = domobj.parentNode;

  // Initially, not shown.
  aDef.shown = false;

  // Call init method, if defined.
  if ("init" in aDef && typeof aDef.init == "function") {
    try {
      aDef.init();
    } catch (e) {
      debug.exception(e);
    }
  }
}

// public
ctor.prototype.registerPanels =
function _registerPanels(panels)
{
  for (var id in panels)
    this.registerPanel(panels[id]);
}

// public
ctor.prototype.getDef = function _getDef(id)
{
  return _defs[id];
}

// public
ctor.prototype.findPanelIndex = function _findPanelIndex(aId)
{
  if (!aId) return -1;
  
  var i, rval = null;
  const len = _data.length;

  for (i=0; i<len; ++i) {
    if (!('id' in _data[i])) return -1;
    if (_data[i].id==aId) {
      return i;
    }
  }

  return -1;
}

// public
ctor.prototype.findPanel = function _findPanel(aId)
{
  if (!aId) return null;
  
  var i, rval = null;
  const len = _data.length;

  for (i=0; i<len; ++i) {
    if (!('id' in _data[i])) return null;
    if (_data[i].id==aId) {
      rval = _data[i];
      break;
    }
  }

  // dd("findPanel: id="+aId+" result="+rval);
  return rval;
}

ctor.prototype.isAllOthersClosed = function (ind)
{
  var i;
  const len = _data.length;

  for (i=0; i<len; ++i) {
    if (i==ind) continue;
    if (!_data[i].hidden)
      return false;
  }

  return true;
}

/////////////////
// view operations

// public
/// Realize the panel arrangement in the _data object
ctor.prototype.realize = function _realize()
{
  dd("===== sidepanelholder realize start =====");
  try {

    const leni = _data.length;

    // close all palettes/panels
    for (var i=0; i<leni; ++i)
      this.closePanel(_data[i]);
    while (_root.lastChild)
      _root.removeChild(_root.lastChild);

    // make panels
    // put top indicator
    _root.appendChild(_createSplitter(false));
    var bspl = false;
    var nshown = 0;
    var panel;
    for (var i=0; i<leni; ++i) {
      panel = _data[i];
      dd("realizePanel: "+i+", "+panel.id);
      this._updateCommand(_defs[panel.id], panel.hidden);

      if (panel.hidden)
        continue;

      _realizePanel(panel, bspl, null);
      bspl = true;
      ++nshown;
    }
    // put bottom indicator
    _root.appendChild(_createSplitter(false));

    if (nshown==0) {
      // no panel is shown --> collapse the sidepanelholder
      _outer.collapsed = true;
    }
    else if (_outer.collapsed) {
      // panel is shown, but outer is collapsed --> uncollapse the outer
      _outer.collapsed = false;
    }

  } catch (e) {
    debug.exception(e);
  }
  dd("===== sidepanelholder realize end =====");
}

// private
// realizePanel, show the panel (aPanel),
// by moving from the hidden location to the specified position
var _realizePanel = function (aPanel, bInsSpl, aInsBefore)
{
  if (aPanel.hidden) return;

  // reinitialize domobj & origParent from definition data
  var paldef = _defs[aPanel.id];
  aPanel.domobj = paldef.domobj;
  aPanel.originalParent = paldef.originalParent;

  // dd("realize: create panel id="+aPanel.id);

  // create splitter, if the adding element is not a first one.
  if (bInsSpl)
    _root.insertBefore(_createSplitter(true), aInsBefore);
  //dd("Panel "+aPanel.id+", domobj="+aPanel.domobj.getAttribute("title"));
  var title = aPanel.domobj.getAttribute("title");

  // create the bar (with dragbar, collapse and close buttons)
  var panelbar = _createPanelBar(aPanel.id, title, aInsBefore);
  
  //
  // Move the panel to the specified position
  //
  dd("Panel Realize id="+aPanel.id);
  dd("     collapsed="+aPanel.collapsed);
  dd("     width="+aPanel.width);
  dd("     height="+aPanel.height);

  var panel = aPanel.domobj;

  if (aPanel.collapsed) {
    panel.setAttribute("collapsed", "true");
    panelbar.setAttribute("panelstate", "collapsed");
  }
  else {
    panel.removeAttribute("collapsed");
    panelbar.removeAttribute("panelstate");
  }

  if ("width" in aPanel && aPanel.width>0)
    panel.setAttribute("width", aPanel.width);
  if ("height" in aPanel && aPanel.height>0)
    panel.setAttribute("height", aPanel.height);

  _root.insertBefore(panel, aInsBefore);

  paldef.shown = true;

  // Notify panel-shown event
  if ("onPanelShown" in paldef && typeof paldef.onPanelShown == "function") {
    try {
      paldef.onPanelShown();
    } catch (e) {
      debug.exception(e);
    }
  }
}

// private
var _createSplitter = function(bShow)
{
  var splitter = document.createElement("box");

  if (bShow) {
    splitter.setAttribute ("class", "sidepanel-splitter");
    splitter.setAttribute ("resizeafter", "flex");
    splitter.setAttribute ("resizebefore", "flex");
  }
  else {
    splitter.setAttribute ("class", "sidepanel-indicator");
    //splitter.setAttribute ("state", "on");
  }

  return splitter;
}

var _createPanelBar = function(id, title, aInsBefore)
{
  var panelbar = document.createElement("sidepanelbar");
  panelbar.setAttribute ("title", title);
  panelbar.setAttribute ("target", id);
  panelbar.setAttribute ("flex", "0");
  _root.insertBefore(panelbar, aInsBefore);

  panelbar.setBarImpl(_self);

  return panelbar;
}

/////////////////

// private
/// Check consistency between _data and DOM elements
//  for debug.
ctor.prototype._chkPanelData = function ()
{
  const nlen = _data.length;
  var value;

  // childNode index (of _root DOM element)
  var ch_ind = 0;

  // skip top hidden drag indicator
  ch_ind++;

  for (var i=0; i<nlen; ++i) {
    var id = _data[i].id;
    if (_data[i].hidden) {
      continue;
    }

    var elem = _root.childNodes[ch_ind+1];
    if (id!=elem.id) {
      dd("--------------------");
      dd(" Panel no. "+i);
      dd(" DATA ID="+id);
      dd("   ELEM ID="+elem.id+", TAG="+elem.localName);
      dd("   *** INCONSISTENT BETWEEN DATA AND DOM!!! ***");
    }
    ch_ind+=3;
  }
}

// public
/// move panel targInd to beforeInd
ctor.prototype.movePanel = function (targInd, beforeInd)
{
  var nlen = _data.length;
  var bAppend = false;
  if (beforeInd>=nlen)
    bAppend = true; // move to the last

  //
  // get target obj
  //
  var targ_data = _data[targInd];
  var targ_dom = targ_data.domobj;
  var targ_bar = targ_dom.previousSibling;
  var targ_spl = null;
  if (targInd>0)
    targ_spl = targ_bar.previousSibling;
  else
    targ_spl = targ_dom.nextSibling;

  //
  // get before domobj
  //
  var before = null, beforeDom;
  if (bAppend) {
    // move to the last (before the bottom indicator)
    beforeDom = _root.lastChild;
  }
  else {
    before = _data[beforeInd];
    beforeDom = before.domobj.previousSibling;
  }

  //
  // _data reorganization
  //

  // dd(debug.dumpObjectTree(_data,1,1,1));
  dd("MovePanel> targ index="+targInd+", before index="+beforeInd);
  if (beforeInd<_data.length)
    dd("MovePanel> targ ID="+_data[targInd].id+", before ID="+_data[beforeInd].id);
  // remove from _data
  _data.splice(targInd, 1);
  // insert to _data
  if (bAppend) {
    // append to the last
    dd("MovePanel> append");
    _data.push(targ_data);
  }
  else  {
    if (targInd<beforeInd) {
      // ATTN: beforeInd shift by 1 after split() call
      --beforeInd;
    }
    dd("MovePanel> insertBefore, before id=" + _data[beforeInd].id);
    // insert before the beforeInd
    _data.splice(beforeInd, 0, targ_data);
  }
  
  // dd(debug.dumpObjectTree(_data,1,1,1));

  //
  // DOM obj reorganization
  //
  // dd("insert before="+before);

  if (bAppend) {
    // Append to the last (i.e. insert before the bottom indicator
    _root.insertBefore(targ_spl, beforeDom);
    _root.insertBefore(targ_bar, beforeDom);
    _root.insertBefore(targ_dom, beforeDom);
  }
  else {
    _root.insertBefore(targ_bar, beforeDom);
    _root.insertBefore(targ_dom, beforeDom);
    _root.insertBefore(targ_spl, beforeDom);
  }

  // Notify panel-moved event
  var paldef = this.getDef(targ_data.id);
  if ("onPanelMoved" in paldef && typeof paldef.onPanelMoved == "function") {
    try {
      paldef.onPanelMoved();
    } catch (e) {
      debug.exception(e);
    }
  }

  this._chkPanelData();
  // dd(require("debug_util").dumpObjectTree(_data, 1));
}

ctor.prototype.closePanel = function (ind)
{
  var panel = _data[ind];
  if (!panel || !panel.domobj || !panel.originalParent)
    return;
  if (panel.hidden)
    return; // ==> Already closed.

  var bOnly = this.isAllOthersClosed(ind);

  dd("SidePanel> close panel: "+ind);
  dd("SidePanel>      domobj: "+panel.domobj);
  var dom_obj = panel.domobj;

  // remove panelbar
  _root.removeChild(dom_obj.previousSibling);

  if (!bOnly) {
    // remove splitter
    if (_root.childNodes[0]==dom_obj.previousSibling)
      _root.removeChild(dom_obj.nextSibling);
    else
      _root.removeChild(dom_obj.previousSibling);
  }
  
  panel.originalParent.appendChild(dom_obj);
  // panel.hidden = true;

  var paldef = this.getDef(panel.id);
  paldef.shown = false;

  // Notify panel closed
  if ("onPanelClosed" in paldef && typeof paldef.onPanelClosed == "function") {
    try {
      paldef.onPanelClosed();
    } catch (e) {
      debug.exception(e);
    }
  }

  // this is the last panel --> collapse sidepanelholder
  if (bOnly)
    _outer.collapsed = true;

  // We cannot check data-dom consistency,
  // since the data's hidden flag isn't still updated.
}

ctor.prototype.showPanel = function _showPanel(ind)
{
  var panel = _data[ind];
  if (!panel)
    return;
  
  var bOnly = this.isAllOthersClosed(ind);

  // this is the first panel --> uncollapse sidepanelholder
  if (bOnly)
    _outer.collapsed = false;

  const leni = _data.length;

  // childNode index (of _root DOM element)
  var ch_ind = 0;

  // skip top splitter (hidden)
  ch_ind++;
  var bspl = false;

  // find insertion point
  for (var i=0; i<ind; ++i) {
    //dd("XXX: "+ch_ind+", ind="+i+", ID="+_data[i].id);
    if (_data[i].hidden)
      continue; // --> skip hidden panel
    if (bspl)
      ++ch_ind;
    ch_ind+=2;
    bspl = true;
  }

  // ch_ind is insertion point
  var insBefore = _root.childNodes[ch_ind];
  if (bOnly) {
    // There is only one visible panel (i.e. currently showing)
    // --> no splitter is required
    _realizePanel(_data[i], false, insBefore);
  }
  else {
    // Splitter is also added, depending on the panel's insertion point
    _realizePanel(_data[i], bspl, insBefore);
    if (!bspl)
      _root.insertBefore(_createSplitter(true), insBefore);
  }

  // We don't have to notify event (showpanel) here,
  // since _realize already notified it.

  this._chkPanelData();
}

/////////////////

// private
/// Collapse/Expand panel (implementation)
ctor.prototype._collapsePanel = function(aPanel, aCollapse)
{
  aPanel.collapsed = aCollapse;
  aPanel.domobj.collapsed = aCollapse;

  // Update titlebat collapse/expand button
  var bar = aPanel.domobj.previousSibling;
  if (bar) {
    if (aCollapse)
      bar.setAttribute("panelstate", "collapsed");
    else
      bar.removeAttribute("panelstate");
  }
}

ctor.prototype.onClickCollapse = function(aId)
{
  var panel = this.findPanel(aId);
  if (!panel)
    return;

  //dd("onClickCollapse called "+panel);
  //dd("onClickCollapse called "+panel.domobj);
  this._collapsePanel(panel, !panel.collapsed);
}

ctor.prototype.onTitleDblClick = function(aId)
{
  var panel = this.findPanel(aId);
  if (!panel)
    return;

  if (panel.hidden)
    return;

  const nlen = _data.length;
  var value;

  for (var i=0; i<nlen; ++i) {
    var dat = _data[i];
    if (dat.hidden)
      continue;
    if (dat.id==aId) {
      if (dat.collapsed)
        this._collapsePanel(dat, false);
    }
    else {
      if (!dat.collapsed)
        this._collapsePanel(dat, true);
    }
  }
}


ctor.prototype.onClickClose = function(aId)
{
  var ind = this.findPanelIndex(aId);
  var panel = _data[ind];
  if (!panel)
    return;

  // dd("onClickClose called");

  this.closePanel(ind);
  panel.hidden = true;

  this._chkPanelData();

  this._updateCommand(_defs[aId], panel.hidden);
}

ctor.prototype.onToggle = function(aId)
{
  var ind = this.findPanelIndex(aId);
  var panel = _data[ind];
  if (!panel)
    return;

  if (panel.hidden) {
    panel.hidden = false;
    this.showPanel(ind);
  }
  else {
    this.closePanel(ind);
    panel.hidden = true;
  }

  this._chkPanelData();

  this._updateCommand(_defs[aId], panel.hidden);
}

ctor.prototype._updateCommand = function(aDef, aHidden)
{
  //dd("update checked: "+debug.dumpObjectTree(aDef));
  dd("update checked: "+aDef.id);
  var cmd = null;
  if (!("command" in aDef)) {
    if ("command_id" in aDef) {
      aDef.command = document.getElementById(aDef.command_id);
      if (aDef.command===null || aDef.command===undefined) {
        dd("ERROR!! update check failed: "+aDef.id + ", command_id is undefined");
        return;
      }
    }
    else {
      dd("ERROR!! update check failed: "+aDef.id + ", command is undefined");
      return;
    }
  }
  

  aDef.command.setAttribute("checked", !aHidden);
  // alert("update for "+aDef.id+" checked="+aDef.command.getAttribute("checked"));
}

///////////////////////////////////////////////////
// Drag and drop of the panel
var _dragdata_ind;
var _dragdata_sind;

ctor.prototype.onDragStart = function(event, id)
{
  //dd("DragStartCalled");
  var index = this.findPanelIndex(id);
  if (index<0) return;
  if (this.isAllOthersClosed(index)) return;

  event.dataTransfer.setData(SIDEPANEL_DROP_TYPE, index);
  event.dataTransfer.effectAllowed = "move";

  _dragdata_ind = index;
  _dragdata_sind = _makeInsLocData(index);
}

//////////

var _root_y;
// var _root_x;
var _drag_bndry;
var _shown_map;

var _makeInsLocData = function (index)
{
  var rect = _root.getBoundingClientRect();
  _root_y = rect.top;

  var i, nchild = _root.childNodes.length;
  var y = 0, prev_y=0;
  var ary = new Array();
  for (i=0; i<nchild; ++i) {
    var elem = _root.childNodes[i];
    var rect = elem.getBoundingClientRect();
    y += rect.height;
    //dd("child "+i+" x="+rect.left+", y="+rect.top+" w="+rect.width+", h="+rect.height);
    var id = elem.getAttribute("class");
    if (id=="sidepanel-splitter") {
      ary.push((y+prev_y)/2);
      prev_y = y;
    }
  }
  ary.push((y+prev_y)/2);

  //dd("y list: "+ary.join(", "));
  _drag_bndry = ary;

  var rval;
  _shown_map = Array();
  nchild = _data.length;
  for (i=0; i<nchild; ++i) {
    if (_data[i].hidden)
      continue;
    if (i==index)
      rval = _shown_map.length;
    _shown_map.push(i);
  }
  //dd("shown map: "+_shown_map.join(", "));
  return rval;
}

var _queryInsLoc = function (yy)
{
  var y = yy - _root_y;

  var low_y=0;
  var i, nlen = _drag_bndry.length;
  for (i=0; i<nlen; ++i) {
    if (low_y<=y && y<_drag_bndry[i])
      break;
    low_y = _drag_bndry[i];
  }

  return i;
  // return _shown_map[i];
}

var _clearAllState = function ()
{
  var i, nchild = _root.childNodes.length;
  for (i=0; i<nchild; ++i) {
    var elem = _root.childNodes[i];
    elem.removeAttribute("state");
  }
}

var _hiliteInsLoc = function (sind)
{
  var nlen = _data.length;
  //dd("hilite loc: "+sind);

  if (sind>=_shown_map.length) {
    _root.lastChild.setAttribute("state", "on");
  }
  else {
    var dat = _data[_shown_map[sind]];
    if (dat.domobj.previousSibling && dat.domobj.previousSibling.previousSibling) {
      dat.domobj.previousSibling.previousSibling.setAttribute("state", "on");
    }
  }
}

ctor.prototype.onDragOver = function(event)
{
  //dd("  event.clientX="+event.clientX);
  //dd("  event.clientY="+event.clientY);
  //var elem = document.elementFromPoint(event.clientX, event.clientY);
  //dd("element: "+elem.localName+" id="+elem.getAttribute("id"));
  var ins = _queryInsLoc(event.clientY);
  if (parseInt(event.dataTransfer.getData(SIDEPANEL_DROP_TYPE))!==_dragdata_ind)
    return;
  var srcind = _dragdata_sind;
  //dd("drag target: "+ins+" srcind: "+srcind);

  _clearAllState();

  if (ins==srcind || ins==srcind+1) 
    return;
  
  _hiliteInsLoc(ins);

  event.preventDefault();
  event.stopPropagation();
}

ctor.prototype.onDragLeave = function(event)
{
  _clearAllState();
}

ctor.prototype.onDrop = function(event)
{
  var ins = _queryInsLoc(event.clientY);
  if (parseInt(event.dataTransfer.getData(SIDEPANEL_DROP_TYPE))!==_dragdata_ind)
    return;
  var srcind = _dragdata_sind;

  _clearAllState();

  if (ins==srcind || ins==srcind+1) 
    return;

  var nlen = _shown_map.length;
  if ( srcind>=nlen || srcind<0 )
    return;
  if (ins<0 )
    return;

  if ( ins>=nlen )
    this.movePanel(_shown_map[srcind], _data.length);
  else
    this.movePanel(_shown_map[srcind], _shown_map[ins]);

  event.preventDefault();
  _dragdata_ind = _dragdata_sind = null;
}


return ctor;

} )();

}

