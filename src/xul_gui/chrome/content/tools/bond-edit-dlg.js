// -*-Mode: C++;-*-
//
// Non-standard bond editor
//

( function () {

  var dlg = window.gDlgObj = new Object();
  
  dlg.mTreeView = new cuemolui.TreeView(window, "bond-list-tree");

  dlg.mTreeView.clickHandler = function (ev, row, col)
  {
    dlg.onTreeItemClick(ev, row, col);
  }

  var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
  args.bOK = false;

  dlg.mTgtSceID = args.scene_id;

  dlg.mSelector = new cuemolui.ObjMenuList(
    "mol_object_selector", window,
    function (elem) {
      if ( cuemol.implIface(elem.type, "MolCoord") ) return true;
      return false;
    },
    cuemol.evtMgr.SEM_OBJECT);

  dlg.mSelector._tgtSceID = dlg.mTgtSceID;
  
  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  },
                          false);

  ////////////////////////////////////////////////////////////

  dlg.onLoad = function ()
  {
    var that = this;
    this.mSelector.addSelChanged(function(aEvent) {
      that.targetChanged(aEvent);
    });
    this.buildData();

    this.mDelBtn = document.getElementById("delete-btn");
    this.mDelBtn.addEventListener("command", function (a) { that.onDeleteCmd(a) }, false);

    this.mAddBtn = document.getElementById("add-btn");
    this.mAddBtn.addEventListener("command", function (a) { that.onAddCmd(a) }, false);

    this.mTextAid1 = document.getElementById("text-aid1");
    this.mTextAid1.addEventListener("focus", function (a) { that.onFocusAidText(a) }, false);
    this.mTextAid2 = document.getElementById("text-aid2");
    this.mTextAid2.addEventListener("focus", function (a) { that.onFocusAidText(a) }, false);
  };

  ////////////////////////////////////////////////////////////

  dlg.targetChanged = function (aEvent)
  {
    this.buildData();
  };

  dlg.buildData = function ()
  {
    var mol = this.mSelector.getSelectedObj();
    if (!mol) return;
    
    var mgr = cuemol.getService("MolAnlManager");
    var json = mgr.getNostdBondsJSON(mol);
    dd("mol: "+mol.name+", json="+json);

    var data;
    try {
      data = JSON.parse(json);
    }
    catch (e) {
      dd("error : "+json_str);
      debug.exception(e);
      return;
    }

    var nodes = new Array();
    var i, nlen = data.length;
    
    // objects and renderers
    for (i=0; i<nlen; ++i) {
      var elem = data[i];

      var node = new Object();
      node.name = this.formatAtomName(elem[0]);
      node.obj_id = elem[0].aid;
      node.values = {
        "treecol_atom1": this.formatAtomName(elem[1]),
        "aid1": elem[1].aid
      };
      nodes.push(node);
    }    

    this.mTreeView.setData(nodes);
    this.mTreeView.buildView();
  };

  dlg.formatAtomName = function (elem)
  {
    var str = elem.chain + " " + elem.resn + " " + elem.resid + " " + elem.aname;
    return str;
  };

  //////////

  dlg.onTreeItemClick = function(aEvent, aRow, aCol)
  {
  };

  dlg.onFocusAidText = function (aEvent)
  {
    var picker = require("atom-picker");
    var target = aEvent.target;
    var mol_id = this.mSelector.getSelectedObj().getUID();

    picker.setHandler( function (uid, aid) {
      if (mol_id==uid)
        target.value = aid;
    } );
  };

  dlg.onDeleteCmd = function()
  {
    let mgr = cuemol.getService("MolAnlManager");

    try {
      //alert("xxx");

      let mol = this.mSelector.getSelectedObj();
      if (!mol) return;
      let scene = mol.getScene();

      let elems = this.mTreeView.getSelectedNodeList();
      if (!elems) return;

      let nelems = elems.length;
      if (nelems==0) return;

      // EDIT TXN START //
      scene.startUndoTxn("Remove bond(s)");

      try {
        for (i=0; i<nelems; ++i) {
          let elem = elems[i];
          dd("id0 = "+elem.obj_id);
          dd("id1 = "+elem.values.aid1);
          mgr.removeBond(mol, elem.obj_id, elem.values.aid1);
        }
      }
      catch (e) {
        dd("RemoveBonds Error!!");
        debug.exception(e);
        scene.rollbackUndoTxn();
        
        delete scene;
        delete mol;
        return;
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //

      this.buildData();
    }
    catch (e) {
      debug.exception(e);
    }
  }

  dlg.onAddCmd = function()
  {
    let mgr = cuemol.getService("MolAnlManager");

    try {
      let mol = this.mSelector.getSelectedObj();
      if (!mol) return;
      let scene = mol.getScene();

      var aid1 = parseInt(this.mTextAid1.value);
      if (isNaN(aid1)) return;
      var aid2 = parseInt(this.mTextAid2.value);
      if (isNaN(aid2)) return;
      
      // EDIT TXN START //
      scene.startUndoTxn("Add bond");

      try {
        mgr.makeBond(mol, aid1, aid2);
      }
      catch (e) {
        dd("RemoveBonds Error!!");
        debug.exception(e);
        scene.rollbackUndoTxn();
        
        delete scene;
        delete mol;
        return;
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //

      this.buildData();
      this.mTextAid1.value = "";
      this.mTextAid2.value = "";

      let picker = require("atom-picker");
      picker.setHandler(null);
    }
    catch (e) {
      debug.exception(e);
    }
  }
  
  dlg.onDialogAccept = function(event)
  {
    let picker = require("atom-picker");
    picker.setHandler(null);

    args.bOK = true;
    return true;
  }

} )();

