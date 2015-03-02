// -*-Mode: C++;-*-
//
// Visibility flag set editor
//

( function () {

  var dlg = window.gDlgObj = new Object();
  
  // create widget objects
  dlg.mTreeView = new cuemolui.TreeView(window, "visset-list-tree");
  dlg.mTreeView.clickHandler = function (ev, row, col) {
    dlg.onTreeItemClick(ev, row, col);
  }

  //dlg.mOthView = new cuemolui.TreeView(window, "others-list-tree");
  //dlg.mOthView.clickHandler = function (ev, row, col) {
  //dlg.onTreeItemClick(ev, row, col);
  //}

  // process input arguments
  var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
  args.bOK = false;
  dlg.mCam = args.target;
  dlg.mScene = args.scene;

  // set onLoad handler
  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);} }, false);

  dlg.onLoad = function ()
  {
    this.getData();
    this.buildNodes(this.mTreeView, true);
    // this.buildNodes(this.mOthView, false);
    dd("VfsEditDlg> onLoad OK.");
  };
  
  dlg.getData = function (aTreeView)
  {
    var json = this.mCam.getVisSetJSON();
    dd("VfsEditDlg> json="+json);
    try {
      this.mVSet = JSON.parse(json);
    }
    catch (e) { debug.exception(e); return;}

    json = this.mScene.getObjectTreeJSON();
    // dd("VfsEditDlg> json="+json);
    try {
      this.mObjData = JSON.parse(json);
    }
    catch (e) { debug.exception(e); return;}
  };

  dlg.buildNodes = function (aTreeView, aTgt)
  {
    var nodes = new Array();
    var j, nobjs = this.mObjData.length;
    for (j=1; j<nobjs; ++j) {
      let obj = this.mObjData[j];

      let node = this.setupNodeImpl(obj, "object");

      var i, nrends = obj.rends.length;
      if (nrends>0) {
	node.childNodes = new Array();
	for (i=0; i<nrends; ++i) {
	  let rend = obj.rends[i];

          let rnode = this.setupNodeImpl(rend, "renderer");

	  node.childNodes.push(rnode);
	}
      }
      nodes.push(node);
    }
    
    aTreeView.setData(nodes);
    aTreeView.buildView();
  }

  dlg.setupNodeImpl = function (aObj, aTypeName)
  {
    let id = aObj.ID;
    let vs = this.mVSet[id];
    let incl = false;
    if (vs)
      incl = vs.include;
    let vis = false;
    if (vs && vs.visible)
      vis = true;

    let node = new Object();
    node.name = aObj.name;
    if (node.name.length==0)
      node.name = "(noname)";
    node.name += " ("+aObj.type+")";
    node.collapsed = false;
    node.obj_id = id;
    node.type = aTypeName;
    node.props = {
      "treecol_vis": (vis)?"visible":"invisible",
    };
    node.values = {
        "treecol_inc": incl?"true":"false",
    };
    if (!incl) {
      node.props.treecol_vis = "invisible";
      node.props.treecol_objrend = "disabled";
    }

    return node;
  };

  dlg.onTreeItemClick = function(aEvent, aRow, aCol)
  {
    try {
      //dd("clicked!!");
      if (aCol=="treecol_vis") {
        this.toggleVisible(aRow);
      }
      else if (aCol=="treecol_inc") {
        this.toggleIncl(aRow);
      }
    }
    catch (e) {
      debug.exception(e);
    }
  }

  dlg.toggleVisible = function (aElem)
  {
    var id = aElem.obj_id;
    dd("id="+id);
    var vs = this.mVSet[id];
    if (!vs)
      return;

    dd("vs="+vs.visible);
    vs.visible = !vs.visible;

    this.mTreeView.saveSelection();
    this.buildNodes(this.mTreeView, true);
    this.mTreeView.restoreSelection();

  };

  dlg.toggleIncl = function (aElem)
  {
    var id = aElem.obj_id;
    dd("id="+id);
    var vs = this.mVSet[id];

    if (!vs) {
      // newly included to the flagset:
      //   create entry
      this.mVSet[id] = {
        "include": true,
	"uid": id,
	"visible": false,
	"type": aElem.type,
      };
    }
    else {
      this.mVSet[id].include = !this.mVSet[id].include;
    }

    this.mTreeView.saveSelection();
    this.buildNodes(this.mTreeView, true);
    this.mTreeView.restoreSelection();

  };
  
  /// onDialogAccept event handler
  dlg.onDialogAccept = function(event)
  {
    var scene = this.mScene;
    var cam = this.mCam;

    // EDIT TXN START //
    scene.startUndoTxn("Change visflags of "+this.mCam.name);
    
    try {
      this.mCam.clearVisSettings();
      for (let i in this.mVSet) {
	let vs = this.mVSet[i];
	dd("visAppend vs="+debug.dumpObjectTree(vs));
	if (vs.include) {
	  if (vs.type=="object")
	    this.mCam.visAppend(vs.uid, vs.visible, true);
	  else
	    this.mCam.visAppend(vs.uid, vs.visible, false);
	}
      }
    }
    catch (e) {
      dd("Change camera's visflags Error!!");
      debug.exception(e);
      scene.rollbackUndoTxn();
      args.bOK = false;
      return false;
    }

    scene.commitUndoTxn();
    // EDIT TXN END //
    
    args.bOK = true;
    return true;
  }

} )();

