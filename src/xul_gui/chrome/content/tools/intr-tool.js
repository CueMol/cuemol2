//
// interaction analysis tool
//

cuemolui.onIntrTool = function ()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen";

  var scene_id = gQm2Main.mMainWnd.getCurrentSceneID();
  var view_id = gQm2Main.mMainWnd.getCurrentViewID();
  var win = gQm2Main.mWinMed.getMostRecentWindow("CueMol2:IntrTool");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/intr-tool-dlg.xul", "",
		      stylestr, scene_id, view_id);
};

if (!("IntrTool" in cuemolui)) {

  cuemolui.IntrTool = ( function() {

    // constructor
    var ctor = function ()
    {
      var that = this;

      this.mTargetSceneID = window.arguments[0];
      this.mTargetViewID = window.arguments[1];

      var filter_fn = function (elem) {
	return cuemol.implIface(elem.type,"MolCoord");
      };

      this.mTargMol = new cuemolui.ObjMenuList(
	"targ_mol",
	window, filter_fn,
	cuemol.evtMgr.SEM_OBJECT);
      this.mTargMol._tgtSceID = this.mTargetSceneID;

      this.mTargMol2 = new cuemolui.ObjMenuList(
	"targ_mol2",
	window, filter_fn,
	cuemol.evtMgr.SEM_OBJECT);
      this.mTargMol2._tgtSceID = this.mTargetSceneID;

      window.addEventListener("load", function(){that.onLoad();}, false);
    };

    var klass = ctor.prototype;

    ////////////////////////////////////////////////

    // private initialization routine
    klass.onLoad = function ()
    {
      var that = this;

      this.mTargMol.addSelChanged(function(aEvent) {
	try { that.onTargMolChanged(aEvent);}
	catch (e) { debug.exception(e); }
      });

      this.mTargSel = document.getElementById('targ_molsel');
      this.mTargSel.targetSceID = this.mTargetSceneID;

      this.mTargMol2.addSelChanged(function(aEvent) {
	try { that.onTargMolChanged(aEvent);}
	catch (e) { debug.exception(e); }
      });

      this.mTargSel2 = document.getElementById('targ_molsel2');
      this.mTargSel2.targetSceID = this.mTargetSceneID;

      this.mMinDist = document.getElementById('min-distance');
      this.mMaxDist = document.getElementById('max-distance');
      this.mMaxLabs = document.getElementById('max-labels');
      
      //this.mMinDist.addEventListener("change", function(){that.onMinChanged();}, false);
      //this.mMaxDist.addEventListener("change", function(){that.onMaxChanged();}, false);

      this.mChkHbon = document.getElementById('chk_hbond');

      if (this.mTargMol._widget.itemCount==0) {
	// no mol object in the scene
	document.documentElement.getButton("accept").disabled = true;
	this.mTargSel.disabled = true;
	this.mTargSel2.disabled = true;
	return;
      }

      this.mTargMol._widget.selectedIndex = 0;
      this.onTargMolChanged();
      this.mTargSel.buildBox();
      this.mTargSel2.buildBox();

      this.mTgtList = document.getElementById('targ_rend');
      this.mTgtList.addEventListener(
	"popupshowing", function (a) { that.onTgtListShowing(a); }, false);

      this.mMol2Chk = document.getElementById("chk_mol2");
      this.mMol2Chk.addEventListener(
	"command", function (a) { that.onTargMol2Checked(); }, false);

      this.mSel2Chk = document.getElementById("chk_molsel2");
      this.mSel2Chk.addEventListener(
	"command", function (a) { that.onTargSel2Checked(); }, false);

      // sync widgets to the checkbox states
      setTimeout( function() {
	that.onTargMol2Checked();
	that.onTargSel2Checked();
      }, 0);
    };
    
    klass.onTargMolChanged = function ()
    {
      var mol = this.mTargMol.getSelectedObj();
      if (mol) {
	this.mTargSel.molID = mol.uid;
	this.mTargSel2.molID = mol.uid;
      }
    };

    klass.onTargSel2Checked = function ()
    {
      if (this.mSel2Chk.checked)
	this.mTargSel2.disabled = false;
      else
	this.mTargSel2.disabled = true;
    };

    klass.onTargMol2Checked = function ()
    {
      if (this.mMol2Chk.checked)
	this.mTargMol2._widget.disabled = false;
      else
	this.mTargMol2._widget.disabled = true;
    };

    klass.onTgtListShowing = function (aEvent)
    {
      try {
	var rend_names = new Array();
	var scene = cuemol.getScene(this.mTargetSceneID);
	var objary = util.toIntArray( scene.obj_uids );
	dd("ListShowing> objary: "+ objary);
	var nobjs = objary.length;
	for (var i=0; i<nobjs; ++i) {
	  var obj_id = objary[i];
	  var obj = scene.getObject(obj_id);
	  rend_names = rend_names.concat( cuemol.getRendNameList(obj,"atomintr") );
	}
	objary = null;
	
	var menu = this.mTgtList.menupopup;
	
	while (menu.firstChild)
	  menu.removeChild(menu.firstChild);
	
	if (rend_names.length==0) {
	  util.appendMenu(document, menu, 0, "measure");
	  return;
	}
	
	rend_names.forEach(function (aElem) {
	  util.appendMenu(document, menu, 0, aElem);
	});
	
      } catch (e) {debug.exception(e);}
    };

    function searchRend(obj, labeltype, labelname)
    {
      const size = obj.getRendCount();
      for (let i=0; i<size; ++i) {
	let rend = obj.getRendererByIndex(i);
	if (rend) {
	  if (rend.type_name==labeltype &&
	      rend.name==labelname) {
	    return rend;
	  }
	}
      }

      return null;
    }

    klass.onDialogAccept = function ()
    {
      let tgtmol = this.mTargMol.getSelectedObj();
      if (tgtmol==null) {
	dd("IntrTool: mol not selected!!");
	util.alert(window, "Mol is not selected.");
	return false;
      }
      let scene = tgtmol.getScene();

      let tgtmol2 = null;
      if (this.mMol2Chk.checked) {
	tgtmol2 = this.mTargMol2.getSelectedObj();
	if (tgtmol.uid==tgtmol2.uid)
	  tgtmol2 = null
      }

      let tgtsel = this.mTargSel.selectedSel;
      let tgtsel2 = this.mTargSel2.selectedSel;

      if (tgtsel==null) {
	util.alert(window, "invalid mol sel");
	return false;
      }

      if (this.mSel2Chk.checked && tgtsel2==null) {
	util.alert(window, "invalid mol sel2");
	return false;
      }

      // dd("DlgAcc> min="+this.mMinDist.value);
      let rmin = parseFloat(this.mMinDist.value);
      if (isNaN(rmin))
	return false;

      let rmax = parseFloat(this.mMaxDist.value);
      if (isNaN(rmax))
	return false;

      if (rmin>=rmax) {
	util.alert(window, "Min dist should be larger than Max dist.");
	return false;
      }

      let nmaxlabs = parseInt(this.mMaxLabs.value);
      if (isNaN(nmaxlabs) || nmaxlabs<=0)
	return false;

      let bhbon = this.mChkHbon.checked;

      let mgr = cuemol.getService("MolAnlManager");
      let json = null;

      if (tgtmol2==null) {
	if (this.mSel2Chk.checked)
	  json = mgr.calcAtomContact2JSON(tgtmol, tgtsel, tgtsel2, rmin, rmax, bhbon, nmaxlabs);
	else
	  json = mgr.calcAtomContactJSON(tgtmol, tgtsel, rmin, rmax, bhbon, nmaxlabs);
      }
      else {
	// tgtmol2!=null
	json = mgr.calcAtomContact3JSON(tgtmol, tgtsel, tgtmol2, tgtsel2, rmin, rmax, bhbon, nmaxlabs);
      }
      dd("JSON: "+json);
      
      let npairs = 0;
      let list = null;
      try {
	list = JSON.parse(json);
	npairs = list.length;
      }
      catch (e) {}
      
      if (list==null || npairs==0) {
	util.alert(window, "No interaction was found.");
	return false;
      }
      
      const labeltype = "atomintr";
      const labelname = this.mTgtList.value;

      let label_rend = searchRend(tgtmol, labeltype, labelname);
      dd("label rend getRendererByType: "+label_rend);

      /////////////////////////////////////
      
      // EDIT TXN START //
      scene.startUndoTxn("Define Label(s)");
      
      try {
	
	if (!label_rend) {
	  // create new renderer
	  label_rend = tgtmol.createRenderer(labeltype);
	  label_rend.name = labelname;
	  label_rend.applyStyles("DefaultLabel,DefaultAtomIntr");
	}
	
	for (let i=0; i<npairs; ++i) {
	  let elem = list[i];
	  let aid1 = elem[0];
	  let aid2 = elem[1];
	  dd("define label "+aid1+" <--> "+aid2);
	  if (tgtmol2==null)
	    label_rend.appendById(aid1, tgtmol.uid, aid2, false);
	  else
	    label_rend.appendById(aid1, tgtmol2.uid, aid2, false);
	}
      }
      catch (e) {
	dd("DefineDistLabel Error!!");
	debug.exception(e);
	scene.rollbackUndoTxn();
	return false;
      }
      
      scene.commitUndoTxn();
      // EDIT TXN END //
      
      // save selection history
      util.selHistory.append(tgtsel.toString());
      if (this.mSel2Chk)
	util.selHistory.append(tgtsel2.toString());

      return true;
    };
    
    return ctor;

  } )();

}

