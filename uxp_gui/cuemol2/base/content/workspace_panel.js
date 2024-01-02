// -*-Mode: C++;-*-
//
// workspace-panel.js: workspace sidepanel implementation
//
// $Id: workspace_panel.js,v 1.39 2011/04/24 15:05:49 rishitani Exp $
//

if (!("workspace" in cuemolui.panels)) {

( function () {

var ws = cuemolui.panels.workspace = new Object();

/// Panel's ID
ws.id = "workspace-panel";
  
ws.collapsed = false;
ws.command_id = "menu-workspace-panel-toggle";
  
/// Callback ID of the scene event listener
ws._callbackID = null;

/// Target scene ID
ws.mTgtSceneID = -1;

////////////////////////////////
// create TreeView object
ws.mViewObj = new cuemolui.TreeView(window, "objectTree");

// Setup tree-view's event handlers
ws.mViewObj.clickHandler = function (ev, row, col) {
  try { ws.onTreeItemClick(ev, row, col); } catch (e) { debug.exception(e); }
};
ws.mViewObj.twistyClickHandler = function (row, node) {
  try { ws.onTwistyClick(row, node); } catch (e) { debug.exception(e); }
};
ws.mViewObj.canDropHandler = function (tind, ori, dt)
{
  return ws.canDrop(tind, ori, dt);
};
ws.mViewObj.dropHandler = function (elem, ori, dt)
{
  ws.drop(elem, ori, dt);
};
ws.mViewObj.mulselCtxtMenuId = "wspcPanelMulCtxtMenu";

const ITEM_DROP_TYPE = "application/x-cuemol-workspace-item";

////////////////////////////////
// Setup DOM event handlers
window.addEventListener("load", function(){ws.onLoad();}, false);
window.addEventListener("unload", function() {ws.onUnLoad();}, false);

ws._nodes = null;

///////////////////////////////
// Context menu implementations
#include workspace_panel_ctxtmenu.js

///////////////////////////////
// Drag&drop implementation
#include workspace_panel_dnd.js

///////////////////////////////
// Mol/rend selection implementation
#include workspace_panel_molsel.js

#include workspace_panel_copipe.js

//////////////////////////
// methods

ws.createRendNodeData = function (aRend, aParent)
{
  let rnode = new Object();

  // internal name
  rnode.orig_name = aRend.name;

  // type name (i.e. simple, etc)
  rnode.type_name = aRend.type;

  // display name (<=orig_name + type_name)
  rnode.name = aRend.name + " ("+aRend.type+")";

  //rnode.values = { object_vis: aRend.visible };
  
  let rvis = "invisible";
  if (aRend.visible) {
    if (aParent.visible)
      rvis = "visible";
    else
      rvis = "disabled";
  }
  rnode.props = {
  object_vis: rvis,
  object_lck: (aRend.locked?"locked":"unlocked")
  };
  
  rnode.obj_id = aRend.ID;
  rnode.parent_id = aParent.ID;

  return rnode;
};

// Camera
ws.createCameraNodeData = function (aScene)
{
  var data, node;
  let json_str = aScene.getCameraInfoJSON();

  dd("CameraInfo json: "+json_str);
  data = JSON.parse(json_str);
  
  node = new Object();
  node.name = "Camera";
  node.collapsed = true;
  node.obj_id = "camera_topnode";
  node.menu_id = "wspcPanelCameraCtxtMenu";
  node.type = "cameraRoot";
  let nlen = data.length;
  if (nlen>0) {
    node.childNodes = new Array();
    for (i=0; i<nlen; ++i) {
      let rnode = new Object();
      rnode.name = data[i].name;
      rnode.obj_id = data[i].name;
      rnode.menu_id = "wspcPanelCameraCtxtMenu";
      rnode.type = "camera";
      rnode.props = {
      object_vis: ( (data[i].src=="")? "" : "linked" ),
      object_name: ( (data[i].vis_size>0) ? "visible" : ""),
      //object_name: ( (data[i].hasVisSet) ? "visible" : ""),
      };
      dd("camera "+data[i].name+" vis_size="+data[i].vis_size);
      node.childNodes.push(rnode);
    }
  }

  return node;
};

// Styles
ws.createStyleNodeData = function (aScene)
{
  var i;
  let stylem = cuemol.getService("StyleManager");
  
  let json_str = stylem.getStyleSetsJSON(0);
  let styles = JSON.parse(json_str);
  
  json_str = stylem.getStyleSetsJSON(aScene.uid);
  styles = styles.concat( JSON.parse(json_str) );
  
  // dd("Workspace Panel: style="+debug.dumpObjectTree(styles, 1));
  // dd("Workspace Panel: style(sce)="+debug.dumpObjectTree(scene_styles, 1));
  
  node = new Object();
  node.name = "Styles";
  node.collapsed = true;
  node.obj_id = "styles_topnode";
  node.menu_id = "wspcStyleCtxtMenu";
  node.type = "styleRoot";
  nlen = styles.length;
  if (nlen>0) {
    node.childNodes = new Array();
    for (i=0; i<nlen; ++i) {
      let rnode = new Object();
      rnode.name = styles[i].name;
      if (rnode.name=="")
        rnode.name = "(anonymous)";
      //rnode.obj_id = styles[i].name;
      //rnode.uid = styles[i].uid;
      rnode.obj_id = styles[i].uid;
      rnode.scene_id = styles[i].scene_id;
      rnode.menu_id = "wspcStyleCtxtMenu";
      rnode.type = "style";
      //rnode.src = styles[i].src;
      
      let readonly = styles[i].readonly;
      let lck=false;
      if (styles[i].readonly)
        lck = true;
      if (rnode.scene_id==0)
        lck = true;
      
      rnode.props = {
      object_lck: (lck?"locked":"unlocked"),
      object_vis: (styles[i].src==""?"":"linked")
      };
      
      node.childNodes.push(rnode);
    }
  }

  return node;
}

ws.syncContents = function (scid)
{
  let scene = cuemol.getScene(scid);
  if (!scene) {
    dd("Workspace panel: syncContents failed, invalid scene: "+scid);
    return;
  }

  //let json_str = scene.getObjectTreeJSON();
  let json_str = scene.getSceneDataJSON();
  // dd("WS> ObjTree json: "+json_str);
  let data;
  try {
    data = JSON.parse(json_str);
  }
  catch (e) {
    dd("error : "+json_str);
    require("debug_util").exception(e);
    return;
  }

  let nodes = new Array();
  let i, nlen = data.length;

  // scene
  let sc = data[0];
  let node = new Object();
  node.name = "Scene: "+sc.name;
  node.menu_id = this.mSceneCtxtMenuID;
  node.obj_id = sc.ID;
  node.type = "scene";
  node.props = { object_name: "noindent" };
  nodes.push(node);

  // objects and renderers
  for (i=1; i<nlen; ++i) {
    let obj = data[i];
    node = new Object();
    node.name = obj.name + " ("+obj.type+")";
    //node.values = { object_vis: obj.visible };
    node.props = {
      object_vis: (obj.visible?"visible":"invisible"),
      object_lck: (obj.locked?"locked":"unlocked")
    };
    node.collapsed = obj.ui_collapsed; //false;
    node.menu_id = this.mObjCtxtMenuID;
    node.obj_id = obj.ID;
    node.type = "object";
    // dd("WS> build node="+debug.dumpObjectTree(node,2));
    if (obj.rends && obj.rends.length>0) {
      node.childNodes = new Array();
      var j, njlen = obj.rends.length;
      for (j=0; j<njlen; ++j) {
        let rend = obj.rends[j];
        let rnode = this.createRendNodeData(rend, obj);

        if (rend.type=="*group") {
	  dd("*** group rnode = "+debug.dumpObjectTree(rend));
          rnode.menu_id = "wspcPanelRendGrpCtxtMenu";
          rnode.type = "rendGroup";
          // rnode.collapsed = false;
	  rnode.collapsed = rend.ui_collapsed;
          rnode.props["object_name"] = "group";
          let grpsz = rend.childNodes ? rend.childNodes.length : 0;
	  rnode.childNodes = new Array();
	  for (let k=0; k<grpsz; ++k) {
	    let cn = this.createRendNodeData(rend.childNodes[k], rend);
	    cn.menu_id = this.mRendCtxtMenuID;
	    cn.type = "renderer";
	    rnode.childNodes.push(cn);
	  }
        }
        else {
          rnode.menu_id = this.mRendCtxtMenuID;
          rnode.type = "renderer";
        }

        node.childNodes.push(rnode);
      }
    }
    nodes.push(node);
  }

  //dd("Workspace Panel: syncContents data="+debug.dumpObjectTree(data, 1));
  //dd("Workspace Panel: syncContents nodes="+debug.dumpObjectTree(nodes, 1));

  // Cameras
  nodes.push( this.createCameraNodeData(scene) );

  // Styles
  nodes.push( this.createStyleNodeData(scene) );

  // dd("Workspace Panel: cameraInfo="+debug.dumpObjectTree(data, 1));
  //dd("Workspace Panel: syncContents nodes="+debug.dumpObjectTree(nodes, 1));

  // Setup nodes for the tree view
  this._nodes = nodes;
  this.mViewObj.setData(this._nodes);
  this.mViewObj.restoreOpenState(scid);
  this.mViewObj.buildView();
}

/// Synchronize the contents' property change to the tree-view (mainly icons)
ws.syncContentsPropChg = function (srcUID, propname)
{
  var node = this.findNodeByObjId(srcUID);
  
  var src;
  var type2;
  if (node.type=="object") {
    src = cuemol.getObject(srcUID);
    type2 = src._wrapped.getClassName();
  }
  else if (node.type=="renderer"||node.type=="rendGroup") {
    src = cuemol.getRenderer(srcUID);
    type2 = src.type_name;
    //dd(debug.dumpObjectTree(src));
    //type2 = src._wrapped.getProp("type_name");
  }
  else if (node.type=="scene") {
    src = cuemol.getScene(srcUID);
    type2 = "";
  }
  else if (node.type=="camera") {
    dd("camera syncContentsPropChg called!! *****");
  }
  else
    return;

  if (propname=="visible") {
    var newval = src.visible;
    if (node.type=="renderer") {
      node.props.object_vis = newval?"visible":"invisible";
    }
    else {
      node.props.object_vis = newval?"visible":"invisible";
      const nch = (node.childNodes)? node.childNodes.length : 0;
      for (var i=0; i<nch; ++i) {
        var rnode = node.childNodes[i];
        if (newval) {
          if (rnode.props.object_vis=="disabled")
            rnode.props.object_vis = "visible";
        }
        else {
          if (rnode.props.object_vis=="visible")
            rnode.props.object_vis = "disabled";
        }
      }
      this.mViewObj.invalidate();
      return;
    }
  }
  else if (propname=="locked") {
    var newval = src.locked;
    node.props.object_lck = newval?"locked":"unlocked";
    dd("syncContPropChg> locked, newval="+newval+", props="+node.props.object_lck);
  }
  else if (propname=="name") {
    if (node.type=="scene") {
      node.name = "Scene: "+ src.name;
    }
    else {
      let newval = src.name + " ("+type2+")";
      dd("SyncContPropChg name UID: "+srcUID+", name="+newval);
      node.orig_name = src.name;
      node.name = newval;
    }
  }
  else {
    return;
  }

  //this.mViewObj._tvi.invalidate();
  this.mViewObj.updateNode( function(elem) {
    return (elem.obj_id==srcUID)?true:false;
  } );
}

ws.removeObject = function (aId)
{
  dd("WS.removeObject ID="+aId);
  let irow = this.mViewObj.getSelectedRow();
  this.mViewObj.removeNode( function(elem) {
    return (elem.obj_id==aId)?true:false;
  } );

  this.mViewObj.setSelectedRow(irow-1);
}

ws.findNodeByObjId = function (aId)
{
  if (!this._nodes)
    return null;

  var elem, jelem, kelem;
  var i, j, k, imax, jmax, kmax;

  imax = this._nodes.length;
  for (i=0; i<imax; ++i) {
    elem = this._nodes[i];
    if (elem.obj_id==aId)
      return elem;

    if (!("childNodes" in elem))
      continue;

    jmax = elem.childNodes.length;
    //dd("WS.findNode> "+elem.childNodes);

    for (j=0; j<jmax; ++j) {
      jelem = elem.childNodes[j];
      if (jelem.obj_id==aId)
        return jelem;

      if (!("childNodes" in jelem))
        continue;

      kmax = jelem.childNodes.length;
      for (k=0; k<kmax; ++k) {
        kelem = jelem.childNodes[k];
        if (kelem.obj_id==aId)
          return kelem;
      }
    }
  }

  return null;
}

ws.selectByUID = function (uid)
{
  return this.mViewObj.selectNodeByFunc( function (aNode) {
    return (aNode.obj_id == uid);
  });
}

//////////////////////////
// event handlers

ws.onLoad = function ()
{
  var that = this;
  var mainWnd = this._mainWnd = document.getElementById("main_view");

  //
  // for toolbar buttons
  //
  this.mBtnNew = document.getElementById("wspcPanelAddBtn");
  this.mBtnDel = document.getElementById("wspcPanelDeleteBtn");
  this.mBtnProp = document.getElementById("wspcPanelPropBtn");
  this.mBtnZoom = document.getElementById("wspcPanelZoomBtn");
  //this.mBtnUp = document.getElementById("wspcPanelUpBtn");
  //this.mBtnDown = document.getElementById("wspcPanelDownBtn");

  var objtree = document.getElementById("objectTree");
  objtree.addEventListener("select", function(e) { that.onTreeSelChanged(); }, false);

  //
  // setup the target scene
  //
  var scid = mainWnd.getCurrentSceneID();
  if (scid && scid>0)
    this.targetSceneChanged(scid);

  dd("workspace panel onLoad: MainView="+this._mainWnd+", target scene="+this.mTgtSceneID);

  //
  // setup tab-event handler for the MainTabView
  //
  mainWnd.mPanelContainer.addEventListener("select", function(aEvent) {
    var scid = mainWnd.getCurrentSceneID();
    //dd("Workspace panel: onSelect called: "+scid+", cur="+that.mTgtSceneID);
    if (scid != that.mTgtSceneID)
      that.targetSceneChanged(scid);
  }, false);

  this.mCamCtxtDisableTgt = document.getElementsByClassName("wspcCamCtxt-disable");

  this.mStyCtxtDisableTgt = document.getElementsByClassName("wspcStyCtxt-disable");

  //this.onTreeSelChanged();
}

ws.onUnLoad = function ()
{
  dd("Workspace Panel Unloading: scene ID="+this.mTgtSceneID+", callbackID = "+this._callbackID);
  // dd("Workspace Panel Unloading: scenemgr ="+this._scMgr._wrapped);

  // this._mainWnd.removeEventListener("select", this._mainViewEventHandler, false);
  var scene = cuemol.getScene(this.mTgtSceneID);

  dd("Workspace Panel Unloading: scene ="+scene);

  if (this._callbackID!=null && scene)
    scene.removeListener(this._callbackID);

  delete this._node;
  delete this.mViewObj;

  // dd(require("traceback").format());
  // window.alert('ws.fini');
}

ws._attachScene = function (scid)
{
  var scene = cuemol.getScene(scid);
  if (!scene)
    return;

  this.mTgtSceneID = scid;
  this.syncContents(scid);
  dd("WorkspacePanel: change the tgt scene to "+this.mTgtSceneID);

  var that = this;
  var handler = function (args) {
    switch (args.evtType) {
    case cuemol.evtMgr.SEM_ADDED:
      // window.alert("Scene event: SEM_ADDED "+debug.dumpObjectTree(args));
      that.mViewObj.saveOpenState(args.srcUID);
      that.syncContents(args.srcUID);
      that.selectByUID(args.obj.target_uid);
      break;

    case cuemol.evtMgr.SEM_REMOVING:
      if (args.method=="cameraRemoving")
        that.removeObject(args.obj.name);
      else {
        that.removeObject(args.obj.target_uid);
        if (args.method=="styleRemoving") {
          let stylem = cuemol.getService("StyleManager");
          stylem.firePendingEvents();
        }
      }
      break;

    case cuemol.evtMgr.SEM_CHANGED:
      //window.alert("Scene event: SEM_CHANGED "+debug.dumpObjectTree(args));
      if (args.method=="sceneAllCleared" ||
          args.method=="sceneLoaded")
        that.syncContents(args.srcUID);
      break;

    case cuemol.evtMgr.SEM_PROPCHG:
      //dd(debug.dumpObjectTree(args.obj));
      //dd("%%% WORKSPACE evtMgr.SEM_PROPCHG propname = "+args.obj.propname);
      if ("propname" in args.obj) {
        let pnm = args.obj.propname;
        if (pnm=="name" || pnm=="visible" || pnm=="locked") {
          // that.mViewObj.saveOpenState(args.srcUID);
          that.syncContentsPropChg(args.obj.target_uid, pnm);
        }
        else if (pnm=="group") {
          // Group changed
          //  --> tree structure can be changed, so we update all contents.
          that.syncContents(args.srcUID);
        }
      }
      break;
    }
  };
  
  this._callbackID = cuemol.evtMgr.addListener("",
                                               cuemol.evtMgr.SEM_SCENE|
                                               cuemol.evtMgr.SEM_OBJECT|
                                               cuemol.evtMgr.SEM_RENDERER|
                                               cuemol.evtMgr.SEM_CAMERA|
                                               cuemol.evtMgr.SEM_STYLE, // source type
                                               cuemol.evtMgr.SEM_ANY, // event type
                                               scene.uid, // source UID
                                               handler);

}

// detach from the previous active scene
ws._detachScene = function (oldid)
{
  if (oldid<0) return;

  var oldscene = cuemol.getScene(oldid);
  if (oldscene && this._callbackID)
    cuemol.evtMgr.removeListener(this._callbackID);
  this._callbackID = null;

  // dd("===================");
  this.mViewObj.saveOpenState(oldid);
}

ws.targetSceneChanged = function (scid)
{
  try {
    if (scid==this.mTgtSceneID)
      return;
    //var oldid = this.mTgtSceneID;

    this._detachScene(this.mTgtSceneID);

    // attach to the new active scene
    this._attachScene(scid);

    this.onTreeSelChanged();
  }
  catch (e) {
    dd("Error in WS.targetSceneChanged !!");
    debug.exception(e);
  }
}

ws.onPanelShown = function ()
{
  this.mViewObj.ressignTreeView();
}
ws.onPanelMoved = function ()
{
  this.mViewObj.ressignTreeView();
}

ws.onNewCmd = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;

  dd("onNewCmd> elem.type="+elem.type);

  switch (elem.type) {
  case "object":
    gQm2Main.setupRendByObjID(id);
    break;

  case "renderer": {
    let rend = cuemol.getRenderer(id);
    let obj = rend.getClientObj();
    let grpnm = rend.group;
    if (grpnm)
      gQm2Main.setupRendByObjID(obj.uid, grpnm);
    else
      gQm2Main.setupRendByObjID(obj.uid);
    break;
  }
  case "rendGroup": {
    let rendgrp = cuemol.getRenderer(id);
    let obj = rendgrp.getClientObj();
    gQm2Main.setupRendByObjID(obj.uid, rendgrp.name);
    dd("Rend created in group="+rendgrp.group);
    break;
  }
    
  case "camera":
  case "cameraRoot":
    this.createCamera();
    break;
    
  case "style":
  case "styleRoot":
    this.createStyle();
    break;
  }
}

ws.onDeleteCmd = function (aEvent)
{
  var elemList = this.mViewObj.getSelectedNodeList();
  var nsel = elemList.length;
  if (nsel<=0)
    return;

  if (nsel==1) {
    this.deleteCmdImpl(elemList[0]);
    return;
  }
  
  var scene = cuemol.getScene(this.mTgtSceneID);
  if (!scene) return;

  // EDIT TXN START //
  scene.startUndoTxn("Destroy multiple objects");

  for (var i=0; i<nsel; ++i) {
    try {
      this.deleteCmdImpl(elemList[i]);
    }
    catch (e) {
      debug.exception(e);
    }
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
};

ws.deleteCmdImpl = function (elem)
{
  var id = elem.obj_id;

  if (elem.type=="object") {
    gQm2Main.deleteObject(id);
  }
  else if (elem.type=="renderer") {
    gQm2Main.deleteRendByID(id);
  }
  else if (elem.type=="rendGroup") {
    this.deleteRendGrp(elem);
  }
  else if (elem.type=="camera") {
    this.destroyCamera(id);
  }
  else if (elem.type=="style") {
    this.destroyStyle(elem);
  }
};

ws.deleteRendGrp = function (aElem)
{
  if (aElem.type!="rendGroup")
    return;
  
  var scene = cuemol.getScene(this.mTgtSceneID);
  var rendgrp = cuemol.getRenderer(aElem.obj_id);
  var rends = new Array();
  for (var i=0; i<aElem.childNodes.length; ++i) {
    rends.push( aElem.childNodes[i].obj_id );
  }
  
  var obj = rendgrp.getClientObj();
  var objname = obj.name;
  var rendname = rendgrp.name;

  // EDIT TXN START //
  scene.startUndoTxn("Delete rend group: "+objname+"/"+rendname);
  try {
    for (var i=0; i<rends.length; ++i)
      obj.destroyRenderer( rends[i] );
    obj.destroyRenderer( aElem.obj_id );
  }
  catch (e) {
    dd("***** ERROR: DeleteRendGrp "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

ws.onPropCmd = function ()
{
  if (this.mViewObj.isMultiSelected()) {
    util.alert(window, "Multiple items selected.");
    return;
  }

  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  //dd("onNewCmd elem="+require("debug_util").dumpObjectTree(elem, 1));
  let id = elem.obj_id;

  let target, scene;
  switch (elem.type) {
  case "scene":
    scene = target = cuemol.getScene(id);
    break;

  case "object":
    target = cuemol.getObject(id);
    scene = target.getScene();
    break;
    
  case "renderer":
    target = cuemol.getRenderer(id);
    scene = target.getScene();
    break;
    
  case "rendGroup":
    return this.onRenameRendGrp();
    
  case "camera":
    scene = this._mainWnd.currentSceneW;
    target = scene.getCameraRef(id);
    break;
    
  case "style": {
    this.showStyleEditor(elem);
    return;
  }

  default:
    return;
  }
  
  gQm2Main.showPropDlg(target, scene, window, elem.type);
};

ws.onBtnZoomCmd = function ()
{
  if (this.mViewObj.isMultiSelected()) {
    util.alert(window, "Multiple items selected.");
    return;
  }

  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  //dd("onNewCmd elem="+require("debug_util").dumpObjectTree(elem, 1));
  var id = elem.obj_id;

  var target;
  var view = this._mainWnd.currentViewW;
  if (elem.type=="object") {
    target = cuemol.getObject(id);
    if ('fitView' in target) {
      target.fitView(view, false);
      return;
    }
  }
  else if (elem.type=="renderer") {
    var rend = cuemol.getRenderer(id);
    target = rend.getClientObj();
    if (('sel' in rend) && ('fitView' in target)) {
      target.fitView2(view, rend.sel);
      return;
    }
    else if ('fitView' in target) {
      // scalar obj/map
      target.fitView(view, false);
      return;
    }
    else if (rend.has_center) {
      let pos = rend.getCenter();
      view.setViewCenter(pos);
    }
  }
  else {
    return;
  }

  sel = null;
  target = null;
}

ws.onTreeSelChanged = function ()
{
  if (this.mViewObj.isMultiSelected()) {
    this.mBtnNew.disabled = true;
    this.mBtnDel.disabled = false;
    this.mBtnProp.disabled = true;
    this.mBtnZoom.disabled = true;
    return
  }
  
  var elem = this.mViewObj.getSelectedNode();
  if (elem) {
    if (elem.type=="scene") {
      this.mBtnNew.disabled = true;
      this.mBtnDel.disabled = true;
      this.mBtnProp.disabled = false;
      this.mBtnZoom.disabled = true;

      return;
    }
    else if (elem.type=="object") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = false;
      this.mBtnProp.disabled = false;
      this.mBtnZoom.disabled = false;

      //this.mBtnUp.disabled = false;
      //this.mBtnDown.disabled = false;
      return;
    }
    else if (elem.type=="renderer") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = false;
      this.mBtnProp.disabled = false;
      this.mBtnZoom.disabled = false;

      //this.mBtnUp.disabled = false;
      //this.mBtnDown.disabled = false;
      return;
    }
    else if (elem.type=="rendGroup") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = false;
      this.mBtnProp.disabled = false;
      this.mBtnZoom.disabled = true;
      return;
    }
    else if (elem.type=="camera") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = false;
      this.mBtnProp.disabled = false;
      this.mBtnZoom.disabled = true;
      return;
    }
    else if (elem.type=="cameraRoot") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = true;
      this.mBtnProp.disabled = true;
      this.mBtnZoom.disabled = true;
      return;
    }
    else if (elem.type=="styleRoot") {
      this.mBtnNew.disabled = false;
      this.mBtnDel.disabled = true;
      this.mBtnProp.disabled = true;
      this.mBtnZoom.disabled = true;
      return;
    }
    else if (elem.type=="style") {
      this.mBtnNew.disabled = false;
      if (elem.scene_id==0) {
        // global (locked) style def
        this.mBtnDel.disabled = true;
        this.mBtnProp.disabled = true;
        this.mBtnZoom.disabled = true;
      }
      else {
        // local style def
        this.mBtnDel.disabled = false;
        this.mBtnProp.disabled = false;
        this.mBtnZoom.disabled = true;
      }
      return;
    }
  }
  this.mBtnNew.disabled = true;
  this.mBtnDel.disabled = true;
  this.mBtnProp.disabled = true;
  this.mBtnZoom.disabled = true;
}

ws.onTreeItemClick = function (aEvent, elem, col)
{
  //dd("WS onClick: row="+row+", col="+col);
  // dd("WS onClick: detail="+aEvent.detail);
  if (elem==null)
    return;

  if (col=="object_vis") {
    this.toggleVisible(elem);
  }
  else if (col=="object_lck") {
    // dd("WS> Toggle LCK, obj_id="+elem.obj_id);
    // dd("    Toggle LCK, object_lck="+elem.props.object_lck);
    this.toggleLocked(elem);
  }
  else if (aEvent.detail==2) {
    if (elem.type=="camera") {
      // also load visibility flags
      this.loadCamImpl(elem.obj_id, true);
      aEvent.preventDefault();
      aEvent.stopPropagation();
      return;
    }
    else {
      this.onPropCmd();
      return;
    }
  }
  
  aEvent.preventDefault();
  aEvent.stopPropagation();
}

ws.toggleVisible = function (aElem)
{
  var obj = null;
  if (aElem.type=="object")
    obj = cuemol.getObject(aElem.obj_id);
  else if (aElem.type=="renderer")
    obj = cuemol.getRenderer(aElem.obj_id);
  else if (aElem.type=="rendGroup")
    return this.toggleVisibleRendGrp(aElem);

  if (!obj) return;

  var scene = cuemol.getScene(this.mTgtSceneID);
  if (!scene) return;

  // EDIT TXN START //
  scene.startUndoTxn("Change visibility");
  try {
    obj.visible = !obj.visible;
  }
  catch (e) {
    dd("***** ERROR: Change visibility "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
}

ws.toggleLocked = function (aElem)
{
  var obj = null;
  if (aElem.type=="object")
    obj = cuemol.getObject(aElem.obj_id);
  else if (aElem.type=="renderer")
    obj = cuemol.getRenderer(aElem.obj_id);
  else if (aElem.type=="rendGroup")
    ; // TO DO: impl

  if (!obj)
    return; // toggleLocked is not supported for this row...

  var scene = cuemol.getScene(this.mTgtSceneID);
  if (!scene) return;

  var msg;
  if (obj.locked)
    msg="Unlock "+aElem.type;
  else
    msg="Lock "+aElem.type;

  // EDIT TXN START //
  scene.startUndoTxn(msg);
  try {
    obj.locked = !obj.locked;
  }
  catch (e) {
    dd("***** ERROR: Change locked "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  dd(">WS tglLck result, locked="+obj.locked);
};

ws.onTwistyClick = function (row, elem)
{
  var target;

  if (elem.type=="object")
    target = cuemol.getObject(elem.obj_id);
  else if (elem.type=="rendGroup")
    target = cuemol.getRenderer(elem.obj_id);
  else
    return;

  // save collapsed state to the scene
  // for persistance of open/collapsed state
  target.ui_collapsed = elem.collapsed;
};


ws.getSelectedRend = function ()
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="renderer")
    return null;
  return cuemol.getRenderer(elem.obj_id);
};


ws.onSaveAsObj = function(event)
{
  try {
    let elem = this.mViewObj.getSelectedNode();
    let objid = elem.obj_id;
    gQm2Main.onSaveAsObj(objid);
  }
  catch (e) {
    debug.exception(e);
  }
};

//////////////////////////
// Camera manipulations

ws.createCamera = function ()
{
  var scene = this._mainWnd.currentSceneW;
  var view = this._mainWnd.currentViewW;
  var i, name, res;
  for (i=0; ; ++i) {
    name = "camera_"+i;
    if (!scene.getCameraRef(name)) {
      res = util.prompt(window, "Name for new camera: ", name);
      if (res===null) return;
      break;
    }
  }

  // EDIT TXN START //
  scene.startUndoTxn("Create camera: "+res);
  try {
    scene.saveViewToCam(view.uid, res);
  }
  catch (e) {
    dd("***** ERROR: Create camera "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

ws.destroyCamera = function (name)
{
  var scene = this._mainWnd.currentSceneW;
  var res = util.confirm(window, "Delete camera: "+name);
  if (!res)
    return; // canceled

  // EDIT TXN START //
  scene.startUndoTxn("Destroy camera: "+name);
  try {
    scene.destroyCamera(name);
  }
  catch (e) {
    dd("***** ERROR: Destroy camera "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

///////////////////////
// Camera menu

ws.onRenameCamera = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var name = elem.obj_id;

  var scene = this._mainWnd.currentSceneW;
  var cam = scene.getCameraRef(name);
  if (cam==null) {
    dd("WS Error: camera "+name);
    return;
  }

  var res = util.prompt(window, "Rename camera \""+name+"\": ", name);
  if (res===null) return; // canceled
  
  if (name===res) return; // not changed
  
  if (scene.hasCamera(res)) {
    util.alert(window, "Cannot rename camera: \""+res+"\" already exists.");
    return;
  }

  // EDIT TXN START //
  scene.startUndoTxn("Rename camera "+name);
  try {
    scene.destroyCamera(name);
    scene.setCamera(res, cam);
  }
  catch (e) {
    dd("***** ERROR: Rename camera "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

ws.onCamSaveFileAs = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var name = elem.obj_id;

  if (!gQm2Main.onSaveCamera(name)) {
    // failed/canceled
    return;
  }

  if (name=="__current")
    return;

  // saved camera becomes the file-linked item
  let node = this.findNodeByObjId(name);
  if (node==null)
    return;
  node.props.object_vis = "linked";

  this.mViewObj.updateNode( function(elem) {
    return (elem.obj_id==name)?true:false;
  } );
};

ws.onCamSaveFile = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var name = elem.obj_id;

  var scene = this._mainWnd.currentSceneW;
  var cam = scene.getCameraRef(name);

  if (cam.src.length==0) {
    // embeded camera (no src prop) --> perform save-as
    this.onCamSaveFileAs(aEvent);
    return;
  }

  // save to the same file as the src property
  if (!scene.saveCameraTo(name, cam.src)) {
    util.alert(window, "Save camera failed!");
    return;
  }
};

/// Load camera from the file
ws.onCamLoadFile = function (aEvent)
{
  var cam = gQm2Main.onLoadCamera();
  if (cam==null)
    return;

  var name = cam.name;
  var scene = this._mainWnd.currentSceneW;

  if (scene.hasCamera(name)) {
    // make a unique name, if the same name exists
    name = util.makeUniqName2(
      function (a) {return "copy"+a+"_"+name; },
      function (a) {return (scene.hasCamera(a)?1:null);} );
  }

  // EDIT TXN START //
  scene.startUndoTxn("Load camera file "+name);
  try {
    scene.setCamera(name, cam);
  }
  catch (e) {
    dd("***** ERROR: Change camera link "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  // apply the loaded camera to the view
  // scene.loadViewFromCam(view.uid, name);
  // also load vis settings...
  this.loadCamImpl(name, true);
};

/// Reload file-linked camera
ws.onCamReloadFile = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var name = elem.obj_id;

  var scene = this._mainWnd.currentSceneW;
  var cam = scene.getCameraRef(name);
  if (cam==null) {
    util.alert(window, "Camera not found");
    return;
  }

  var srcpath = cam.src;
  if (srcpath.length==0) {
    util.alert(window, "This camera is not linked to a file");
    return;
  }

  var newcam;
  try {
    newcam = scene.loadCamera(srcpath);
  }
  catch (e) {
    util.alert(window, "Cannot load camera from file: "+srcpath);
    return;
  }

  // EDIT TXN START //
  scene.startUndoTxn("Reoad camera file "+name);
  try {
  scene.setCamera(name, newcam);
  }
  catch (e) {
    dd("***** ERROR: Change camera link "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

ws.loadCamImpl = function (aCamName, aVisflags)
{
  var scene = this._mainWnd.currentSceneW;
  var view = this._mainWnd.currentViewW;
  if (!scene || !view) return;

  scene.loadViewFromCam(view.uid, aCamName);
  let cam = scene.getCameraRef(aCamName);
  if (aVisflags && cam.vis_size>0) {
    
    // EDIT TXN START //
    scene.startUndoTxn("Load camera "+aCamName+" settings");
    try {
      cam.loadVisSettings(scene);
    }
    catch (e) {
      dd("***** ERROR: Load camera "+e);
      debug.exception(e);
      scene.rollBackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
    
  }
  return;
};

/// Reflect the vissetflags in aCam to the tree-view's icon
ws.updateVisSetFlagIcon = function (aCam)
{
  var id = aCam.name;
  var node = this.findNodeByObjId(id);

  if (aCam.vis_size>0)
    node.props.object_name = "visible";
  else
    node.props.object_name = "";

  this.mViewObj.updateNode( function(elem) {
    return (elem.obj_id==id)?true:false;
  } );
};

ws.saveCamImpl = function (aCamName, aVisflags)
{
  var scene = this._mainWnd.currentSceneW;
  var view = this._mainWnd.currentViewW;
  if (!scene || !view) return;


  // EDIT TXN START //
  scene.startUndoTxn("Change camera "+aCamName);
  try {
    scene.saveViewToCam(view.uid, aCamName);
    if (aVisflags) {
      let cam = scene.getCameraRef(aCamName);
      cam.saveVisSettings(scene);
      // update vissetflags icon
      this.updateVisSetFlagIcon(cam);
    }
  }
  catch (e) {
    dd("***** ERROR: Chg camera "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

ws.onLoadSaveCam = function (aEvent, aLoad, aVisflags)
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="camera") return;

  var scene = this._mainWnd.currentSceneW;
  if (!scene) return;

  if (aLoad)
    this.loadCamImpl(elem.obj_id, aVisflags);
  else
    this.saveCamImpl(elem.obj_id, aVisflags);
};

ws.onClearVisFlags = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="camera") return;

  var scene = this._mainWnd.currentSceneW;
  if (!scene) return;

  let cam = scene.getCameraRef(elem.obj_id);
  if (cam.vis_size==0)
    return;

  let res = util.confirm(window, "Clear visibility flags: "+elem.obj_id);
  if (!res)
    return; // canceled

  // EDIT TXN START //
  scene.startUndoTxn("Clear visibility flags in "+elem.obj_id);
  try {
    cam.clearVisSettings();
  }
  catch (e) {
    dd("***** ERROR: Clear cam visset "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  // update vissetflags icon
  this.updateVisSetFlagIcon(cam);
};

ws.onEditVisFlags = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (elem.type!="camera") return;

  var scene = this._mainWnd.currentSceneW;
  if (!scene) return;

  var args = Cu.getWeakReference({
    "target": scene.getCameraRef(elem.obj_id),
    "scene": scene
    });

  window.openDialog("chrome://cuemol2/content/tools/visflagset-edit-dlg.xul",
                    null,
                    "chrome,modal,resizable=yes,dependent,centerscreen",
                    args);

  // update vissetflags icon
  let cam = scene.getCameraRef(elem.obj_id);
  this.updateVisSetFlagIcon(cam);
};


////////////////////////////////////////////////////
// Style operation

ws.createStyle = function ()
{
  let sceneid = this.mTgtSceneID;
  let scene = cuemol.getScene(sceneid);
  let stylem = cuemol.getService("StyleManager");

  let i, name, set_id = -1;
  for (i=0; ; ++i) {
    name = "style_"+i;
    if (!stylem.hasStyleSet(name, sceneid)) {
      var res = util.prompt(window, "Name for new style: ", name);
      if (res===null)
        return;
      break;
    }
  }

  // EDIT TXN START //
  scene.startUndoTxn("Create style");
  try {
    set_id = stylem.createStyleSet(res, sceneid);
  }
  catch (e) {
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
}

ws.destroyStyle = function (elem)
{
  let irow = this.mViewObj.getSelectedRow();

  let name = elem.name;
  let sceneid = this.mTgtSceneID;
  let scene = cuemol.getScene(sceneid);
  let res = util.confirm(window, "Delete style: "+name);
  if (!res)
    return; // canceled

  let stylem = cuemol.getService("StyleManager");

  // EDIT TXN START //
  scene.startUndoTxn("Destroy style");
  try {
    stylem.destroyStyleSet(sceneid, elem.obj_id);
  }
  catch (e) {
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  // update all
  // stylem.firePendingEvents();
};

ws.showStyleEditor = function (elem)
{
  var argobj = {
  //target: elem.obj_id,
  //target_id: elem.uid,
  target: elem.name,
  target_id: elem.obj_id,
  scene_id: elem.scene_id
  };
  var args = Cu.getWeakReference(argobj);

  var stylestr = "chrome,resizable=yes,dependent,centerscreen";

  var win = gQm2Main.mWinMed.getMostRecentWindow("CueMol2:StyleEditorDlg");
  if (win)
    win.focus();
  else
    window.openDialog("chrome://cuemol2/content/style/style_editor.xul",
                      "", stylestr, args);
};

ws.onStyToggleRo = function (event)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem)
    return;

  // system styles is not editable
  if (elem.scene_id==0)
    return;

  let stylem = cuemol.getService("StyleManager");
  let styleset = stylem.getStyleSet(elem.obj_id);

  if (styleset.readonly)
    styleset.readonly = false;
  else {
    // read/write --> read-only
    // modified style cannot be changed to read-only mode!!
    if (styleset.modified)
      alert("Modified styles cannot be changed to read-only mode.");
    else
      styleset.readonly = true;
  }
};

/// Save style to new file (save-as)
ws.onStySaveFileAs = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var uid = elem.obj_id;

  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.appendFilter("Style file (*.xml)", "*.xml");

  if (elem.name!="(anonymous)")
    fp.defaultString = elem.name;
  fp.defaultExtension = "*.xml";
  
  fp.init(window, "Save style to file", nsIFilePicker.modeSave);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return;

  let path = fp.file.path;
  res = util.splitFileName2(path, "*.xml");
  if (res)
    path = res.path;

  ////////////////////////
  dd("save style to file: "+path);

  let scene = cuemol.getScene(this.mTgtSceneID);
  let stylem = cuemol.getService("StyleManager");
  let result = false;

  // EDIT TXN START //
  scene.startUndoTxn("Change style's source");
  try {
    result = stylem.saveStyleSetToFile(this.mTgtSceneID, uid, path);
  }
  catch (e) {
    dd("***** ERROR: Change style's source "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  if (!result) {
    util.alert(window, "Save style file failed!");
    return;
  }

  ////////////////////////
  // saved style becomes the file-linked item

  let node = this.findNodeByObjId(uid);
  if (node==null)
    return;
  node.props.object_vis = "linked";

  this.mViewObj.updateNode( function(elem) {
    return (elem.obj_id==name)?true:false;
  } );
};

/// Save style to file (ovw)
ws.onStySaveFile = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;

  let stylem = cuemol.getService("StyleManager");
  let srcpath = stylem.getStyleSetSource(id);
  if (srcpath.length==0) {
    // embeded style (no src prop) --> perform save-as
    this.onStySaveFileAs(aEvent);
    return;
  }

  if (!stylem.saveStyleSetToFile(this.mTgtSceneID, id, srcpath)) {
    util.alert(window, "Save style file failed!");
    return;
  }
  
};

/// Load style from the file
ws.onStyLoadFile = function (aEvent)
{
  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.appendFilter("Style file (*.xml)", "*.xml");

  fp.init(window, "Open style file", nsIFilePicker.modeOpen);

  let res=fp.show();
  if (res==nsIFilePicker.returnCancel)
    return;

  let path = fp.file.path;
  res = util.splitFileName2(path, "*.xml");
  if (res)
    path = res.path;

  //////////////////////
  dd("load style from file: "+path);

  let scene_id = this.mTgtSceneID;
  let stylem = cuemol.getService("StyleManager");

  // Load style file (In default, the external styles should be loaded as read-only.)
  if (stylem.loadStyleSetFromFile(scene_id, path, true)<0) {
    util.alert(window, "Open style file failed!");
    return;
  }

  // update scene's tree UI
  this.mViewObj.saveOpenState(scene_id);
  this.syncContents(scene_id);

  // update all
  stylem.firePendingEvents();
};

/// Reload style (link to the file)
ws.onStyReloadFile = function (aEvent)
{
  // TO DO: impl ??
  alert("Not implemented!!");
};

//
// Change renderer type impl
//

ws.onChgRendTypeShowing = function (aEvent)
{
  try {
    // clear the popup menu
    let menu = aEvent.currentTarget.menupopup;
    util.clearMenu(menu);

    let elem = this.mViewObj.getSelectedNode();
    //dd("elem.type_name="+elem.type_name);

    if (elem.type!="renderer") return;

    let rend = this.getSelectedRend();
    if (rend==null) return;

    let obj = rend.getClientObj();
    if (obj==null) return;

    // skip special renderers
    let rendtype = rend.type_name;
    if (rendtype.startsWith("*") && rendtype!="*selection")
      return;
    if (rendtype=="atomintr"||rendtype=="disorder")
      return;

    // enumerate the compatible renderer names
    let rend_types = obj.searchCompatibleRendererNames().split(",");
    dd("supported rend types="+rend_types);
    //cuemolui.populateStyleMenus(this.mTgtSceneID, menu, regex, true);

    // setup the popup menu
    let nitems = rend_types.length;
    let name, value, label, res;
    for (let i=0; i<nitems; ++i) {
      name = rend_types[i];
      if (name==rendtype || name.startsWith("*") || name=="atomintr" || name=="disorder")
        continue;
      let item = util.appendMenu(document, menu, name, name);
      dd("ChgRendTypeAddMenu = "+name+", desc="+label);
    }
    
  } catch (e) { debug.exception(e); }
};

ws.chgRendType = function (aEvent)
{
  let rend = this.getSelectedRend();
  if (rend==null)
    return;
  let obj = rend.getClientObj();
  if (obj==null)
    return;
  
  let newtype = aEvent.target.value;
  let scene = rend.getScene();
  
  if (rend.type_name=="*selection") {
    // conv sel to others
    let result = new Object();
    result.obj_id = obj.uid;
    result.rendtype = newtype;
    result.sel = rend.sel;
    result.ok = true;
    result.center = false;
    
    let sgnm = util.makeUniqName2(
      function (a) {return newtype+a; },
      function (a) {return scene.getRendByName(a);} );

    result.rendname = sgnm;

    // EDIT TXN START //
    scene.startUndoTxn("Conv sel to rend");
    try {
      gQm2Main.doSetupRend(scene, result);
    }
    catch (e) {
      dd("Fatal error in changeRendType() for selection: "+e);
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
    return;
  }
    
  let xmldat = gQm2Main.mStrMgr.toXML2(rend, newtype);

  let newrend = gQm2Main.mStrMgr.fromXML(xmldat, scene.uid);
  gQm2Main.setDefaultStyles(obj, newrend);

  // EDIT TXN START //
  scene.startUndoTxn("Change rend type");
  
  try {
    gQm2Main.deleteRendByID(rend.uid);
    obj.attachRenderer(newrend);
  }
  catch (e) {
    dd("Fatal error in changeRendType(): "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

//////////////////////////////////
// renderer group

ws.onNewRendGrp = function (aEvent)
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;

  dd("onNewRendGrp> elem.type="+elem.type);
  if (elem.type!="object")
    return;

  var id = elem.obj_id;

  var scene = this._mainWnd.currentSceneW;
  var sgnm = util.makeUniqName2(
    function (a) {return "group"+a; },
    function (a) {return scene.getRendByName(a);} );

  dd("suggested name="+sgnm);

  var grpname = util.prompt(window, "Name for new group: ", sgnm);
  if (grpname===null) return;

  var obj = scene.getObject(id);

  // EDIT TXN START //
  scene.startUndoTxn("Create renderer group: "+grpname);
  try {
    var rend = obj.createRenderer("*group");
    rend.name = grpname;
  }
  catch (e) {
    dd("***** ERROR: Create rend grp "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

ws.onRenameRendGrp = function ()
{
  var elem = this.mViewObj.getSelectedNode();
  if (!elem) return;

  dd("onRenameRendGrp> elem.type="+elem.type);
  if (elem.type!="rendGroup")
    return;

  var grpname = util.prompt(window, "Change rend group name: ", elem.orig_name);
  if (grpname===null) return;
  if (grpname==elem.orig_name) return;

  var scene = this._mainWnd.currentSceneW;
  var rendgrp = cuemol.getRenderer(elem.obj_id);
  var rends = new Array();
  for (var i=0; i<elem.childNodes.length; ++i) {
    rends.push( cuemol.getRenderer(elem.childNodes[i].obj_id) );
  }

  // EDIT TXN START //
  scene.startUndoTxn("Change rend group name: "+grpname);
  try {
    rendgrp.name = grpname;
    for (var i=0; i<rends.length; ++i)
      rends[i].group = grpname;
  }
  catch (e) {
    dd("***** ERROR: Create rend grp "+e);
    debug.exception(e);
    scene.rollBackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

ws.toggleVisibleRendGrp = function (aElem)
{
  if (aElem.type!="rendGroup")
    return;

  var scene = cuemol.getScene(this.mTgtSceneID);
  var rendgrp = cuemol.getRenderer(aElem.obj_id);
  var rends = new Array();
  for (var i=0; i<aElem.childNodes.length; ++i) {
    rends.push( cuemol.getRenderer(aElem.childNodes[i].obj_id) );
  }

  // EDIT TXN START //
  scene.startUndoTxn("Change group visibility");
  try {
    rendgrp.visible = !rendgrp.visible;
    for (var i=0; i<rends.length; ++i)
      rends[i].visible = rendgrp.visible;
  }
  catch (e) {
    dd("***** ERROR: Change group visibility "+e);
    debug.exception(e);
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};


} )();

}

