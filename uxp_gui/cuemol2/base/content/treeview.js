// -*-Mode: C++;-*-
//
// treeview.js: XUL tree widget utility class
//
// $Id: treeview.js,v 1.12 2011/04/30 09:27:50 rishitani Exp $
//

if (!("TreeView" in cuemolui)) {

cuemolui.TreeView = ( function () {

// constructor
var TreeView = function (win, id)
{
  this._tgtid = id;
  this._tgtwin = win;

  // attach to the load/unload event for the target document/window
  var that = this;
  this._tgtwin.addEventListener("load", function(){that._onLoad();}, false);
  this._tgtwin.addEventListener("unload", function() {that._onUnLoad();}, false);
  this._tree = null;

  this._tvi = new TreeViewImpl(this);

  this.svcAtom=Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);

  this._openStateTable = new Object();

  this.defCtxtMenuId = null;

  this._selSaved = null;

  // custom event handerls (elem click, etc)
  this.clickHandler = null;
  this.twistyClickHandler = null;
  this.canDropHandler = null;
  this.dropHandler = null;
};

/////////////////////////////////////

/// Set the data for tree display
TreeView.prototype.setData = function (aData)
{
  this._data = aData;
};

TreeView.prototype.getData = function ()
{
  return this._data;
};

/////

TreeView.prototype.saveOpenState = function (aId)
{
  // dd("Saved open state");
  var strId = aId.toString();
  var saved = new Object();

  this._saveOpenStateHelper(this._data, saved);
  // dd("Saved open state: "+debug.dumpObjectTree(saved, 1));
  
  this._openStateTable[strId] = saved;
}

TreeView.prototype._saveOpenStateHelper = function (aNodes, aSaveData)
{
  var nlen = aNodes.length;
  for (var i=0; i<nlen; ++i) {
    var node = aNodes[i];
    if (!("childNodes" in node)) continue;
    if (!("obj_id" in node)) continue;
    var id = node.obj_id.toString();
    if ("collapsed" in node)
      aSaveData[id] = node.collapsed;
    else
      aSaveData[id] = false;
    this._saveOpenStateHelper(node.childNodes, aSaveData);
  }
}

/////

TreeView.prototype.restoreOpenState = function (aId)
{
  var strId = aId.toString();
  var saved = this._openStateTable[strId];
  if (!saved || saved.length<=0)
    return;
  this._restoreOpenStateHelper(this._data, saved);
}

TreeView.prototype._restoreOpenStateHelper = function (aNodes, aSaveData)
{
  var nlen = aNodes.length;
  for (var i=0; i<nlen; ++i) {
    var node = aNodes[i];
    if (!("childNodes" in node)) continue;
    if (!("obj_id" in node)) continue;
    var id = node.obj_id.toString();
    if (!(id in aSaveData)) continue;

    node.collapsed = aSaveData[id];
    // dd("RestoreOpenState: id="+id+", collapsed="+node.collapsed);

    this._restoreOpenStateHelper(node.childNodes, aSaveData);
  }
}

/////

TreeView.prototype.clearOpenState = function (aId)
{
  var strId = aId.toString();
  delete this._openStateTable[strId];
}

/// Build tree display from the data
TreeView.prototype.buildView = function ()
{
  // dd("TreeView.buildView() this="+this);
  // dd("TreeView.buildView() this.data="+this._data);

  // Save the first row position in the present view.
  var first = this._tree.treeBoxObject.getFirstVisibleRow();
  // dd("TreeView.buildView> first visible row = "+first);

  // Remove all of the view data
  var nrows = this._tvi.rowCount;
  this._tvi.clearData();
  this._tvi.rowCountChanged(0, -nrows);
  // this._tree.view = null;

  // Rebuild from the content data
  this._buildViewImpl(this._data, 0, -1);
  // this._tree.view = this._tvi;
  nrows = this._tvi.rowCount;
  this._tvi.rowCountChanged(0, nrows);
  this._tvi.invalidate();

  // Restore the first row position, if possible.
  var last = first + this._tree.treeBoxObject.getPageLength();
  if (last>=nrows) {
    this._tree.treeBoxObject.ensureRowIsVisible(nrows-1);
  }
  else {
    this._tree.treeBoxObject.scrollToRow(first);
  }

  // first = this._tree.treeBoxObject.getFirstVisibleRow();
  // dd("TreeView.buildView> ==> first visible row = "+first);
}

TreeView.prototype._buildViewImpl = function (aData, aLevel, aParent)
{
  var i, nlen = aData.length;
  for (i=0; i<nlen; ++i) {
    var node = aData[i];
    var nid = this._tvi.rowCount;

    var elem = new Object();
    elem.name = node.name;
    elem.parent = aParent;
    elem.level = aLevel;
    elem.hasNext = (i<nlen-1);

    if ("values" in node)
      elem.values = node.values;

    if ("props" in node)
      elem.props = node.props;

    if ("notloaded" in node && node.notloaded) {
      elem.collapsed = true;
      elem.notloaded = true;
      this._tvi.append(node, elem);
      continue;
    }

    elem.notloaded = false;
    var bContainer = ("childNodes" in node);
    elem.container = bContainer;

    if ("collapsed" in node)
      elem.collapsed = node.collapsed;
    else
      elem.collapsed = false;

    if (bContainer)
      elem.empty = node.childNodes.length==0;
    else
      elem.empty = true;

    this._tvi.append(node, elem);

    if (bContainer && !elem.collapsed) {
      this._buildViewImpl(node.childNodes, aLevel+1, nid);
    }
  }
}

/// ressign (re-assign) TreeViewImpl to the XUL tree object
TreeView.prototype.ressignTreeView = function ()
{
  if (!this._tree) return; // not initialized
  
  this._tree.view = this._tvi;
  this._tvi.invalidate();
  //dd("treeviewimpl "+this._tree.view+" is set.");
}

// set collapsed flag to the node
TreeView.prototype.setCollapsed = function (aNode, bCol)
{
  if (bCol) {
    if (aNode.collapsed) return;
    aNode.collapsed = true;
  }
  else {
    if (!aNode.collapsed) return;
    aNode.collapsed = false;
  }
  
  this.buildView();
};

TreeView.prototype.isSelected = function ()
{
  var node = this.getSelectedNode();
  if (node==null) return false;
  return true;
};

TreeView.prototype.isMultiSelected = function ()
{
  var sel = this._tvi.selection;
  if (sel==null) return false;

  var nrng = sel.getRangeCount();
  if (nrng<=0) return false;

  // multirange --> multisel
  if (nrng>1) return true;

  var start = {value: 0};
  var end = {value: 0};
  sel.getRangeAt(0, start, end);
  var nsel = end.value-start.value+1;

  if (nsel==1) return false;

  // single-range & multisel
  return true;
};

TreeView.prototype.getRowCount = function ()
{
  return this._tvi.rowCount;
};

TreeView.prototype.getNodeByRow = function (row)
{
  var tvi = this._tvi;
  if (row<0 || row>=tvi._data.length)
    return null;
  return tvi._data[row].node;
}

TreeView.prototype.getSelectedRow = function ()
{
  var sel = this._tvi.selection;
  if (sel==null)
    return -1;
  if (sel.getRangeCount()<1)
    return -1;
  var row = {value: 0};
  var max = {value: 0};
  sel.getRangeAt(0, row, max);
  //dd("getSelectedNode: "+row.value+", "+max.value);

  if (row.value<0 || row.value>=this._tvi.rowCount)
    return -1;

  return row.value;
};

TreeView.prototype.getSelectedNode = function ()
{
  var irow = this.getSelectedRow();
  if (irow<0)
    return null;
  
  return this.getNodeByRow(irow);
};

TreeView.prototype.getSelectedRowList = function ()
{
  var sel = this._tvi.selection;
  if (sel==null)
    return null;
  var nrng = sel.getRangeCount();
  if (nrng<1)
    return null;
  var res = new Array(nrng);
  for (var i=0; i<nrng; ++i) {
    var start = {value: 0};
    var end = {value: 0};
    sel.getRangeAt(i, start, end);
    res[i] = {start: start.value, end: end.value};
  }

  return res;
};

/*
TreeView.prototype.getSelectedRowList2 = function ()
{
  var res = new Array();
  var cl = this.getSelectedRowList();
  var nrng = cl.length;
  for (var i=0; i<nrng; ++i) {
    let elem = cl[i];
    for (var j=elem.start; j<elem.end; ++j)
      res.push(j);
  }

  return res;
};
*/

TreeView.prototype.saveSelection = function ()
{
  this._selSaved = null;
  var sel = this._tvi.selection;
  if (sel==null)
    return;
  var nrng = sel.getRangeCount();
  if (nrng<1)
    return;
  var res = new Array(nrng);
  for (var i=0; i<nrng; ++i) {
    var start = {value: 0};
    var end = {value: 0};
    sel.getRangeAt(i, start, end);
    res[i] = {start: start.value, end: end.value};
  }
  this._selSaved = res;
};

TreeView.prototype.restoreSelection = function ()
{
  var sel = this._tvi.selection;
  if (sel==null)
    return;

  if (this._selSaved==null) {
    sel.clearSelection();
    return;
  }

  var nrng = this._selSaved.length;
  for (var i=0; i<nrng; ++i) {
    var start = this._selSaved[i].start;
    var end   = this._selSaved[i].end;
    sel.rangedSelect(start, end, (i==0)?false:true );
  }  
};

TreeView.prototype.rangedSelect = function (aStart, aEnd, aFlag)
{
  var sel = this._tvi.selection;
  if (sel==null)
    return;
  sel.rangedSelect(aStart, aEnd, aFlag);
};

TreeView.prototype.getSelectedNodeList = function ()
{
  var row_ids = this.getSelectedRowList();
  if (row_ids==null)
    return null;
  var nrows = row_ids.length;
  var nodes = new Array();
  var node = null; 
  for (var i=0; i<nrows; ++i) {
    var rng = row_ids[i];
    for (var j=rng.start; j<=rng.end; ++j) {
      node = this.getNodeByRow(j);
      if (node)
        nodes.push(node);
    }
  }

  return nodes;
}

/////

TreeView.prototype._removeNodeImpl = function (nodes, aFun)
{
  var i, imax = nodes.length;
  for (i=0; i<imax; ++i) {
    var elem = nodes[i];
    if (aFun(elem, i)) {
      // remove node
      nodes.splice(i, 1);
      return true;
    }
    if ("childNodes" in elem) {
      var res = this._removeNodeImpl(elem.childNodes, aFun);
      if (res) return true;
    }
  }

  return false;
}

/// remove node by function
TreeView.prototype.removeNode = function (aFun)
{
  var res = this._removeNodeImpl(this._data, aFun);
  if (res)
    this.buildView();
  return res;
};

/// remove node by index
TreeView.prototype.removeNodeIndex = function (aInd, aCnt)
{
  this.saveSelection();
  this._data.splice(aInd, aCnt);
  this.buildView();
  this.restoreSelection();
  
  if (!this.isSelected()) {
    // no selection --> select the last item
    this.setSelectedRow(this.getRowCount()-1);
  }
};

TreeView.prototype.setSelectedRow = function (aIndex)
{
  var sel = this._tvi.selection;
  if (sel==null)
    return;
  //sel.select(aIndex);
  sel.timedSelect(aIndex, 0);
};

/// select (the first matching) node by selection function
/// returns false if no row is selected
TreeView.prototype.selectNodeByFunc = function (aFun)
{
  var tvi = this._tvi;
  if (tvi.selection==null)
    return false; // tvi is not created

  const nlen = tvi._data.length;
  var node;
  for (var i=0; i<nlen; ++i) {
    node = tvi._data[i].node;
    if (aFun(node)) {
      //this._data[i].name = node.name;
      //this._treeBoxObj.invalidateRow(i);
      tvi.selection.timedSelect(i, 0);
      return true;
    }
  }

  return false;
};

///////////////

/// invalidate and redisplay the all contents of the tree
TreeView.prototype.invalidate = function ()
{
  this._tvi.invalidate();
}

/// invalidate and redisplay the row
TreeView.prototype.invalidateRow = function (aInd)
{
  if (this._tvi._treeBoxObj)
    this._tvi._treeBoxObj.invalidateRow(aInd);
}

/// update display of the tree contents by node data specified by functor aFun
TreeView.prototype.updateNode = function (aFun)
{
  this._tvi.updateNode(aFun);
}

/// execute aFun for each node
TreeView.prototype.forEachNode = function (aFun)
{
  ( function (nodes) {
    var i, imax = nodes.length;
    for (i=0; i<imax; ++i) {
      var elem = nodes[i];
      aFun(elem, i);

      if ("childNodes" in elem) {
        arguments.callee(elem.childNodes);
      }
    }
  } ) (this._data);
}

///////////////

TreeView.prototype.addContextMenuHandler = function (fn)
{
  this._tgtwin.addEventListener("contextmenu", fn, false);
}

// private initialization routine
TreeView.prototype._onLoad = function ()
{
  this._tree = document.getElementById(this._tgtid);
  dd("TreeView "+this._tree+" is loaded.");
  // dd("***** treeview parent: "+_tree.parentNode.localName);
  // dd("***** treeview parent parent: "+_tree.parentNode.parentNode.localName);
  // dd("***** treeview parent parent parent: "+_tree.parentNode.parentNode.parentNode.localName);

  this._tree.view = this._tvi;
  dd("treeviewimpl "+this._tree.view+" is set.");

  var that = this;
  this._tree.addEventListener("contextmenu", function(e) {that._onContextMenu(e);}, false);
  this._tree.addEventListener("click", function(e) {that._onClick(e);}, false);
  // this._tree.addEventListener("dblclick", function(e) {that._onClick(e);}, false);

  dd("treeview "+this._tgtid+" is loaded.");
}

TreeView.prototype._onUnLoad = function ()
{
  dd("treeview "+this._tgtid+" is unloaded.");
}

TreeView.prototype._onContextMenu = function (aEvent)
{
  /*
  // perform hit test
  var row = {}, col = {}, obj = {};
  this._tvi._treeBoxObj.getCellAt(aEvent.clientX, aEvent.clientY, row, col, obj);

  //dd("hittest: row="+row.value+", col="+col.value+", obj="+obj.value);

  var node = null;
  if ( row.value<0 || row.value>=this._tvi.rowCount ||
       !(obj.value=="cell"||obj.value=="text") ) {
    // mouse is in outside of the tree rows
    // --> target is the current sel
    node = this.getSelectedNode();
    dd("_onContextMenu> node is selectedNode");
  }
  else {
    node = this.getNodeByRow(row.value);
    dd("_onContextMenu> node is hittestNode");
  }
   */

  var menuid;
  var node = this.getSelectedNode();

  if (this.isMultiSelected() &&
      this.mulselCtxtMenuId) {
    dd("_onContextMenu> multisel");
    // multi selection --> use multisel ctxt menu
    menuid = this.mulselCtxtMenuId;
  }
  else if (node && node.menu_id) {
    menuid = node.menu_id;
  }
  else if (this.defCtxtMenuId) {
    // no selection --> use default ctxt menu
    menuid = this.defCtxtMenuId;
  }
  //dd("ContextMenu: "+ require("debug_util").dumpObjectTree(node, 0));
  //dd("ContextMnu: "+menuid);

  var dom_elem = document.getElementById(menuid);
  //dd("ContextMnu: "+dom_elem);
  //dd("ContextMnu: "+dom_elem.openPopup);

  if (dom_elem) {
    dom_elem.openPopup(null, "", aEvent.clientX+1, aEvent.clientY+1, true, false);
    aEvent.preventDefault();
  }

}

TreeView.prototype._onClick = function (aEvent)
{
  if (aEvent.button!=0)
    return;
  
  // perform hit test
  var row = {}, col = {}, obj = {};
  this._tvi._treeBoxObj.getCellAt(aEvent.clientX, aEvent.clientY, row, col, obj);
  //if (row.value==-1)
  //return;

  if (obj.value=="twisty") {
    row = row.value;
    // dd("toggle "+row+": called");
    var node = this.getNodeByRow(row);
    if (this._tvi._data[row].notloaded &&
        this.loadNodeHandler) {
      this.loadNodeHandler(aEvent, node);
      this.setCollapsed(node, false);
    }
    else {
      var bCol = this._tvi._data[row].collapsed;
      this.setCollapsed(node, !bCol);
    }
    if (this.twistyClickHandler)
      this.twistyClickHandler(row, node);
    return;
  }

  if (this.clickHandler) {
    //dd("TreeView._onClick()");
    if (row.value<0) {
      // no selection
      this.clickHandler(aEvent, null, null);
    }
    else {
      var node = this.getNodeByRow(row.value);
      this.clickHandler(aEvent, node, col.value.id);
    }
    return;
  }
};

TreeView.prototype.addEventListener = function (a1, a2, a3)
{
  if (this._tree==null)
    this._tree = document.getElementById(this._tgtid);
  this._tree.addEventListener(a1, a2, a3);
};

//////////////////////////////////////////////////////////////////////////
/// tree view item constructor

var TreeItemImpl = function ()
{
  this.name = "";
  this.parent = -1;
  this.collapsed = false;
  this.level = 0;
  this.empty = true;
  this.hasNext = true;
  this.editable = false;

  if (arguments.length>0) {
    var obj = arguments[0];
    for (var i in obj) {
      this[i] = obj[i];
    }
  }
}

//////////////////////////////////////////////////////////////////////////
// TreeViewImpl: nsITreeView implementation

// constructor
var TreeViewImpl = function (aParent)
{
  this._mParent = aParent;
  this._data = new Array();
  this._treeBoxObj = null;

  // interface nsITreeView
  this.selection = null;
/*
  this._data.push(new TreeItemImpl({
  name: "mogemoge",
  object_id: 10,
  empty: false
  }));
  this._data.push(new TreeItemImpl({
  name: "child1",
  object_id: 12,
  parent: 0,
  level: 1,
  hasNext: true
  }));
  this._data.push(new TreeItemImpl({
  name: "child2",
  object_id: 13,
  parent: 0,
  level: 1,
  hasNext: false
  }));
  this._data.push(new TreeItemImpl({
  name: "mogemoge",
  object_id: 10,
  empty: false,
  open: false,
  editable: true
  }));
*/
}

TreeViewImpl.prototype.append = function (aNode, aObj)
{
  var elem = new TreeItemImpl(aObj);
  elem.node = aNode;
  this._data.push(elem);
}

TreeViewImpl.prototype.updateNode = function (aFun)
{
  const nlen = this._data.length;
  var node;
  for (var i=0; i<nlen; ++i) {
    node = this._data[i].node;
    if (aFun(node)) {
      this._data[i].name = node.name;
      this._treeBoxObj.invalidateRow(i);
    }
  }
}

TreeViewImpl.prototype.clearData = function ()
{
  this._data = new Array();
}

TreeViewImpl.prototype.invalidate = function ()
{
  if (this._treeBoxObj)
    this._treeBoxObj.invalidate();
  //dd(require("debug_util").dumpObjectTree(this._data, 1));
}

TreeViewImpl.prototype.rowCountChanged = function (ind, ndel)
{
  if (this._treeBoxObj)
    this._treeBoxObj.rowCountChanged(ind, ndel);
}

///////////////

// interface nsITreeView
TreeViewImpl.prototype.__defineGetter__("rowCount", function()
{
  //dd("TreeViewImpl.rowCount called: "+this._data.length);
  return this._data.length;
});

TreeViewImpl.prototype.setTree = function (tree) {
  //dd("TreeViewImpl.setTree ("+tree+") called");
  if (tree) {
    // initialize view
    this._treeBoxObj = tree;
  }
  else {
    // finalize view
    this._treeBoxObj = null;
    // this._data = null;
  }
}

TreeViewImpl.prototype.getCellText = function (row, column)
{
  //dd("getCellText: row="+row+", col="+column.id);
  if (!this._data)
    return "";

  var elem = this._data[row];
  if (!elem)
    return "";

  //dd("getCellText: "+ require("debug_util").dumpObjectTree(column, 0));
  if (column.primary)
    return elem.name;

  if ("values" in elem && column.id in elem.values)
    return elem.values[column.id];

  return "";
}

TreeViewImpl.prototype.getCellValue = function (row, column)
{
  //dd("TVI: getCellValue called, "+row+", "+column.id);
  if (!this._data)
    return null;

  var elem = this._data[row];
  if (!elem)
    return null;

  if ("values" in elem && column.id in elem.values) {
    //dd("TVI: getCellValue called, "+row+", "+column.id+" value="+elem.values[column.id]);
    return elem.values[column.id];
  }

  return null;
}

TreeViewImpl.prototype.setCellValue = function(row, column, value)
{
  return;
}

TreeViewImpl.prototype.isEditable = function (row,column)
{
  // dd("isEditable row="+row+", col="+column.id+" res="+this._data[row].editable);
  return this._data[row].editable;
}

// ATTN: API was changed since GECKO 22
//TreeViewImpl.prototype.getCellProperties = function(row, column, props)
TreeViewImpl.prototype.getCellProperties = function(row, column)
{
  if (!this._data)
    return null;

  var elem = this._data[row];
  if (!elem)
    return null;

  if ("props" in elem &&
      column.id in elem.props) {
    //var atm = this._mParent.svcAtom.getAtom(elem.props[column.id]);
    //props.AppendElement(atm);
    return elem.props[column.id];
  }

  return null;
}

TreeViewImpl.prototype.getRowProperties = function(row,props) {}

TreeViewImpl.prototype.getColumnProperties = function(colid,col,props){}

TreeViewImpl.prototype.cycleHeader = function(col, elem) {}
    
TreeViewImpl.prototype.isContainer = function(row)
{
  // dd("TVI isContainer: row="+row+", nl="+this._data[row].notloaded);
  // return (this._data[row].parent==-1);

  // if the childnodes are not loaded,
  // we are not sure what they contains, so returns true here
  if (this._data[row].notloaded)
    return true;
  return this._data[row].container;
}

TreeViewImpl.prototype.isContainerOpen = function(row)
{
  // notloaded node is always closed
  if (this._data[row].notloaded)
    return false;
  return !this._data[row].collapsed;
}

TreeViewImpl.prototype.isContainerEmpty = function(row)
{
  // if the childnodes are not loaded,
  // we are not sure what they contains, so returns false here
  if (this._data[row].notloaded)
    return false;
  return this._data[row].empty;
}

TreeViewImpl.prototype.getParentIndex = function(row)
{
  return this._data[row].parent;
}

TreeViewImpl.prototype.hasNextSibling = function(row, after)
{
  //dd("hasNextSibling row="+row+" after="+after+" called: "+this._data[row].hasNext);
  return this._data[row].hasNext;
}

TreeViewImpl.prototype.getLevel = function(row)
{
  return this._data[row].level;
}

TreeViewImpl.prototype.isSeparator = function(row){ return false; }

TreeViewImpl.prototype.isSorted = function(){ return false; }

TreeViewImpl.prototype.getImageSrc = function(row, col)
{
  if (!this._data) return "";
  var elem = this._data[row];
  if (!elem) return "";

  var ind = col.id + "_imgsrc";
  if ("props" in elem &&
      ind in elem.props) {
    dd("TVI: getImageSrc called, "+row+", "+col.id+" -> "+elem.props[ind]);
    return elem.props[ind];
  }
  return null;
}

//TreeViewImpl.prototype.performActionOnCell: function(action, row, col) {},

TreeViewImpl.prototype.toggleOpenState = function(row)
{
}

TreeViewImpl.prototype.canDrop = function(targetIndex, orientation, dataTransfer)
{
  var par = this._mParent;
  if (par.canDropHandler &&
      typeof par.canDropHandler == 'function') {

    dd("tind="+targetIndex+", ori="+orientation);

    if (!this._data) return false;
    var elem = this._data[targetIndex];
    if (!elem) return false;

    return par.canDropHandler(elem.node, orientation, dataTransfer);
  }
  
  return false;
}

TreeViewImpl.prototype.drop = function(targetIndex, orientation, dataTransfer)
{
  var par = this._mParent;
  if (par.dropHandler &&
      typeof par.dropHandler == 'function')
  {
    dd("tind="+targetIndex+", ori="+orientation);

    if (!this._data) return;
    var elem = this._data[targetIndex];
    if (!elem) return;

    par.dropHandler(elem.node, orientation, dataTransfer);
  }
}


return TreeView;

} )();

}
