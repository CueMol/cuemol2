//
// Animation panel implementation
//

if (!("anim" in cuemolui.panels)) {
  ( function () {
    var panel = cuemolui.panels.anim = new Object();

    // panel's ID
    panel.id = "anim-panel";

    panel.collapsed = true;
    panel.command_id = "menu-anim-panel-toggle";

    panel.mLoaded = false;
    panel.mTgtSceID = 0;

    window.addEventListener("load", function(){panel.onLoad();}, false);

    ////////////////////////////////////////
    // setup animation listbox (implemented by tree widget)

    panel.mTreeView = new cuemolui.TreeView(window, "anim-listbox");
    panel.mTreeView.clickHandler = function (ev, row, col) {
      panel.onAnimItemClick(ev, row, col);
    }
    panel.mTreeView.defCtxtMenuId = "animPanelCtxtMenu";

    ////////////////////////////////////////
    // initialization

    panel.onLoad = function ()
    {
      var that = this;
      var mainWnd = this._mainWnd
	= document.getElementById("main_view");

      this.mAnimDur = document.getElementById("anim_duration");
      this.mStartCam = document.getElementById("anim_startcam");
      this.mStartCam.addEventListener("select",
				      function(e) { that.onStartCamChanged(e); },
				      false);

      this.mBtnNew = document.getElementById("animpanel-addbtn");
      this.mBtnDel = document.getElementById("animpanel-delbtn");
      this.mBtnProp = document.getElementById("animpanel-propbtn");

      this.mBtnUp = document.getElementById("animpanel-moveupbtn");
      this.mBtnDown = document.getElementById("animpanel-movedownbtn");

      this.mTreeView.addEventListener("select",
				      function(e) {that.onTreeSelChanged()},
				      false);
      //
      // setup the target scene
      //
      var scid = mainWnd.getCurrentSceneID();
      if (scid && scid>0)
	this.targetSceneChanged(scid);
      
      //
      // setup tab-event handler for the MainTabView
      //
      mainWnd.mPanelContainer.addEventListener("select", function(aEvent) {
	var scid = mainWnd.getCurrentSceneID();
	if (scid != that.mTgtSceID)
	  that.targetSceneChanged(scid);
      }, false);
      
      this.mLoaded = true;
    };

    panel.buildContents = function ()
    {
      var scene = cuemol.getScene(this.mTgtSceID);
      var animMgr = scene.getAnimMgr();

      var bTimeOK = false;
      try {
	animMgr.resolveRelTime();
	bTimeOK = true;
      }
      catch (e) {
	debug.exception(e);
	dd("anim-panel resolveRelTime failed: "+e);
      }
      
      let nodes = new Array();
      var i, col, sel;
      var nlen = animMgr.size;
      for (i=0; i<nlen; ++i) {
	let ao = animMgr.getAt(i);
	let node = new Object();
	let type = cuemol.getClassName(ao);
	let start = ao.absStart;
	let end = ao.absEnd;

	node.name = ao.name + " ("+type+")";
	node.obj_id = i;
	node.values = { anim_start: start.toString(), anim_end: end.toString() };
	
	nodes.push(node);
	dd("AnimPanel.build: added="+node.name);
      }

      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();

      var dur = animMgr.length.getMilliSec(false);
      this.mAnimDur.value = dur;

      this.mStartCam.value = animMgr.startcam;
      //var that = this;
      //window.setTimeout(function () {that.mStartCam.value = animMgr.startcam;}, 1000);

      // this.mStartCam._buildContents();
      // this.mStartCam.dumpItems("build");

      dd("AnimPanel.build: startCam="+animMgr.startcam);
      dd("AnimPanel.build: duration="+dur);
    };

    panel.removeAt = function (aIndex)
    {
      dd("anim-panel.removeAt: "+aIndex);

      this.mTreeView.removeNode( function(elem, index) {
	return (index==aIndex)?true:false;
      } );

      // update the obj_id (as index)
      this.mTreeView.forEachNode( function(elem, index) {
	elem.obj_id = index;
      } );

    };

    panel.attachScene = function (scid)
    {
      var that = this;
      var scene = cuemol.getScene(scid);
      if (!scene)
	return;

      this.mTgtSceID = scid;
      this.mStartCam.sceneID = scid;

      this.buildContents();

      var src_filter = cuemol.evtMgr.SEM_SCENE|cuemol.evtMgr.SEM_ANIM;
      
      this._callbackID =
	cuemol.evtMgr.addListener("",
				  src_filter, // source type
				  cuemol.evtMgr.SEM_ANY, // event type
				  scene.uid, // source UID
				  function (args) { that.onQsysEvent(args); });

      // window.alert("AnimPanel AttachScene: "+scene.uid);
    };
    
    panel.detachScene = function ()
    {
      try {
	var oldscene = cuemol.getScene(this.mTgtSceID);
	if (oldscene && this._callbackID)
	  cuemol.evtMgr.removeListener(this._callbackID);
	this._callbackID = null;
	this.mTgtSceID = null;
      }
      catch (e) {
	debug.exception(e);
      }
    };

    ////////////////////////////////////////
    // event handlers

    /// cuemol system's event handler
    panel.onQsysEvent = function (args)
    {
      // ignore unrelated events
      if (args.srcUID!=this.mTgtSceID)
	return;
      
      if (args.srcCat==cuemol.evtMgr.SEM_SCENE) {
	if (args.method=="sceneAllCleared" ||
	    args.method=="sceneLoaded") {
	  // window.alert("AnimPanel Scene event: SEM_CHANGED "+debug.dumpObjectTree(args));
	  this.buildContents();
	}
	return;
      }

      // ANIM events
      
      // window.alert("AnimPanel qsys event: "+debug.dumpObjectTree(args));

      switch (args.evtType) {
      case cuemol.evtMgr.SEM_ADDED:
	this.buildContents();
	break;
	
      case cuemol.evtMgr.SEM_REMOVING:
	if (args.method=="animObjRemoving")
	  this.removeAt(args.obj.index);
	break;

      case cuemol.evtMgr.SEM_PROPCHG:
	// dd("AnimPanel propchg: "+debug.dumpObjectTree(args.obj));
	if (!("propname" in args.obj))
	  break;
	if (args.obj.propname=="name" ||
	    args.obj.propname=="start" ||
	    args.obj.propname=="end" ||
            args.obj.propname=="length")
	  this.buildContents();
	break;
      }
    };
    
    panel.onPanelShown = function ()
    {
      if (this.mLoaded) {
	this.mTreeView.ressignTreeView();
	// attach to the current scene
	var scid = this._mainWnd.getCurrentSceneID();
	if (scid && scid>0)
	  this.targetSceneChanged(scid);
      }
      // alert("Panel "+this.id+" shown");
    };
    
    panel.onPanelMoved = function ()
    {
      if (this.mLoaded) {
	this.mTreeView.ressignTreeView();
	//this.targetChanged(null);
      }
    };
    
    panel.onPanelClosed = function ()
    {
      // alert("Panel "+this.id+" closed");
    };

    /// Target scene is changed to scid
    panel.targetSceneChanged = function (scid)
    {
      // window.alert("AnimPanel tgtchg this.shown="+this.shown);
      if (!this.shown) {
	dd("AnimPanel targetChanged, but panel is not shown: "+this.shown);
	return;
      }

      try {
	// detach from old scene
	this.detachScene();
	
	// attach to the new active scene
	this.attachScene(scid);
	
	//this.onTreeSelChanged();
      }
      catch (e) {
	dd("Error in anim.targetSceneChanged !!");
	debug.exception(e);
      }
    };

    //////////

    /// selection of paint element list is changed
    panel.onTreeSelChanged = function ()
    {
      try {
	var elem = this.mTreeView.getSelectedNode();
	dd("animpanel.onTreeSelChanged elem="+debug.dumpObjectTree(elem));
	if (elem) {
	  this.mBtnNew.removeAttribute("disabled");
	  this.mBtnDel.removeAttribute("disabled");
	  this.mBtnProp.removeAttribute("disabled");
	  this.mBtnUp.removeAttribute("disabled");
	  this.mBtnDown.removeAttribute("disabled");
	  return;
	}
	else {
	  this.mBtnNew.removeAttribute("disabled");
	  this.mBtnDel.setAttribute("disabled", "true");
	  this.mBtnProp.setAttribute("disabled", "true");
	  this.mBtnUp.setAttribute("disabled", "true");
	  this.mBtnDown.setAttribute("disabled", "true");
	}
      }
      catch (e) {debug.exception(e)}
    };

    panel.onAnimItemClick = function (aEvent, elem, col)
    {
      if (elem==null||col==null) {
	this.mTreeView.setSelectedRow(-1);
	return;
      }

      if (aEvent.detail==2) {
	// item is double clicked --> propchg
	this.onPropCmd(aEvent);
	aEvent.preventDefault();
	aEvent.stopPropagation();
	return;
      }
    };
    
    panel.onCtxtMenuShowing = function (aEvent)
    {
      var elem = this.mTreeView.getSelectedNode();
      if (elem) {
      }
      else {
      }
    };
    
    ////////////////////////////////////////
    // command impl

    panel.onAddCmd = function (aEvent)
    {
      let scene = cuemol.getScene(this.mTgtSceID);
      let animMgr = scene.getAnimMgr();

      // add new row below the selected row
      let bAppend = true;
      let iselrow = this.mTreeView.getSelectedRow();
      let id = 0;
      if (iselrow>=0) {
	iselrow++;
	let elem = this.mTreeView.getNodeByRow(iselrow);
	if (elem) {
	  bAppend = false;
	  id = elem.obj_id;
	}
      }
      
      var origval = aEvent.target.value;
      var val = origval;
      dd("AnimPanel.onAddCmd:"+val);
      
      // select object to create
      var bhide = false;
      switch (origval) {
      case "ShowAnim":
	val = "ShowHideAnim";
	bhide = false;
	break;
      case "HideAnim":
	val = "ShowHideAnim";
	bhide = true;
	break;
      case "SlideInAnim":
	val = "SlideInOutAnim";
	bhide = false;
	break;
      case "SlideOutAnim":
	val = "SlideInOutAnim";
	bhide = true;
	break;
      }

      var obj = null, refobj = null;
      if (bAppend && animMgr.size-1>=0)
	refobj = animMgr.getAt(animMgr.size-1);
      else if (id-1>=0)
	refobj = animMgr.getAt(id-1);

      try {
	obj = cuemol.createObj(val);
	this.setDefaultValues(animMgr, origval, obj, refobj);
	if ('hide' in obj)
	  obj.hide = bhide;
      }
      catch (e) {
	dd("***** ERROR: animMgr.createObj "+e);
	debug.exception(e);
      }

      // change prop
      if (!this.doPropDialog(obj)) {
	dd("doPropDialog canceled!!");
	return; // canceled
      }

      // add "__current" camera if not exist
      if (!scene.hasCamera("__current")) {
	// create "__current" camera
	let view = this._mainWnd.currentViewW;
	scene.saveViewToCam(view.uid, "__current");
      }

      if (animMgr.startcam=="") {
	// set default start camera
	animMgr.startcam = "__current";
	this.mStartCam.value = "__current";
      }

      // EDIT TXN START //
      scene.startUndoTxn("Add animation");
      
      try {
	if (bAppend)
	  animMgr.append(obj);
	else
	  animMgr.insertBefore(id, obj);
      }
      catch (e) {
	dd("***** ERROR: animMgr.append/insertBefore "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //
    };
    
    /// Setup animation object's default values (time, etc...)
    panel.setDefaultValues = function (animMgr, type, obj, refobj)
    {
      var sgnm = util.makeUniqName2(
	function (a) {return type+a; },
	function (a) {return animMgr.getByName(a);} );
      
      obj.name = sgnm;
      
      // default: add to the last of the anim timeline (as 1 sec anim)
      // let ms_last = animMgr.length.intval;
      if (refobj) {
	obj.timeRefName = refobj.name;
      }

      //obj.start.intval = 0;
      //let xx = obj.start;
      //xx.intval += 1000;
      //obj.end = xx;

      let timetmp = cuemol.createObj("TimeValue");

      timetmp.millisec = 0.0;
      obj.start = timetmp;
      
      timetmp.millisec = 1000.0;
      obj.end = timetmp;
      
      if (type=="SimpleSpin") {
	obj.angle = 360.0;
      }
      else if (type=="MolAnim") {
	obj.prop="frame";
	obj.startValue=0;
	obj.endValue=1;
	let scene = cuemol.getScene(this.mTgtSceID);
	let uids = scene.obj_uids.split(",");
	uids.some( function (elem) {
	  let uid = parseInt(elem);
	  let o = cuemol.getObject(uid);
	  if (o) {
	    let clsnm = cuemol.getClassName(o);
	    dd("Name="+o.name);
	    dd("  ClassName="+clsnm);
	    if (clsnm=="MorphMol") {
	      obj.mol = o.name;
	      return true;
	    }
	  }
	  return false;
	});
      }
    };

    panel.onDeleteCmd = function (aEvent)
    {
      var scene = cuemol.getScene(this.mTgtSceID);
      var animMgr = scene.getAnimMgr();

      let bDelAll = false;
      let elems = null;
      if (!bDelAll)
	elems = this.mTreeView.getSelectedNodeList();

      // EDIT TXN START //
      scene.startUndoTxn("Delete animation");

      try {
	if (bDelAll) {
	  animMgr.clear();
	}
	else {
	  this._deleteEntriesImpl(animMgr, elems);
	}
      }
      catch (e) {
	dd("PaintPanel> ERROR in remove paint entries "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }

      scene.commitUndoTxn();
      // EDIT TXN END //
    };
    
    panel.onPropCmd = function (aEvent)
    {
      var elem = this.mTreeView.getSelectedNode();
      if (!elem) return;
      var id = elem.obj_id;

      var scene = cuemol.getScene(this.mTgtSceID);
      var animMgr = scene.getAnimMgr();

      var obj = animMgr.getAt(id);
      if (obj==null)
	return;

      this.doPropDialog(obj);
    };
    
    panel.onMoveUpCmd = function (aEvent)
    {
      try {
	this._moveUpDownImpl(aEvent, true);
      }
      catch (e) {
	dd("***** ERROR: MoveDown "+e);
	debug.exception(e);
      }
    };

    panel.onMoveDownCmd = function (aEvent)
    {
      try {
	this._moveUpDownImpl(aEvent, false);
      }
      catch (e) {
	dd("***** ERROR: MoveDown "+e);
	debug.exception(e);
      }
    };

    panel._moveUpDownImpl = function (aEvent, bUp)
    {
      var scene = cuemol.getScene(this.mTgtSceID);
      var animMgr = scene.getAnimMgr();

      var nodes = this.mTreeView.getSelectedNodeList();
      var nlen = nodes.length;
      if (nlen==0) {
	dd("AnimPanel.moveUpDownImpl sel=0");
	return;
      }

      let ins_id;
      if (bUp) {
	// move-up mode
	ins_id = nodes[0].obj_id - 1;
	if (ins_id<0)
	  return;
      }
      else {
	// move-down mode
	ins_id = nodes[nlen-1].obj_id + 1;
	let ndata = animMgr.size;
	if (ins_id>=ndata)
	  return;
      }

      let adds = this._getArrayImpl(animMgr, nodes);
      adds.reverse();

      // EDIT TXN START //
      scene.startUndoTxn("Move animobj entry " + (bUp?"up":"down") );
      try {
	this._deleteEntriesImpl(animMgr, nodes);
	this._insertArrayImpl(animMgr, adds, ins_id);
      }
      catch (e) {
	dd("***** ERROR: MoveUp "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //

    };
    
    panel._getArrayImpl = function (animMgr, nodes)
    {
      let nlen = nodes.length;
      if (nlen==0) {
	throw "AnimPanel.getArrayImpl sel=0";
	return null;
      }
  
      let i, id;
      let copyobj = new Array();
      var elem;
      for (i=0; i<nlen; ++i) {
	id = nodes[i].obj_id;
	let selobj = animMgr.getAt(id);
	copyobj.push(selobj);
      }

      return copyobj;
    };

    panel._insertArrayImpl = function (animMgr, adds, id)
    {
      let bAppend;
      if (id>=0) {
	adds.reverse();
	bAppend = false;
      }
      else {
	bAppend = true;
      }

      let norig = animMgr.size;
      let nadds = adds.length;

      for (i=0; i<nadds; ++i) {
	let selobj = adds[i];
	if (bAppend) {
	  // Append mode
	  animMgr.append(selobj);
	}
	else {
	  // Insert-before mode
	  animMgr.insertBefore(id, selobj);
	}
      }

      // select the pasted entries
      try {
	let nstart, nend;
	if (bAppend) {
	  nstart = norig;
	  nend = nstart + nadds-1;
	}
	else {
	  nstart = id;
	  nend = nstart + nadds-1;
	}
	this.mTreeView.rangedSelect(nstart, nend, false);
      }
      catch (e) {
	// ignore errors
	debug.exception(e);
      }
      
    };

    panel._deleteEntriesImpl = function (animMgr, elems)
    {
      let nelems = elems.length;
      if (nelems==0) return;
      let ids = new Array();
      for (let i=0; i<nelems; ++i)
	ids.push(elems[i].obj_id);
      
      // Sort in decending order,
      // to delete reserveing the index order.
      ids.sort( function (a, b) { return b-a; } );
      dd("IDs to delete: "+ids);

      for (i=0; i<nelems; ++i)
	animMgr.removeAt(ids[i]);
    };	


    panel.doPropDialog = function (obj)
    {
      var scene = cuemol.getScene(this.mTgtSceID);
      // return gQm2Main.showPropDlg(obj, scene, window, "animobj");

      var URL = "chrome://cuemol2/content/anim/animobj-propdlg.xul";
#ifdef XP_MACOSX
      var style = "chrome,resizable=yes,dependent,centerscreen,modal";
      var parent_win = null;
#else
      var style = "chrome,resizable=yes,dependent,centerscreen,modal";
      var parent_win = window;
#endif

      var args_obj = {target: obj, scene: scene, bOK: false};
      var args = Cu.getWeakReference(args_obj);
      var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

      var win = ww.openWindow(parent_win,
                              URL, "Animation object settings",
                              style, args);

      dd("done OK="+args_obj.bOK);
      return args_obj.bOK;
    };

    panel.onStartCamChanged = function (aEvent)
    {
      //dd("startCamChg: "+debug.dumpObjectTree(aEvent));
      var selected = this.mStartCam.value;
      dd("AnimPanel.startCamChged: "+selected);

      var scene = cuemol.getScene(this.mTgtSceID);
      var animMgr = scene.getAnimMgr();

      if (animMgr.startcam!=selected) {
	animMgr.startcam = this.mStartCam.value;
      }
    };

  } )();
}

