// -*-Mode: C++;-*-
//
// Visibility flag set editor
//

( function () {

  var dlg = window.gDlgObj = new Object();
  
  dlg.mTreeView = new cuemolui.TreeView(window, "visset-list-tree");
  dlg.mTreeView.clickHandler = function (ev, row, col) {
    dlg.onTreeItemClick(ev, row, col);
  }

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
    this.buildData();
    dd("VfsEditDlg> onLoad OK.");
  };
  
  dlg.buildData = function ()
  {
    var nodes = new Array();
    var vset, objtr;
    var json = this.mCam.getVisSetJSON();
    dd("VfsEditDlg> json="+json);
    try {
      vset = JSON.parse(json);
    }
    catch (e) { debug.exception(e); return;}

    json = this.mScene.getObjectTreeJSON();
    dd("VfsEditDlg> json="+json);
    try {
      objtr = JSON.parse(json);
    }
    catch (e) { debug.exception(e); return;}

    var nodes = new Array();
    var j, nobjs = objtr.length;
    for (j=1; j<nobjs; ++j) {
      let obj = objtr[j];

      let node = new Object();
      node.name = obj.name;
      if (node.name.length==0)
	node.name = "(noname)";
      node.name += " ("+obj.type+")";
      node.collapsed = false;
      node.obj_id = obj.ID;
      node.type = "object";
      node.props = {
	"treecol_vis": (obj.visible)?"visible":"invisible",
      };
      
      var i, nrends = obj.rends.length;
      if (nrends>0) {
	node.childNodes = new Array();
	for (i=0; i<nrends; ++i) {
	  let rend = obj.rends[i];
	  let rnode = new Object();
	  
	  rnode.name = rend.name;
	  rnode.name += " ("+rend.type+")";
	  rnode.obj_id = rend.ID;
	  rnode.type = "renderer";
	  rnode.props = {
	    "treecol_vis": (rend.visible)?"visible":"invisible",
	  };

	  node.childNodes.push(rnode);
	}
      }
      nodes.push(node);
    }
    
    this.mTreeView.setData(nodes);
    this.mTreeView.buildView();
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

