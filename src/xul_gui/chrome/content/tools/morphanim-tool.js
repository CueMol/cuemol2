//
// mol morphing anim tool
//

cuemolui.onMorphAnimSetup = function ()
{
  let scene_id = gQm2Main.mMainWnd.getCurrentSceneID();
  let scene = cuemol.getScene(scene_id);
  
  let tgtid = util.doSelectObjPrompt(window, scene,
				     "Select MolCoord or MorphMol to setup:", function (type, elem) {
    if (type!="object") return null;
    if (elem.type!="MolCoord" && elem.type!="MorphMol") return null;
    return elem.name + " (" + elem.type + ", id="+elem.ID+")";
  });

  let mol = cuemol.getObject(tgtid);
  if (cuemol.getClassName(mol)=="MolCoord") {
    tgtid = this.convToMorphMol(mol, scene_id);
  }

  var stylestr = "chrome,resizable=no,dependent,centerscreen,modal";
  var win = gQm2Main.mWinMed.getMostRecentWindow("CueMol2:IntrTool");
  if (win) {
    win.focus();
  }
  else {
    window.openDialog("chrome://cuemol2/content/tools/morphanim-tool-dlg.xul",
		      "",
		      stylestr, scene_id, tgtid);
  }
};

cuemolui.convToMorphMol = function (mol, scene_id)
{
  let newtype = "MorphMol";
  let xmldat = gQm2Main.mStrMgr.toXML2(mol, newtype);
  let newobj = gQm2Main.mStrMgr.fromXML(xmldat, scene_id);
  // add initial <this> frame
  newobj.appendThisFrame();
  
  // assign the same name
  newobj.name = mol.name;
  
  // EDIT TXN START //
  let scene = cuemol.getScene(scene_id);
  scene.startUndoTxn("Conv Mol to MorphMol");
  
  try {
    gQm2Main.deleteObject(mol.uid);
    scene.addObject(newobj);
  }
  catch (e) {
    dd("***** ERROR: Conv Mol to MorphMol "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return null;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
  return newobj.uid;
};

//////////////////////////////////////////////////////////////////////

//
// Dialog implementation
//
if (!("MorphAnimTool" in cuemolui)) {

  cuemolui.MorphAnimTool = ( function() {
    
    // constructor
    var ctor = function ()
    {
      var that = this;

      this.mTargetSceneID = window.arguments[0];
      this.mTargetMolID = window.arguments[1];

      this.mTreeView = new cuemolui.TreeView(window, "mol_list");
      this.mTreeView.clickHandler = function (ev, row, col) {
	that.onTreeItemClick(ev, row, col);
      }

      window.addEventListener("load", function(){that.onLoad();}, false);
    };

    var klass = ctor.prototype;

    ////////////////////////////////////////////////

    // private initialization routine
    klass.onLoad = function ()
    {
      this.buildData();
    };
    
    klass.buildData = function ()
    {
      var i;
      let mol = cuemol.getObject(this.mTargetMolID);
      let json = mol.getFrameInfoJSON();
      dd("json="+json);
      let data = JSON.parse(json);
      let nodes = new Array();
      let nlen = data.length;
      if (nlen>0) {
	for (i=0; i<nlen; ++i) {
	  let ch = new Object();
	  ch.name = data[i].name;
	  ch.values = { "treecol_src": data[i].src };
	  nodes.push(ch);
	}
      }

      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();
    };

    klass.onDialogAccept = function ()
    {
    };

    klass.onMoveUpCmd = function ()
    {
    };

    klass.onMoveDownCmd = function ()
    {
    };

    klass.onDelete = function ()
    {
      var elem = this.mTreeView.getSelectedRow();
      if (elem<0) return;
      // alert("delete: "+elem);

      let tgtmol = cuemol.getObject(this.mTargetMolID);

      // EDIT TXN START //
      let scene = cuemol.getScene(this.mTargetSceneID);
      scene.startUndoTxn("Delete MorphMol item");

      try {
	tgtmol.removeFrame(elem);
      }
      catch (e) {
	dd("MorphMol.removeFrame: "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //

      this.buildData();
    };

    klass.onAdd = function (aEvent)
    {
      var inspos = this.mTreeView.getSelectedRow();
      if (inspos<0)
	inspos = -1;
      else
	++inspos;
      
      var val = aEvent.target.value;
      if (val=="PDBFile")
	this.addPDBFile(inspos);
      else
	this.addMolCoord(inspos);

      this.buildData();
      if (inspos>=0) {
	this.mTreeView.setSelectedRow(inspos);
      }
    };

    klass.addPDBFile = function (inspos)
    {
      let strMgr = cuemol.getService("StreamManager");
      const nsIFilePicker = Ci.nsIFilePicker;
      let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
      fp.init(window, "Select a File", nsIFilePicker.modeOpen);

      let reader_name = "pdb";
      let reader = strMgr.createHandler(reader_name, 0);

      fp.appendFilter(reader.typedescr, reader.fileext);
      fp.filterIndex = 0;

      let res = fp.show();
      if (res!=nsIFilePicker.returnOK)
	return;

      let newobj_name = fp.file.leafName;
      let findex = fp.filterIndex;
      let path = fp.file.path;

      dd("leaf_name (newobj_name): "+newobj_name);
      reader.setPath(path);
      let gzpos = path.lastIndexOf(".gz");
      if (gzpos==path.length-3)
	reader.compress = "gzip";

      // EDIT TXN START //
      let scene = cuemol.getScene(this.mTargetSceneID);
      scene.startUndoTxn("Add PDB to MorphMol");
      
      try {
	let newobj = reader.createDefaultObj();
	let tgtmol = cuemol.getObject(this.mTargetMolID);
	reader.attach(newobj);
	reader.read();
	reader.detach();
	newobj.name = newobj_name;

	tgtmol.insertBefore(newobj, inspos);
      }
      catch (e) {
	dd("File Open Error: "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	util.alert(window, "Failed to open file: "+path);
	reader = null;
	return;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //

    };

    klass.addMolCoord = function (inspos)
    {
      let strMgr = cuemol.getService("StreamManager");
      let scene = cuemol.getScene(this.mTargetSceneID);
      
      let tgtid = util.doSelectObjPrompt(window, scene, "Select MolCoord object to add:",
	function (type, elem) {
	  if (type!="object") return null;
	  if (elem.type!="MolCoord") return null;
	  return elem.name + " (" + elem.type + ", id="+elem.ID+")";
	});

      if (tgtid==null)
	return;

      // EDIT TXN START //
      scene.startUndoTxn("Add PDB to MorphMol");

      try {
	let mol = cuemol.getObject(tgtid);
	let xmldat = strMgr.toXML(mol);
	let newobj = strMgr.fromXML(xmldat, this.mTargetSceneID);
	
	let tgtobj = cuemol.getObject(this.mTargetMolID);
	tgtobj.insertBefore(newobj, inspos);
      }
      catch (e) {
	dd("Clone and add obj failed: "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //
    };

    klass.onItemClick = function ()
    {
    };

    return ctor;

  } )();

}

