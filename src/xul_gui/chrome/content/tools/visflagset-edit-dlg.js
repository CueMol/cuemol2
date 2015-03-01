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
      let vs = this.mVSet[obj.ID];
      let vis = false;
      if (vs && vs.visible)
        vis = true;

      let node = new Object();
      node.name = obj.name;
      if (node.name.length==0)
	node.name = "(noname)";
      node.name += " ("+obj.type+")";
      node.collapsed = false;
      node.obj_id = obj.ID;
      node.type = "object";
      node.props = {
        "treecol_vis": (vis)?"visible":"invisible",
        "treecol_inc": vs?"true":"false",
      };
      
      var i, nrends = obj.rends.length;
      if (nrends>0) {
	node.childNodes = new Array();
	for (i=0; i<nrends; ++i) {
	  let rend = obj.rends[i];
          let vs = this.mVSet[rend.ID];
          let vis = false;
          if (vs && vs.visible)
            vis = true;

	  let rnode = new Object();
	  rnode.name = rend.name;
	  rnode.name += " ("+rend.type+")";
	  rnode.obj_id = rend.ID;
	  rnode.type = "renderer";
	  rnode.props = {
	    "treecol_vis": (vis)?"visible":"invisible",
            "treecol_inc": vs?"true":"false",
	  };

	  node.childNodes.push(rnode);
	}
      }
      nodes.push(node);
    }
    
    aTreeView.setData(nodes);
    aTreeView.buildView();
  }

  dlg.onTreeItemClick = function(aEvent, aRow, aCol)
  {
  }

  /// onDialogAccept event handler
  dlg.onDialogAccept = function(event)
  {
    args.bOK = true;
    return true;
  }

} )();

