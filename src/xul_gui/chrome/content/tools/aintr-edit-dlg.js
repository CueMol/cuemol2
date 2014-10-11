// -*-Mode: C++;-*-
//
// Atom interaction list editor
//
// $Id: aintr-edit-dlg.js,v 1.2 2011/03/24 13:24:41 rishitani Exp $
//

( function () {

  var dlg = window.gDlgObj = new Object();
  
  dlg.mTreeView = new cuemolui.TreeView(window, "intr-list-tree");
  dlg.mTreeView.clickHandler = function (ev, row, col) {
    dlg.onTreeItemClick(ev, row, col);
  }

  var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
  args.bOK = false;

  //dlg.mTgtRend = args.target;
  var rend = args.target;
  dlg.mTgtObj = rend.getClientObj();
  var i, nrend = dlg.mTgtObj.getRendCount();
  dlg.mTgtRends = new Array();
  for (i=0; i<nrend; ++i) {
    rend = dlg.mTgtObj.getRendererByIndex(i);
    if (rend.type_name === "atomintr")
      dlg.mTgtRends.push(rend);
  }

  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);} }, false);

  dlg.onLoad = function ()
  {
    document.getElementById("mol-name").value = this.mTgtObj.name;
    this.mDelBtn = document.getElementById("delete-btn");
    this.mDelBtn.addEventListener("command", function(){
      try {dlg.onDeleteCmd();} catch (e) {debug.exception(e);} }, false);

    this.buildData();
    dd("AintrEditDlg> onLoad OK.");
  }

  dlg.buildData = function ()
  {
    var nodes = new Array();

    var j, nrends = this.mTgtRends.length;
    for (j=0; j<nrends; ++j) {
      var rend = this.mTgtRends[j];
      var json = rend.getDefsJSON();
      dd("AintrEditDlg> json="+json);
      try {
        var obj = JSON.parse(json);
      }
      catch (e) { debug.exception(e); return;}

      node = new Object();
      node.name = rend.name;
      if (node.name.length==0)
        node.name = "(noname)";
      node.collapsed = false;
      node.obj_id = rend.uid;
      node.type = "rend";
      
      var i, nlen = obj.length;
      if (nlen>0) {
        node.childNodes = new Array();
        for (i=0; i<nlen; ++i) {
          var rnode = new Object();
          var obji = obj[i];
          rnode.id = obji.id;
          rnode.rend_id = rend.uid;
          rnode.type = "aidat";
          rnode.name = obji.a0;
          rnode.values = new Object();
          rnode.values.treecol_atom1 = obji.a1;
          if (obji.mode>1) {
            rnode.values.treecol_atom2 = obji.a2;
            if (obji.mode>2) {
              rnode.values.treecol_atom3 = obji.a3;
            }
          }
          node.childNodes.push(rnode);
        }
      }
      nodes.push(node);
    }
    
    this.mTreeView.setData(nodes);
    this.mTreeView.buildView();
  }

  //////////

  dlg.onTreeItemClick = function(aEvent, aRow, aCol)
  {
  }

  dlg.onDeleteCmd = function()
  {
    var elem = this.mTreeView.getSelectedNode();
    if (!elem) return;
    if (elem.type!="aidat")
      return;
    var rend_id = elem.rend_id;
    var id = elem.id;

    var rend = cuemol.getRenderer(rend_id);
    var scene = rend.getScene();

    // EDIT TXN START //
    scene.startUndoTxn("Remove label(s)");

    try {
      rend.remove(id);
    }
    catch(e) {
      dd("DefineDistLabel Error!!");
      debug.exception(e);
      scene.rollbackUndoTxn();

      delete scene;
      delete rend;
      return;
    }
    
    scene.commitUndoTxn();
    // EDIT TXN END //

    this.buildData();
  }

  dlg.onDialogAccept = function(event)
  {
    args.bOK = true;
    return true;
  }

} )();

