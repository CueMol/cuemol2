//
// Navigation tool-ribbon implementation
//
// $Id: navi-toolribbon.js,v 1.9 2011/05/02 12:42:55 rishitani Exp $
//

if (!("NaviToolRibbon" in cuemolui)) {

cuemolui.NaviToolRibbon = ( function() {

// constructor
var ctor = function (aIdBase)
{
  this.mParent = null;
  this.name = aIdBase;
  this.mTabId = aIdBase+"-ribbon-tab";
  this.mTabPanelId = aIdBase+"-ribbon-tabpanel";
  
  // attach to the load/unload event for the target document/window
  var that = this;
  window.addEventListener("load", function(){that.onLoad();}, false);
  // aWindow.addEventListener("unload", function() {that.onUnLoad();}, false);

  // default: navigation (arrow) mode
  this.mCurMode = 1;

  this.mPrevObjID = null;
  this.mPrevAtomID = null;
}

var klass = ctor.prototype;

//////

// private initialization routine
klass.onLoad = function ()
{
  var that = this;

  document.getElementById("navi-ribbon-arrowbtn").addEventListener(
    "command", function (a) { that.onRadioBtn(a); }, false);
  document.getElementById("navi-ribbon-rectbtn").addEventListener(
    "command", function (a) { that.onRadioBtn(a); }, false);

  this.mCMenuGen = document.getElementById("navi-cmenu-gen");
  this.mCMenuGenLabel = document.getElementById("navi-cmenu-gen-msg");

  this.mCMenuGen.addEventListener("command", function (aEvent) {
    try { that.onCMenuGen(aEvent) } catch (e) { debug.exception(e) }
  },false);

  this.mCtxtMenuAtomLabel = document.getElementById("navi-ctxtmenu-atomlabel");
  this.mCtxtMenuRendLabel = document.getElementById("navi-ctxtmenu-rendlabel");
  this.mCtxtMenu = document.getElementById("navi-ctxtmenu-atom");

  this.mCtxtMenuSymmLabel = document.getElementById("navi-ctxtmenu-symmlabel");
  this.mCtxtMenuSymm = document.getElementsByClassName("ctxtmenu-symm");

  this.mCtxtMenu.addEventListener("command", function (aEvent) {
    try { that.onCtxtMenu(aEvent) } catch (e) { debug.exception(e) }
  },false);
}

klass.onRadioBtn = function (aEvent)
{
  var sel = null;
  switch (aEvent.target.id) {
  case "navi-ribbon-arrowbtn":
    sel = 1;
    break;
  case "navi-ribbon-rectbtn":
    sel = 2;
    break;
  }

  if (sel==this.mCurMode)
    return;

  this.mCurMode = sel;

  if (this.mCurMode==2)
    this.enableRectTool();
  else
    this.disableRectTool();
}

klass.onActivated = function ()
{
  dd("Navi Tool activated");
  if (this.mCurMode==2)
    this.enableRectTool();
}

klass.onInactivated = function ()
{
  dd("Navi Tool activated");
  if (this.mCurMode==2)
    this.disableRectTool();
}

klass.mouseDragStart = function (x, y, mod)
{
  if (!(mod&(1<<3)))
    return false;
  dd("mouseDragStart");
  if (this.mDrawObj) {
    this.mDrawObj.start(x,y);
    if (this.mView)
      this.mView.invalidate();
  }
  return true;
}
klass.mouseDragMove = function (x, y, mod)
{
  if (!(mod&(1<<3)))
    return false;
  dd("mouseDragMove");
  if (this.mDrawObj) {
    this.mDrawObj.move(x,y);
    if (this.mView)
      this.mView.invalidate();
  }
  return true;
}
klass.mouseDragEnd = function (x, y, mod)
{
  if (!(mod&(1<<3)))
    return false;

  try {
    dd("mouseDragEnd");
    if (this.mDrawObj) {
      this.mDrawObj.end();
      this.rectSel(this.mDrawObj.left, this.mDrawObj.top,
                   this.mDrawObj.width, this.mDrawObj.height);
      if (this.mView)
        this.mView.invalidate();
    }
  }
  catch (e) {
    debug.exception(e);
  }
  return true;
}

klass.rectSel = function (left, top, width, height)
{
  if (!this.mView)
    return;
  var sres = this.mView.hitTestRect(left, top, width, height, false);
  if (sres.length==0)
    return;

  try {
    res = JSON.parse(sres);
  }
  catch (e) {
    dd("error : "+sres);
    debug.exception(e);
    return;
  }

  dd("HittestRect : "+sres);
  var byresid = false;

  var nrend = res.length;
  var selset = new Object();
  for (var i=0; i<nrend; ++i) {
    var elem = res[i];

    var obj_id = elem.obj_id;
    if (!(obj_id in selset))
      selset[obj_id] = new Array();
    selset[obj_id].push(elem.sel);
  }

  var scene = this.mView.getScene();

  for (var i in selset) {
    let obj = cuemol.getObject(i);
    if (!('sel' in obj))
      continue;
    
    selstr = selset[i].join("|");
    dd("selection for Mol["+i+"] : "+selstr);
    //obj.sel = cuemol.makeSel(selstr);
    cuemolui.chgMolSel(obj, selstr, "Select atom(s)", true);
  }

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Select atom(s)");

  var selstr;
  try {
    for (var i in selset) {
      var obj = cuemol.getObject(i);
      if (!('sel' in obj))
        continue;

      selstr = selset[i].join("|");
      dd("selection for Mol["+i+"] : "+selstr);
      obj.sel = cuemol.makeSel(selstr);
    }
  }
  catch(e) {
    dd("SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    scene = null;
    return;
  }
  
  scene.commitUndoTxn();
  // EDIT TXN END //

  // Save to selHistory
  util.selHistory.append(selstr);
  
  scene = null;
   */
}

klass.enableRectTool = function ()
{
  var view = this.mParent.getTgtView();
  if (!view)
    return;
  var viewid = view.uid;

  var that = this;
  this.mCallbkID1 = cuemol.evtMgr.addListener(
    "mouseDragStart",
    cuemol.evtMgr.SEM_INDEV, // target type
    cuemol.evtMgr.SEM_ANY, // event type
    viewid, // source uid
    function (args) {
      return that.mouseDragStart(args.obj.x, args.obj.y, args.obj.mod);
    });
  this.mCallbkID2 = cuemol.evtMgr.addListener(
    "mouseDragMove",
    cuemol.evtMgr.SEM_INDEV, // target type
    cuemol.evtMgr.SEM_ANY, // event type
    viewid, // source uid
    function (args) {
      return that.mouseDragMove(args.obj.x, args.obj.y, args.obj.mod);
    });
  this.mCallbkID3 = cuemol.evtMgr.addListener(
    "mouseDragEnd",
    cuemol.evtMgr.SEM_INDEV, // target type
    cuemol.evtMgr.SEM_ANY, // event type
    viewid, // source uid
    function (args) {
      return that.mouseDragEnd(args.obj.x, args.obj.y, args.obj.mod);
    });
  
  this.mDrawObj = view.getDrawObj("RectSelDrawObj");
  //this.xxx = view.getDrawObj("RectSelDrawObj");
  //this.mDrawObj = null;

  if (!this.mDrawObj) {
    view = null;
    return;
  }

  this.mDrawObj.enabled = true;
  this.mView = view;
  // this.mView = null;
  view = null;
}

klass.disableRectTool = function ()
{
  this.mView = null;
  cuemol.evtMgr.removeListener(this.mCallbkID1);
  this.mCallbkID1 = null;
  cuemol.evtMgr.removeListener(this.mCallbkID2);
  this.mCallbkID2 = null;
  cuemol.evtMgr.removeListener(this.mCallbkID3);
  this.mCallbkID3 = null;

  if (!this.mDrawObj)
    return;
  this.mDrawObj.enabled = false;
  this.mDrawObj = null;
}

klass.onCMenuGen = function (aEvent)
{
  var tgtid = aEvent.target.id;
  if (tgtid=="navi-cmenu-gen-centerat") {
    //this.mParent.centerAtomAt();

    var res = this.mParent.getHittestRes();
    var obj = cuemol.getObject(res.obj_id);

    var pos = cuemol.createObj("Vector");
    pos.set3(res.x, res.y, res.z);
  
    var view = this.mParent.mMainWnd.currentViewW;
    view.setViewCenter(pos);

    return;
  }
}

klass.onCtxtMenu = function (aEvent)
{
  var tgtid = aEvent.target.id;
  switch (tgtid) {
  case "navi-ctxtmenu-centerat": 
    this.mParent.centerAtomAt();
    return;

  case "navi-ctxtmenu-selectatom":
    this.vcmSelectMol(0);
    return;

  case "navi-ctxtmenu-selectresid":
    this.vcmSelectMol(1);
    return;

  case "navi-ctxtmenu-selectchain":
    this.vcmSelectMol(2);
    return;

  case "navi-ctxtmenu-selectmol":
    this.vcmSelectMol(3);
    return;

  case "navi-ctxtmenu-addselectatom":
    this.vcmAddSelectMol(0);
    return;

  case "navi-ctxtmenu-addselectresid":
    this.vcmAddSelectMol(1);
    return;

  case "navi-ctxtmenu-addselectchain":
    this.vcmAddSelectMol(2);
    return;

  case "navi-ctxtmenu-unselectmol":
    this.vcmUnSelectMol();
    return;

  case "navi-ctxtmenu-invertmolsel": {
    let res = this.mParent.getHittestRes();
    let obj = cuemol.getObject(res.obj_id);
    cuemolui.molSelInvert(obj);
    return;
  }
    
  case "navi-ctxtmenu-togglesidech": {
    let res = this.mParent.getHittestRes();
    let obj = cuemol.getObject(res.obj_id);
    cuemolui.molSelToggleSideCh(obj);
    return;
  }

  case "navi-ctxtmenu-centerat-symm":
    this.centerSymmAtomAt();
    return;

  case "navi-ctxtmenu-create-symm":
    this.createSymmObj();
    return;

    //////////

  case "navi-ctxtmenu-arbyres-3":
    this.vcmArndMolSel(3, true);
    return;

  case "navi-ctxtmenu-arbyres-5":
    this.vcmArndMolSel(5, true);
    return;

  case "navi-ctxtmenu-arbyres-7":
    this.vcmArndMolSel(7, true);
    return;

  case "navi-ctxtmenu-arbyres-10":
    this.vcmArndMolSel(10, true);
    return;

  case "navi-ctxtmenu-arnd-3":
    this.vcmArndMolSel(3, false);
    return;

  case "navi-ctxtmenu-arnd-5":
    this.vcmArndMolSel(5, false);
    return;

  case "navi-ctxtmenu-arnd-7":
    this.vcmArndMolSel(7, false);
    return;

  case "navi-ctxtmenu-arnd-10":
    this.vcmArndMolSel(10, false);
    return;

  default:
    dd("NaviTool> ERROR!! unknown menu id="+tgtid);
    return;
  }
}

klass.onMouseClicked = function (x, y, mod)
{
  dd("NaviTool> mouse clicked");

  var res = this.mParent.getHittestRes(x, y);
  if (!res)
    return;
  
  if ( cuemol.implIface(res.objtype, "MolCoord") ) {
    if (mod&(1<<5)) { // rbtn
      this.mCtxtMenuAtomLabel.label
	= ( (res.obj_name) ? (res.obj_name+": ") : "" ) + res.message;
      this.mCtxtMenuRendLabel.label
	= res.rend_name + " (" + res.rendtype + ")";
      if (res.rendtype=="*symm") {
	this.mCtxtMenuSymmLabel.label = " (symop: "+res.symm_name+")";
	this.setupSymmCtxtMenu(true);
      }
      else {
        this.setupSymmCtxtMenu(false);
      }
      
      this.mCtxtMenu.openPopup(this.mParent.mMainWnd.mPanelContainer.selectedPanel,
                               "overlap", x+2, y+2, true, false);
    }
    else {
      var msg2 = ", O: "+res.occ+" B: "+res.bfac+" Pos: ("+res.x+", "+res.y+", "+res.z+")";
      if (res.rendtype=="*symm")
	gQm2Main.mStatusLabel.label = "Molecule ["+res.obj_name+"], " +
	  res.message + msg2 +
	    " (symop: "+res.symm_name+")";
      else 
	gQm2Main.mStatusLabel.label = "Molecule ["+res.obj_name+"], " +
	  res.message + msg2;
      this.showAtomLabel(res.obj_id, res.atom_id);

      cuemol.putLogMsg(gQm2Main.mStatusLabel.label);
    }
  
  }
  else {
    if ("message" in res) {
      if (mod&(1<<5)) { // rbtn
	this.mCMenuGenLabel.label
	  = ( (res.obj_name) ? (res.obj_name+": "):"" ) + res.message;

	this.mCMenuGen.openPopup(this.mParent.mMainWnd.mPanelContainer.selectedPanel,
				 "overlap", x+2, y+2, true, false);
      }
      else {
	gQm2Main.mStatusLabel.label = "LWObject ["+res.obj_name+"], " + res.message;
      }
    }
  }
  
  return;
}

klass.onMouseDoubleClicked = function (x, y, mod)
{
  dd("NaviTool> mouse double clicked");

  let res = this.mParent.getHittestRes(x, y);
  if (!res) {
    //dd("NaviTool> no hitatm --> clear sel");
    //this.vcmUnSelectMol();
    return;
  }

  if (mod&(1<<3)) { // L-btn
    let obj = cuemol.getObject(res.obj_id);
    if (!obj) return;
    let atom = obj.getAtomByID(res.atom_id);
    if (!atom) return;

    if (mod&(1<<0)) { // Shift
      this.extendResidSel(obj, atom);
    }
    else {
      this.toggleResidSel(obj, atom);
      this.mPrevObjID = res.obj_id;
      this.mPrevAtomID = res.atom_id;
    }

    return;
  }
  else {
  }
};

/// Toggle residue selection
klass.toggleResidSel = function (obj, atom)
{
  let chname = atom.chainName;
  let resindex = atom.residIndex;
  
  let resid = obj.getResidue(chname, resindex);
  let rrs = cuemol.createObj("ResidRangeSet");
  rrs.fromSel(obj, obj.sel);
  
  let addsel = cuemol.makeSel(chname + "." + resindex + ".*");
  if (rrs.contains(resid))
    rrs.remove(obj, addsel);
  else
    rrs.append(obj, addsel);
  
  let sel = rrs.toSel(obj);

  //////////

  cuemolui.chgMolSelObj(obj, sel, "Toggle select atom(s)", true);

/*
  // EDIT TXN START //
  let scene = this.mParent.mMainWnd.currentSceneW;
  scene.startUndoTxn("Toggle select atom(s)");
  
  try {
    if (sel===null) {
      throw "cannot compile selstr:"+selstr;
    }
    obj.sel = sel;
  }
  catch(e) {
    dd("SetSel error");
    debug.exception(e);
  }
  
  scene.commitUndoTxn();
  // EDIT TXN END //
*/
};

/// Range residue selection
klass.extendResidSel = function (obj, atom)
{
  if (this.mPrevObjID!=obj.uid)
    return;

  if (this.mPrevAtomID==null)
    return;
  let prev_atom = obj.getAtomByID(this.mPrevAtomID);
  if (prev_atom==null)
    return;

  let chname = atom.chainName;
  let prev_chname = prev_atom.chainName;
  if (prev_chname!=chname)
    return;

  let resindex = atom.residIndex;
  let prev_resindex = prev_atom.residIndex;

  let resid = obj.getResidue(chname, resindex);
  let rrs = cuemol.createObj("ResidRangeSet");
  rrs.fromSel(obj, obj.sel);
  
  let addsel = cuemol.makeSel(chname + "." + prev_resindex + ":"+resindex+".*");
  rrs.append(obj, addsel);
  
  let sel = rrs.toSel(obj);

  //////////

  cuemolui.chgMolSelObj(obj, sel, "Toggle select atom(s)", true);

  /*
  // EDIT TXN START //
  let scene = this.mParent.mMainWnd.currentSceneW;
  scene.startUndoTxn("Toggle select atom(s)");
  
  try {
    if (sel===null) {
      throw "cannot compile selstr:"+selstr;
    }
    obj.sel = sel;
  }
  catch(e) {
    dd("SetSel error");
    debug.exception(e);
  }
  
  scene.commitUndoTxn();
  // EDIT TXN END //
    */
};

/// Hide/show symm context menu
klass.setupSymmCtxtMenu = function (aShow)
{
  Array.forEach(this.mCtxtMenuSymm, function (e) {
    e.hidden = !aShow;
  } );
};

klass.centerSymmAtomAt = function()
{
  var res = this.mParent.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);
  var rend = cuemol.getRenderer(res.rend_id);

  ////

  var atom = obj.getAtomByID(res.atom_id);
  var pos = atom.pos;
  var symid = res.symm_id;

  // perform transformation of coord by symop
  var matrix = rend.getXformMatrix(symid);
  pos.w = 1.0; // this is important!!
  pos = matrix.mulvec(pos);

  var view = this.mParent.mMainWnd.currentViewW;
  view.setViewCenter(pos);
  
  // cleanup the consumed hittest result
  this.mCurHittestRes = null;
}

klass.createSymmObj = function ()
{
  let scene = this.mParent.mMainWnd.currentSceneW;

  let res = this.mParent.getHittestRes();
  let mol = cuemol.getObject(res.obj_id);
  let rend = cuemol.getRenderer(res.rend_id);
  let matrix = rend.getXformMatrix( res.symm_id );

  let newname = mol.name + " " + res.symm_name;

  /////////
  // Show the create-rend dialog
  let data  = Array();
  let result;
  {
    let i = 0;
    data[i] = Object();
    //data[i].uid = uid;
    data[i].name = newname;
    data[i].rend_types = mol.searchCompatibleRendererNames();
    data[i].obj_type = mol._wrapped.getClassName();
    data[i].preset_types = gQm2Main.getCompatibleRendPresetNames(data[i].obj_type, scene.uid);
    
    result = gQm2Main.doSetupRendDlg({
    target: data, sceneID: scene.uid, ok: false, bEditObjName : true });
    
    if (!result.ok)
      return;
  }
  
  ////////
  // create symm mol

  // Copy and transformation can be done out of undo txn
  let selall = cuemol.makeSel("*");
  let newmol = cuemol.createObj("MolCoord");
  newmol.name = data[0].name;
  newmol.copyAtoms(mol, selall);
  newmol.xformByMat(matrix, selall);

  // copy mol-coloring
  // TO DO: copy from original mol's coloring
  newmol.coloring = gQm2Main.createDefPaintColoring(); //mol.coloring;
  
  // EDIT TXN START //
  scene.startUndoTxn("Create symm mol");
  try {
    scene.addObject(newmol);

    result.obj_id = newmol.uid;
    gQm2Main.doSetupRend(scene, result);
  }
  catch (e) {
    debug.exception(e);
    
    this.mPrompts.alert(window, document.title,
                        "Create symm mol failed: "+e.message);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

  // cleanup the consumed hittest result
  this.mCurHittestRes = null;
}

/// get selstr form hittest result
klass.getSelstrFromHitRes = function(mode)
{
  var res = this.mParent.getHittestRes();
  if (!res)
    return null;

  var obj = cuemol.getObject(res.obj_id);
  if (!obj) return null;
  var atom = obj.getAtomByID(res.atom_id);
  if (!atom) return null;

  var selstr;

  switch (mode) {
  case 0:
    // atom
    selstr = "aid "+res.atom_id;
    break;

  case 1:
    // residue
    var chname = atom.chainName;
    var resind = atom.residIndex;
    selstr = chname + "." + resind + ".*";
    break;

  case 2:
    // chain
    var chname = atom.chainName;
    //var resind = atom.residIndex;
    selstr = "c;"+chname;
    break;

  case 3:
  default:
    // mol
    selstr = "*";
    
    break;
  }

  return selstr;
}

klass.vcmSelectMol = function(mode)
{
  var selstr = this.getSelstrFromHitRes(mode);
  if (selstr==null)
    return;

  var res = this.mParent.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);
  if (!obj)
    return;

  var scene = cuemol.getScene(this.mParent.mTgtSceneID);
  if (!scene) {
    dd("*** FATAL ERROR: Scene is null, cannot change props!! ***");
    return;
  }

  cuemolui.chgMolSel(obj, selstr, "Select atom(s)", true);

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Select atom(s)");

  try {
    var sel = cuemol.makeSel(selstr);
    if (sel===null) {
      throw "cannot compile selstr:"+selstr;
    }
    obj.sel = sel;
  }
  catch(e) {
    dd("SetProp error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  util.selHistory.append(selstr);
   */
}

klass.vcmAddSelectMol = function(mode)
{
  var selstr = this.getSelstrFromHitRes(mode);
  if (selstr==null)
    return;

  var res = this.mParent.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);
  if (!obj)
    return;

  var scene = cuemol.getScene(this.mParent.mTgtSceneID);
  if (!scene) {
    dd("*** FATAL ERROR: Scene is null, cannot change props!! ***");
    return;
  }

  var prevsel = obj.sel.toString();
  if (prevsel.length>0) {
    selstr = "("+prevsel+") or ("+selstr+")";
  }
  // dd("AddSel str="+selstr);

  cuemolui.chgMolSel(obj, selstr, "Add select atom(s)", true);

  /*
  // EDIT TXN START //
  scene.startUndoTxn("Add select atom(s)");

  try {
    var sel = cuemol.makeSel(selstr);
    if (sel===null) {
      throw "cannot compile selstr:"+selstr;
    }
    obj.sel = sel;
  }
  catch(e) {
    dd("SetProp error");
    debug.exception(e);
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
   */
};

klass.vcmUnSelectMol = function()
{
  var res = this.mParent.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);
  cuemolui.molSelClear(obj);
};

klass.vcmArndMolSel = function(aDist, aByres)
{
  var res = this.mParent.getHittestRes();
  var obj = cuemol.getObject(res.obj_id);

  cuemolui.molSelAround(obj, aDist, aByres);
};

klass.showAtomLabel = function(objid, atomid)
{
  const labeltype = "*namelabel";

  let obj = cuemol.getObject(objid);
  if (!obj) return;
  
  let scene = cuemol.getScene(this.mParent.mTgtSceneID);

  // EDIT TXN START //
  scene.startUndoTxn("Add atom label");

  try {
    let label_rend = obj.getRendererByNameType("", labeltype);
    if (!label_rend) {
      // create new renderer
      label_rend = obj.createRenderer(labeltype);
      label_rend.applyStyles("DefaultLabel");
    }
    let res = label_rend.addLabel(atomid);
    if (!res) {
      // label exists --> remove it
      label_rend.removeLabel(atomid);
    }
  }
  catch(e) {
    dd("NaviTool> Add atom label: error");
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }

  scene.commitUndoTxn();
  // EDIT TXN END //
}


return ctor;

} )();

}

