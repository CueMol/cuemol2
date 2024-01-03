//
// Protein secondary structure calculation tool
//

cuemolui.onProt2ndry = function ()
{
  var stylestr = "chrome,resizable=no,dependent,centerscreen,modal";

  var scene_id = gQm2Main.mMainWnd.getCurrentSceneID();
  var view_id = gQm2Main.mMainWnd.getCurrentViewID();
  var win = gQm2Main.mWinMed.getMostRecentWindow("CueMol2:Prot2ndry");

  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/tools/prot2ndry-tool-dlg.xul", "",
		      stylestr, scene_id, view_id);
};

//
// Dialog implementation
//
if (!("Prot2ndryTool" in cuemolui)) {

  cuemolui.Prot2ndryTool = ( function() {

    const history_name_prefix = "cuemol2.ui.histories.prot2ndry-tool";
    const pref = require("preferences-service");

    // constructor
    var ctor = function ()
    {
      var that = this;

      this.mTargetSceneID = window.arguments[0];
      this.mTargetViewID = window.arguments[1];

      var filter_fn = function (elem) {
	return cuemol.implIface(elem.type, "MolCoord");
      };

      this.mTargMol = new cuemolui.ObjMenuList(
	"targ_mol",
	window, filter_fn,
	cuemol.evtMgr.SEM_OBJECT);
      this.mTargMol._tgtSceID = this.mTargetSceneID;

      window.addEventListener("load", function(){that.onLoad();}, false);
    };

    var klass = ctor.prototype;

    ////////////////////////////////////////////////

    // private initialization routine
    klass.onLoad = function ()
    {
      let that = this;

      //this.mHbMax = document.getElementById('hbmax');
      this.mIgnBlg = document.getElementById('ign_bulge');

      this.mHlxGap = document.getElementById('helix_gapfill');
      this.mHlxAngl1 = document.getElementById('helix_angl1');
      
      this.mHlxGap.addEventListener("command",
				    function (e) { that.onHlxGapChg(); },
				    false);

      this.mTargMol.addSelChanged(function(aEvent) {
	try { that.onTargMolChanged(aEvent);}
	catch (e) { debug.exception(e); }
      });

      this.mTargSel = document.getElementById('targ_molsel');
      this.mTargSel.targetSceID = this.mTargetSceneID;
      
      this.mSecTypeSel = document.getElementById('sec_type');

      this.mRadRecalc = document.getElementById('radio_recalc');
      this.mRadRecalc.addEventListener("command",
				       function (e) { that.onRadSelChg(e.target.id); },
				       false);
      this.mRadAsgn = document.getElementById('radio_assign');
      this.mRadAsgn.addEventListener("command",
				     function (e) { that.onRadSelChg(e.target.id); },
				     false);

      if (this.mTargMol._widget.itemCount==0) {
	// no mol object in the scene
	document.documentElement.getButton("accept").disabled = true;
	this.mTargSel.disabled = true;
	this.mRadRecalc.disabled = true;
	this.mRadAsgn.disabled = true;
	this.mSecTypeSel.disabled = true;
	dd("Prot2ndry> No mol in the scene!!");
	return;
      }

      // tgt mol/sel
      var his_name = history_name_prefix + ".tgtmol";
      var selind = 0;
      if (pref.has(his_name)) {
	let nm = pref.get(his_name);
	selind = this.mTargMol.getIndexByName(nm);
	if (!selind)
	  selind = 0;
      }
      this.mTargMol._widget.selectedIndex = selind;
      this.onTargMolChanged();
      
      var his_name = history_name_prefix + ".tgtsel";
      if (pref.has(his_name))
	  this.mTargSel.origSel = pref.get(his_name);

      this.mTargSel.buildBox();

      // sec_type
      his_name = history_name_prefix + ".sectype";
      selind = 0;
      if (pref.has(his_name)) {
	selind = pref.get(his_name);
	if (selind<0||selind>4)
	  selind = 0;
      }
      this.mSecTypeSel.selectedIndex = selind;
      
      // radiobtns
      his_name = history_name_prefix + ".mode";
      var mode = "radio_recalc";
      if (pref.has(his_name))
	mode = pref.get(his_name);
      dd("onLoad mode> "+his_name+" = "+mode);
      let relem = document.getElementById('radiobtns');
      if (mode=="radio_recalc")
	relem.selectedItem = this.mRadRecalc;
      else
	relem.selectedItem = this.mRadAsgn;

      this.onRadSelChg(mode);

      // checkbox (ignore-bulge)
      his_name = history_name_prefix + ".ignblg";
      if (pref.has(his_name)) {
	this.mIgnBlg.checked = pref.get(his_name);
      }
    };
    
    klass.onRadSelChg = function (tgtid)
    {
      //let tgtid = aEvent.target.id;
      dd("onRadioSelChanged: "+tgtid);
      if (tgtid=="radio_recalc") {
	//this.mHbMax.disabled = false;
	this.mIgnBlg.disabled = false;
	this.mHlxGap.disabled = false;
	//this.mHlxAngl1.disabled = false;
	this.onHlxGapChg();
	this.mTargSel.disabled = true;
	this.mSecTypeSel.disabled = true;
      }
      else if (tgtid=="radio_assign") {
	//this.mHbMax.disabled = true;
	this.mIgnBlg.disabled = true;
	this.mHlxGap.disabled = true;
	this.mHlxAngl1.disabled = true;
	this.mTargSel.disabled = false;
	this.mSecTypeSel.disabled = false;
      }
      
    };

    klass.onHlxGapChg = function ()
    {
      if (this.mHlxGap.checked) {
	this.mHlxAngl1.disabled = false;
      }
      else {
	this.mHlxAngl1.disabled = true;
      }
    };
    
    klass.onTargMolChanged = function ()
    {
      var mol = this.mTargMol.getSelectedObj();
      if (mol)
	this.mTargSel.molID = mol.uid;
    };

    klass.onDialogAccept = function ()
    {
      // save history (radio btn)
      var his_name;
      his_name= history_name_prefix + ".mode";
      if (this.mRadRecalc.selected)
	pref.set(his_name, this.mRadRecalc.id);
      else
	pref.set(his_name, this.mRadAsgn.id);
      dd("Save his: "+his_name+" = "+pref.get(his_name));

      let tgtmol = this.mTargMol.getSelectedObj();
      if (tgtmol==null) {
	dd("IntrTool: mol not selected!!");
	util.alert(window, "Mol is not selected.");
	return false;
      }

      // save history (tgtmol)
      his_name = history_name_prefix + ".tgtmol";
      pref.set(his_name, tgtmol.name);
      dd("Save his: "+his_name+" = "+pref.get(his_name));

      // save history (tgtsel)
      pref.set(history_name_prefix + ".tgtsel", this.mTargSel.selectedSel.toString());

      // save history (sec_type)
      let nsectype = this.mSecTypeSel.selectedIndex;
      his_name = history_name_prefix + ".sectype";
      pref.set(his_name, nsectype);
      dd("Save his: "+his_name+" = "+pref.get(his_name));

      // checkbox (ignore-bulge)
      his_name = history_name_prefix + ".ignblg";
      pref.set(his_name, this.mIgnBlg.checked);
      //alert("Save his: "+his_name+" = "+pref.get(his_name));

      if (this.mRadRecalc.selected)
	return this.doRecalc(tgtmol);
      else
	return this.doAssign(tgtmol);
      
    }

    klass.doRecalc = function (tgtmol)
    {
      let scene = tgtmol.getScene();

      // dd("DlgAcc> min="+this.mMinDist.value);
      //let hbmax = parseFloat(this.mHbMax.value);
      //if (isNaN(hbmax))
      //return false;

      let bIgnBlg = this.mIgnBlg.checked;

      let dh1 = 0.0;
      if (this.mHlxGap.checked)
	dh1 = parseFloat(this.mHlxAngl1.value);

      if (isNaN(dh1))
	return false;

      /////////////////////////////////////

      let mgr = cuemol.getService("MolAnlManager");

      // EDIT TXN START //
      scene.startUndoTxn("Recalc protein secondary str");

      try {
	mgr.calcProt2ndry2(tgtmol, bIgnBlg, dh1);
      }
      catch (e) {
	dd("calcProt2ndry Error!!");
	debug.exception(e);
	scene.rollbackUndoTxn();
	return false;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //

      return true;
    };
    
    klass.doAssign = function (tgtmol)
    {
      let scene = tgtmol.getScene();
      let tgtsel = this.mTargSel.selectedSel;
      let nsectype = this.mSecTypeSel.selectedItem.value;

      dd("Target sel: "+tgtsel);
      dd("Sec type: "+nsectype);

      /////////////////////////////////////

      let mgr = cuemol.getService("MolAnlManager");

      // EDIT TXN START //
      scene.startUndoTxn("Assign protein secondary str");

      try {
	mgr.setProt2ndry(tgtmol, tgtsel, nsectype);
      }
      catch (e) {
	dd("setProt2ndry Error!!");
	debug.exception(e);
	scene.rollbackUndoTxn();
	return false;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //

      return true;
    };

    return ctor;

  } )();

}

