// -*-Mode: C++;-*-
//
// object-menulist.js: XUL menulist widget utility class for objects
//
// $Id: object-menulist.js,v 1.19 2011/04/03 11:11:06 rishitani Exp $
//

if (!("evtMgr" in cuemol))
  cuemol.evtMgr = require("event").manager;

if (!("ObjMenuList" in cuemolui)) {

cuemolui.ObjMenuList = ( function () {

// constructor
var ctor = function (id, aWindow, aFilterFn, aFilter)
{
  this._data = null;
  
  this._tgtid = id;
  this._tgtWnd = aWindow;
  this._widget = null;
  this._filterFn = aFilterFn;
  this._tgt_filter = aFilter;

  this._tgtSceID = -1;
  this._callbackID = null;
  this._callbackID2 = null;
  this._tabMolView = null;

  this._propChgLsnrs = new Object();
  this._changeLsnrs = new Object();

  // pre-selected ID/Name
  // (store ID or Name, when select*() method is called before the onLoad initialization)
  this._preSelectedID = null;
  this._preSelectedName = null;

  // selection UID history table for each scene (scene->UID hash)
  this.mSelHisTab = new Object();
  
  // dd("ObjMenuList> ctor filterFn="+this._filterFn+", srcFilter="+this._tgt_filter);

  // attach to the load/unload event for the target document/window
  var that = this;
  aWindow.addEventListener("load",
                           function () { try {that._onLoad();} catch (e) {debug.exception(e);} },
                           false);
  aWindow.addEventListener("unload", function() {that._onUnLoad();}, false);

}

/////////////////////////////////////

// private initialization routine
ctor.prototype._onLoad = function ()
{
  this._widget = document.getElementById(this._tgtid);
  var that = this;

  if (this._tgtSceID<0) {
    // automatic mode
    // --> list shows the content of the scene selected in the main tabmolview
    var tabv = this._tabMolView = document.getElementById("main_view");
    this._tgtSceID = tabv.currentSceneW.uid;
    tabv.mPanelContainer.addEventListener("select", function(aEvent) { try {
      that._tabSelChanged();
    } catch (e) {debug.exception(e)}}, false);
  }
  else {
    // fixed mode
    // --> list shows the specified scene's content
    dd("ObjMenuList> Fixed mode tgt="+this._tgtSceID);
  }
  
  // initial attach to the current target
  dd("ObjMenuList> attachScene = "+this._tgtSceID);
  this.attachScene(this._tgtSceID);

  //dd("_onLoad reload()");
  this.reload();

  this._widget.addEventListener("select", function(aEvent) { try {
    that._onListSelChanged();
  } catch (e) {debug.exception(e)}}, false);

  // no item in the list
  if (this._widget.itemCount==0)
    return;

  if (this._preSelectedID) {
    this.selectObject(this._preSelectedID);
  }
  else if (this._preSelectedName) {
    this.selectObjectByName(this._preSelectedName);
  }
  else {
    // no preselected ID/Name
    // --> select the first item (default)
    this._widget.selectedIndex = 0;
  }
}

ctor.prototype._onUnLoad = function ()
{
  this.detachScene(this._tgtSceID);
  
  this._tgtid = null;
  this._tgtWnd = null;
  this._filterFn = null;
  this._tgt_filter = null;
  this._tgtSceID = -1;
  this._callbackID = null;
  this._callbackID2 = null;
  this._tabMolView = null;
}

ctor.prototype._tabSelChanged = function ()
{
  if (!this._tabMolView) return;
  var scene = this._tabMolView.currentSceneW;
  if (scene.uid == this._tgtSceID)
    return;

  var old_scid = this._tgtSceID;
  var old_sel = this.getSelectedID();
  // save current selection to per-scene selection history table
  this.mSelHisTab[old_scid] = old_sel;

  this.detachScene(old_scid);

  var new_scid = scene.uid;
  this._tgtSceID = new_scid;

  this.attachScene(new_scid);

  this.reload();

  // no item in the list
  if (this._widget.itemCount==0)
    return;

  var ind = this.getIndexByID(this.mSelHisTab[new_scid]);
  if (ind===null) {
    // select the first entry
    this._widget.selectedIndex = 0;
  }
  else {
    // if selection history exists, select the previous item
    this._widget.selectedIndex = ind;
  }
}

ctor.prototype._onListSelChanged = function (aEvent)
{
  if (this._widget.selectedItem) {
    var label = this._widget.selectedItem.label;
    this._widget.setAttribute("tooltiptext", label);
  }
}


ctor.prototype.addPropChgListener = function (aName, aFn)
{
  this._propChgLsnrs[aName] = aFn;
}

ctor.prototype.addObjChgListener = function (aName, aFn)
{
  this._changeLsnrs[aName] = aFn;
}

ctor.prototype.attachScene = function (aSceID)
{
  // attach to the new active scene
  // window.alert("XXX getScnene" + scid);

  //if (!this._callbackID && scene)
  //this._callbackID = scene.addListener(new SceneEventListener(this));

  if (this._callbackID || aSceID<0)
    return;

  var that = this;
  var handler = function (args) {
    switch (args.evtType) {
    case cuemol.evtMgr.SEM_ADDED:
      // SCE_OBJ_ADDED
      var prev_id = that.getSelectedID();

      that.reload();

      // set selection after appending
      if (prev_id==null) {
        // no prev sel --> select appended item
        that.selectObject(args.obj.target_uid);
      }
      else {
        // select the previous selection
        that.selectObject(prev_id);
      }
      break;

    case cuemol.evtMgr.SEM_REMOVING:
      // SCE_OBJ_REMOVING
      that.removeObject(args.obj.target_uid);
      break;

    case cuemol.evtMgr.SEM_PROPCHG:
      // dd("%%%% ObjMenuList("+that._tgtid+").notify PROPCHG target="+args.obj.target_uid);
      var propname = args.obj.propname;
      if (propname=="name") {
        // SCE_OBJ_PROPCHG (name)
        that.setName(args.obj.target_uid);
      }
      // check for specific listener
      if (propname in that._propChgLsnrs) {
        // dd("ObjMenu> PropChanged, call ("+propname+") listener");
        var fn = that._propChgLsnrs[propname];
        fn();
      }
      // check for any listener
      if ('*' in that._propChgLsnrs) {
        // dd("ObjMenu> PropChanged, call any(*) listener");
        var fn = that._propChgLsnrs['*'];
        fn(args);
      }
      break;

    case cuemol.evtMgr.SEM_CHANGED:
      var mthname = args.method;
      // check for specific listener
      if (mthname in that._changeLsnrs) {
        // dd("ObjMenu> Changed, call ("+mthname+") listener");
        var fn = that._changeLsnrs[mthname];
        fn();
      }
      break;
    }
  };
  
  //dd("ObjectMenu> cuemol.evtMgr.addListener srcFilter="+this._tgt_filter);
  if (!this._tgt_filter) {
    // dd("ObjectMenu> srcFilter is not set --> ANY!!");
    this._tgt_filter = cuemol.evtMgr.SEM_ANY;
  }

  // Renderer menulist must listen the object's event,
  // since the rendere's label also contains object's name.
  var flt = this._tgt_filter;
  if (flt&cuemol.evtMgr.SEM_RENDERER)
    flt |= cuemol.evtMgr.SEM_OBJECT;

  this._callbackID = cuemol.evtMgr.addListener(
    "",
    flt, // target type
    cuemol.evtMgr.SEM_ANY, // event type
    aSceID, // source UID
    handler);

  // Add deserialization completion event handler
  this._callbackID2 = cuemol.evtMgr.addListener(
    "",
    cuemol.evtMgr.SEM_SCENE,
    cuemol.evtMgr.SEM_CHANGED, // event type
    aSceID, // source UID
    function (args) {
      if (args.method=="sceneLoaded" ||
          args.method=="sceneAllCleared") {
        // deserialized from qsc file
        //dd("ObjMenuList.notify> Reload all data");
        that.reload();
        
        // set selected item
        if (that._widget.itemCount==0)
          return;
        that._widget.selectedIndex = 0;
      }
    });
}

ctor.prototype.detachScene = function (aSceID)
{
  if (this._callbackID)
    cuemol.evtMgr.removeListener(this._callbackID);
  this._callbackID = null;

  if (this._callbackID2)
    cuemol.evtMgr.removeListener(this._callbackID2);
  this._callbackID2 = null;
}

ctor.prototype.reload = function ()
{
  var scene = cuemol.getScene(this._tgtSceID);
  if (!scene) {
    //dd("ObjectMenuList> reload(), invalid scene ID: "+this._tgtSceID);
    return;
  }

  var json_str = scene.getObjectTreeJSON();
  var data;
  try {
    data = JSON.parse(json_str);
  }
  catch (e) {
    dd("error : "+json_str);
    debug.exception(e);
    return;
  }

  var i, nlen = data.length;
  var node, elem;
  this._data = new Array();

  // objects and renderers
  for (i=1; i<nlen; ++i) {
    elem = data[i];
    elem.cat = "obj";

    if (this._tgt_filter&cuemol.evtMgr.SEM_OBJECT) {
      if (this._filterFn && this._filterFn(elem)) {
        node = new Object();
        node.uid = elem.ID;
        node.name = elem.name;
        node.type = "object";
        this._data.push(node);
      }
    }

    /*try {
    dd("ObjMenuList> object "+elem.name);
    dd("ObjMenuList>   rend len="+elem.rends.length);
    dd("ObjMenuList>   rend="+elem.rends);
    } catch (e) {}*/

    if (this._tgt_filter&cuemol.evtMgr.SEM_RENDERER &&
        elem.rends && elem.rends.length>0) {
      let j, njlen = elem.rends.length;
      for (j=0; j<njlen; ++j) {
        let rend = elem.rends[j];
        rend.cat = "rend";

        if (this._filterFn && this._filterFn(rend)) {
          node = new Object();
          node.uid = rend.ID;
          node.name = elem.name+"/"+rend.name;
          node.type = "renderer";
          this._data.push(node);
        }
      }
    }
  }
  
  // dd("=== ObjMenu("+this._tgtid+") reloading");

  this._widget.removeAllItems();
  var nobjs = this._data.length;

  if (nobjs==0) {
    this._widget.disabled = true;
    this.fireChangeEvent();
    return;
  }
  this._widget.disabled = false;

  for (var i=0; i<nobjs; ++i) {
    var uid = this._data[i].uid;
    var name = this._data[i].name;
    var item = this._data[i].item = this._widget.appendItem(name, uid);
    //item.setAttribute("tooltiptext", name);
    //dd("RELOAD "+this._tgtid+": ITEM="+name+", uid="+uid);
  }
  this.fireChangeEvent();
}

ctor.prototype.getIndexByID = function (aId)
{
  if (this._data==null)
    return null;

  if (aId==undefined || aId===null)
    return null;
  
  var i, nobjs = this._data.length;
  for (i=0; i<nobjs; ++i) {
    if (this._data[i].uid == aId) {
      return i;
    }
  }

  //dd("ObjectMenu.getItemByID> obj "+aId+": not found!!");
  return null;
}

ctor.prototype.getIndexByName = function (aName)
{
  if (this._data==null)
    return null;

  if (aName==undefined || aName===null)
    return null;
  
  var i, nobjs = this._data.length;
  for (i=0; i<nobjs; ++i) {
    if (this._data[i].name == aName) {
      return i;
    }
  }

  return null;
}

ctor.prototype.removeObject = function (aId)
{
  var old_sel_id = this.getSelectedID();

  var i = this.getIndexByID(aId);
  if (i===null) {
    dd("ObjMenuList.removeObject> FAILED!!; "+aId);
    return;
  }

  this._widget.removeItemAt(i);
  this._data.splice(i, 1);

  var nitem = this._widget.itemCount;
  if (nitem==0) {
    this._widget.removeAllItems();
    this._widget.disabled=true;
    this.fireChangeEvent();
    return;
  }

  if (old_sel_id==aId) {
    if (i<nitem) {
      this._widget.selectedIndex = i;
    }
    else {
      this._widget.selectedIndex = nitem-1;
    }
  }
  this.fireChangeEvent();
}

ctor.prototype.fireChangeEvent = function ()
{
  var changeEvent = document.createEvent("Events");
  changeEvent.initEvent("change", true, true);
  changeEvent.itemCount = this._widget.itemCount;
  this._widget.dispatchEvent(changeEvent);
}

ctor.prototype.selectObject = function (aId)
{
  if (this._data==null || this._widget==null) {
    dd("ObjectMenu> preSelectedID is set: "+aId);
    this._preSelectedID = aId;
    return false;
  }

  var i = this.getIndexByID(aId);
  if (i===null) return false;
  var item = this._widget.getItemAtIndex(i);
  if (item===null) return false;

  this._widget.selectedItem = item;
  return true;
}

ctor.prototype.selectObjectByName = function (aName)
{
  if (this._data==null || this._widget==null) {
    dd("ObjectMenu> preSelectedName is set: "+aName);
    this._preSelectedName = aName;
    return false;
  }
  
  var i = this.getIndexByName(aName);
  if (i===null) return false;
  var item = this._widget.getItemAtIndex(i);
  if (item===null) return false;
  this._widget.selectedItem = item;
  return true;
}


ctor.prototype.setName = function (aId)
{
  var obj = cuemol.getObject(aId);

  if (obj) {
    if (this._tgt_filter==cuemol.evtMgr.SEM_RENDERER) {
      // renderer label contains parent object's name,
      // so we have to change all child renderers
      var nsize = obj.getRendCount();
      for (var j=0; j<nsize; ++j) {
        var rend = obj.getRendererByIndex(j);
        this.setName(rend.uid);
      }
      return;
    }
    else
      var name = obj.name;
  }
  else {
    var rend = cuemol.getRenderer(aId);
    if (!rend) 
      return;
    obj = rend.getClientObj();
    name = obj.name+"/"+rend.name;
  }

  var i = this.getIndexByID(aId);
  var item = this._widget.getItemAtIndex(i);
  if (i===null || item===null) {
    dd("ObjMenu("+this._tgtid+") setName faild; id="+aId+" not found!!");
    return;
  }
  this._data[i].name = name;
  item.label = name;
  //item.setAttribute("tooltiptext", name);
  //alert("set tooltiptest: "+item.getAttribute("tooltiptext"));
  if (item.selected)
    this._widget.setAttribute("tooltiptext", name);
}

ctor.prototype.addSelChanged = function (fn)
{
  if (this._widget==null)
    this._widget = document.getElementById(this._tgtid);

  this._widget.addEventListener("select", fn, false);
}

ctor.prototype.getSelectedID = function ()
{
  var seli = this._widget.selectedIndex;

  if (seli<0)
    return null;

  return this._data[seli].uid;
}

ctor.prototype.getSelectedObj = function ()
{
  var seli = this._widget.selectedIndex;

  if (seli<0)
    return null;

  var id = this._data[seli].uid;
  var type = this._data[seli].type;
  var obj = null;
  
  if (type=="object") {
    obj = cuemol.getObject(id);
    if (!obj)
      return null;
  }
  else if (type=="renderer") {
    obj = cuemol.getRenderer(id);
    if (!obj)
      return null;
  }

  return obj;
}

ctor.prototype.getItemCount = function ()
{
  return this._widget.itemCount;
}

return ctor;

} )();

}

