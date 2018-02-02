// -*-Mode: C++;-*-
//
// molstruct-panel.js: molecular structure sidepanel implementation
//
// $Id: molstruct-panel.js,v 1.8 2011/04/30 09:27:50 rishitani Exp $
//

if (!("molstruct" in cuemolui.panels)) {

( function () {

var panel = cuemolui.panels.molstruct = new Object();

// panel's ID
panel.id = "molstruct-panel";
  
panel.collapsed = false;
panel.command_id = "menu-molstruct-panel-toggle";
  
panel.mTgtMolID = -1;

panel.mTreeView = new cuemolui.TreeView(window, "molStructTree");
panel.mTreeView.clickHandler = function (ev, row, col) {
  panel.onTreeItemClick(ev, row, col);
}
panel.mTreeView.loadNodeHandler = function (ev, node) {
  panel.onLoadNode(ev, node);
}

panel.mSelector = new cuemolui.ObjMenuList(
  "molstruct-mol-selector",
  window,
  function (elem) {
    return cuemol.implIface(elem.type, "MolCoord");
  },
  cuemol.evtMgr.SEM_OBJECT);

window.addEventListener("load", function(){panel.onLoad();}, false);
window.addEventListener("unload", function() {panel.onUnLoad();}, false);

// panel.mSceneCtxtMenuID = "wspcPanelSceneCtxtMenu";
// panel.mObjCtxtMenuID = "wspcPanelObjCtxtMenu";
// panel.mRendCtxtMenuID = "wspcPanelRendCtxtMenu";

//////////////////////////
// methods

panel.setupTreeData = function (mol)
{
  var json_str = mol.getChainsJSON();
  // dd("MolStruct chains json: "+json_str);
  var data;
  try {
    data = JSON.parse(json_str);
  }
  catch (e) {
    dd("error : "+json_str);
    require("debug_util").exception(e);
    return;
  }

  var nodes = new Array();
  var i, nlen = data.length;

  for (i=0; i<nlen; ++i) {
    var elem = data[i];

    var node = new Object();
    node.name = "chain \""+elem+"\"";
    node.chain = elem;
    // node.values = { object_vis: elem.visible };
    // node.menu_id = this.mObjCtxtMenuID;
    // node.obj_id = elem.ID;
    node.type = "chain";
    node.collapsed = true;
    node.notloaded = true;
  
    nodes.push(node);
  }

  //dd("MolStruct Panel: data="+debug.dumpObjectTree(data, 1));
  //dd("MolStruct Panel: nodes="+debug.dumpObjectTree(nodes, 1));
  // this._nodes = nodes;
  this.mTreeView.setData(nodes);
}

panel.loadResids = function(aNode, aMol, aChainName)
{
  var chain = aMol.getChain(aChainName);
  if (!chain) return;

  var json_str = chain.getResidsJSON();
  var data;
  try {
    data = JSON.parse(json_str);
  }
  catch (e) {
    dd("error : "+json_str);
    require("debug_util").exception(e);
    return;
  }

  var i, nlen = data.length;

  aNode.notloaded = false;
  aNode.childNodes = new Array();

  for (i=0; i<nlen; ++i) {
    var resid = data[i];
    var node = new Object();
    node.name = resid.index + " " + resid.name;
    node.type = "resid";
    node.chain = aChainName;
    node.index = resid.index;
    node.notloaded = true;
    aNode.childNodes.push(node);
  }

  // dd("MolStruct LoadResid: data="+debug.dumpObjectTree(data, 1));
}

panel.loadAtoms = function(aNode, aMol)
{
  var chainName = aNode.chain;
  if (!chainName) return;
  var chain = aMol.getChain(chainName);
  if (!chain) return;

  if (!aNode.index) return;
  var resid = chain.getResidue(aNode.index);
  if (!resid) return;

  var json_str = resid.getAtomsJSON();
  var data;
  try {
    data = JSON.parse(json_str);
  }
  catch (e) {
    dd("error : "+json_str);
    require("debug_util").exception(e);
    return;
  }

  // dd("MolStruct LoadAtoms: data="+debug.dumpObjectTree(data, 1));

  var i, nlen = data.length;

  aNode.notloaded = false;
  aNode.childNodes = new Array();

  for (i=0; i<nlen; ++i) {
    var atom = data[i];
    var node = new Object();
    node.name = atom.name + " (" + atom.elem + ")";
    node.type = "atom";
    node.atom_id = atom.id;
    // node.aname = atom.name;
    // node.resid = resid.sindex;
    // node.chain = chainName;
    // node.notloaded = true;
    aNode.childNodes.push(node);
  }

}

panel.removeObject = function (aId)
{
}

//////////////////////////
// event handlers

panel.onLoad = function ()
{
  var that = this;

  // setup objmenu selection change event handler
  this.mSelector.addSelChanged(function(aEvent) {
    try {
      that.targetChanged();
    }
    catch (e) { debug.exception(e); }
  });

  // setup object event handler for topology change
  var ob_handler = function (args) {
    if (args.evtType == cuemol.evtMgr.SEM_CHANGED &&
        args.method=="topologyChanged") {
      obj = that.mSelector.getSelectedObj();
      if (obj.uid==args.obj.target_uid) {
        that.targetChanged();
      }
    }
  };
  
  this._callbackID = cuemol.evtMgr.addListener("topologyChanged",
                                               cuemol.evtMgr.SEM_OBJECT,
                                               cuemol.evtMgr.SEM_CHANGED,
                                               -1, // source (scene) UID==>ANY
                                               ob_handler);

  // this.mSelector.reload();

  // Setup the toolbuttons
  this.mBtnSel = document.getElementById("molstrPanelSelectBtn");
  this.mBtnCent = document.getElementById("molstrPanelCenterBtn");
  this.mBtnZoom = document.getElementById("molstrPanelZoomBtn");
  this.mBtnProp = document.getElementById("molstrPanelPropBtn");

  this.mBtnSel.addEventListener("command", function(e) { that.onBtnSelCmd(0); }, false);
  this.mBtnCent.addEventListener("command", function(e) { that.onBtnSelCmd(1); }, false);
  this.mBtnZoom.addEventListener("command", function(e) { that.onBtnSelCmd(2); }, false);
  this.mBtnProp.addEventListener("command", function(e) { that.onBtnPropCmd(); }, false);

  // Setup the context menus
}

panel.onUnLoad = function ()
{
  if (this._callbackID)
    cuemol.evtMgr.removeListener(this._callbackID);
}

panel.onPanelShown = function ()
{
  this.mTreeView.ressignTreeView();
}
panel.onPanelMoved = function ()
{
  this.mTreeView.ressignTreeView();
}

panel.targetChanged = function ()
{
  var obj;
  try {
    obj = this.mSelector.getSelectedObj();
    if (!obj) {
      // this.setDisabled(true);
      this.mTreeView.setData(new Array());
      this.mTreeView.buildView();
      this.mTgtMolID = -1;
      return;
    }
    this.setupTreeData(obj);
    this.mTreeView.restoreOpenState(obj.uid);
    this.mTreeView.buildView();
    this.mTgtMolID = obj.uid;
  }
  catch (e) {
    dd("Error in panel.targetSceneChanged !!");
    debug.exception(e);
  }
  obj = null;
}

panel.onLoadNode = function (aEvent, node)
{
  //dd("MS onLoadNode: node="+node.name+", type="+node.type);
  // dd("WS onClick: detail="+aEvent.detail);

  if (this.mTgtMolID<0) return;
  var mol = cuemol.getObject(this.mTgtMolID);
  if (!mol) return;

  switch (node.type) {
  case "chain":
    this.loadResids(node, mol, node.chain);
    this.mTreeView.buildView();
    break;

  case "resid":
    this.loadAtoms(node, mol);
    this.mTreeView.buildView();
    break;

  }
  mol = null;
}

panel.onTreeItemClick = function (aEvent, node, col)
{
  if (aEvent.detail==2) {
    // double clicked
    
    if (this.mTgtMolID<0) return;
    let mol = cuemol.getObject(this.mTgtMolID);
    if (!mol) return;
    
    let selstr = this.makeSelstrByNode(node);

    cuemolui.chgMolSel(mol, selstr, "Change mol selection", true);

    try {
      var pos = mol.getCenterPos(true);
      view = gQm2Main.mMainWnd.currentViewW;
      if (view)
        view.setViewCenter(pos);
    }
    catch (e) {
      dd("Chg view center error");
      debug.exception(e);
      return;
    }

    /*
    try {
      var sel = cuemol.makeSel(selstr);
      if (sel===null) {
        throw "cannot compile selstr:"+selstr;
      }
      mol.sel = sel;
      var pos = mol.getCenterPos(true);
      
      view = gQm2Main.mMainWnd.currentViewW;
      if (view)
        view.setViewCenter(pos);
    }
    catch (e) {
      dd("SetProp error");
      debug.exception(e);
      return;
    }
    
    // Save to selHistory
    util.selHistory.append(selstr);
    mol = null;
     */
  }
}

panel.makeSelstrByNode = function (aNode)
{
  var selstr = "";
  switch (aNode.type) {
  case "chain":
    selstr = "c;"+aNode.chain;
    break;
    
  case "resid":
    selstr = aNode.chain + "." + aNode.index + ".*";
    break;
    
  case "atom":
    // dd("dlbclicked: atom "+aNode.chain+" "+aNode.resid+" "+aNode.aname);
    selstr = "aid "+aNode.atom_id;
    break;
  }

  return selstr;
}

panel.makeSelstrByTreeSel = function ()
{
  var sels = this.mTreeView.getSelectedRowList();
  var nrng = sels.length;
  var node;
  var selstr_ary = new Array();
  var selstr;
  
  for (var i=0; i<nrng; ++i) {
    //dd("sel range "+i+", start="+sels[i].start+", end="+sels[i].end);
    var j = sels[i].start;
    var jend = sels[i].end;

    var node_start = this.mTreeView.getNodeByRow(j);
    var node_end = this.mTreeView.getNodeByRow(jend);
    if (node_start.type=="resid" &&
	node_end.type=="resid" &&
	node_start.chain==node_end.chain) {
      if (node_start.index==node_end.index)
        selstr = node_start.chain + "." + node_start.index +".*";
      else
        selstr = node_start.chain + "." + node_start.index + ":" + node_end.index +".*";
      selstr_ary.push(selstr);
      continue;
    }

    for (; j<=jend; ++j) {
      node = this.mTreeView.getNodeByRow(j);
      selstr_ary.push(this.makeSelstrByNode(node));
    }
  }
  
  return selstr_ary.join("|");
}

panel.onBtnSelCmd = function (nMode)
{
  if (this.mTgtMolID<0) return;
  var mol = cuemol.getObject(this.mTgtMolID);
  if (mol==null) return;
    
  var scene = mol.getScene();
  if (scene==null) return;

  var selstr = this.makeSelstrByTreeSel();
  //dd("sel: "+selstr);

  cuemolui.chgMolSel(mol, selstr, "Change mol selection", true);

  if (nMode>=1) {
    try {
      var view = document.getElementById("main_view").currentViewW;
      if (nMode==1) {
        view.setViewCenter(mol.getCenterPos(true));
      }
      else {
        mol.fitView(true, view);
      }
    }
    catch(e) {
      dd("SetCenter error");
      debug.exception(e);
    }
  }

  mol = null;
}

panel.onBtnPropCmd = function ()
{
}

} )();

}

