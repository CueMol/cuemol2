// -*-Mode: C++;-*-
//
// coloring-panel.js: coloring sidepanel implementation
//
// $Id: coloring-panel.js,v 1.32 2011/05/01 09:28:03 rishitani Exp $
//

if (!("paint" in cuemolui.panels)) {

  ( function () {

    const COL_UNKNOWN = 0;
    const COL_SOLID   = 1;
    const COL_PAINT   = 2;
    const COL_CPK     = 3;
    const COL_SIMPLE  = 4;
    const COL_RAINBOW = 5;
    const COL_BFAC    = 6;
    const COL_ELEPOT  = 7;
    const COL_SCRIPT  = 8;
    const COL_MULTIGRAD  = 9;

    var panel = cuemolui.panels.paint = new Object();

    // panel's ID
    panel.id = "coloring-panel";

    panel.collapsed = false;
    panel.command_id = "menu-coloring-panel-toggle";

    panel.mLoaded = false;
    panel.mTgtRendID = -1;
    panel.mTgtSceID = 0;

    // type name of target coloring obj
    panel.mTgtColType = null;

    panel.mPanelDeck = null;

    window.addEventListener("load", function(){panel.onLoad();}, false);
    // window.addEventListener("unload", function() {panel.onUnLoad();}, false);

    ////////////////////////////////////////
    // setup paint listbox (implemented by tree widget)

    panel.mTreeView = new cuemolui.TreeView(window, "paint-listbox");
    panel.mTreeView.clickHandler = function (ev, row, col) {
      panel.onPaintItemClick(ev, row, col);
    }
    panel.mTreeView.defCtxtMenuId = "paintPanelCtxtMenu";

    // dummy serial number to invalidate the CSS color (for paint listbox)
    panel.serial = 0;

    ////////////////////////////////////////
    // setup object/renderer menulist

    var paint_coloring_filter = function (elem)
    {
      // dd("PaintColoringFilter> checking "+elem.name);
      var rend = cuemol.getUIDObj(elem.ID);
      if (!rend)
        return false;

      if (!("coloring" in rend)) {
        // dd("PaintColoringFilter> uobj "+rend.name+" has no coloring");
        // check multi-grad renderer
        if ("multi_grad" in rend)
          return true;
        
        return false;
      }

      if (elem.cat=="rend") {
        // elem is supplied by Scene.getObjectTreeJSON() method
        // if (rend.coloring._wrapped.getClassName()!="PaintColoring") return false;

        // do not display the selection renderer
        if (elem.type=="*selection")
          return false;

        return true;
      }
      else if (elem.cat=="obj") {
        return true;
      }

      // dd("PaintColoringFilter> uobj "+rend.name+" rejected");
      return false;
    };

    ////////
    // "potential object" menulist for ELEPOT mode

    panel.mPotSel = new cuemolui.ObjMenuList(
      "paint-elepot-obj-selector",
      window,
      function (elem) { return (elem.type=="ElePotMap")?true:false; },
      cuemol.evtMgr.SEM_OBJECT);

    ////////
    // "colormap object" menulist for MULTIGRAD mode

    panel.mColMapSel = new cuemolui.ObjMenuList(
      "paint-colmap-obj-selector",
      window,
      function (elem) { return (elem.type=="ElePotMap"||elem.type=="DensityMap")?true:false; },
      cuemol.evtMgr.SEM_OBJECT);


    ////////
    // Initialize Panel's main selector menulist mSelector
    // (this should be initialized finally, so that the event handlers of mSelector will be called finally)

    panel.mSelector = new cuemolui.ObjMenuList(
      "colpanel-rend-menulist",
      window,
      paint_coloring_filter,
      cuemol.evtMgr.SEM_RENDERER|cuemol.evtMgr.SEM_OBJECT);
    
    // set listener for receiving all property changes (for widget update)
    panel.mSelector.addPropChgListener("*", function(args) {panel.targetPropChanged(args)} );
    
    //////////////////////////
    // methods

    /// Solid coloring mode
    panel._setupSolidColoring = function (aUobj)
    {
      this.mPanelDeck.selectedIndex = 1;
      this.mTgtColType = COL_SOLID;
      if ('coloring' in aUobj) {
        this.mColClassName.value = "Coloring type: " + aUobj.coloring._wrapped.getClassName();
        this.mColMenu.disabled = false;
      }
      else {
        this.mColClassName.value = "";
        this.mColMenu.disabled = true;
      }
    };

    /// Has coloring prop but value is null
    panel._setupUnknownColoring = function ()
    {
      this.mPanelDeck.selectedIndex = 0;
      this.mTgtColType = COL_UNKNOWN;
      this.mColMenu.disabled = true;
    };

    panel._selectDeckById = function (aId)
    {
      var elem = util.getChildById(this.mPanelDeck, aId);
      if (elem) {
        this.mPanelDeck.selectedPanel = elem;
      }
      else {
        this.mPanelDeck.selectedIndex = 0;
      }
    };

    panel._setupPaintColoring = function (aRend, coloring)
    {
      ///////////////////////
      // Setup paint coloring
      
      this.mTgtColType = COL_PAINT;
      // remove existing rules
      this._removePaintColCSS();
      
      this._selectDeckById("coloring-deck-paint");
      var i, col, sel, nlen = coloring.size;
      var nodes = new Array();
      
      for (i=0; i<nlen; ++i) {
        sel = coloring.getSelAt(i);
        col = coloring.getColorAt(i);
        dd("sel="+sel+", col="+col);
        var node = new Object();
        node.obj_id = i;
        node.name = sel.toString();
        node.values = { paint_value: col.toString() };
        // node.props = { paint_value_imgsrc: "chrome://cuemol2/content/images/visible1-dis.png" };
        var propval = "col_"+this.serial+"_"+i;
        node.props = { paint_value: propval };
        nodes.push(node);
        this._setPaintColCSS(propval, col);
      }
      
      // New button is always enabled
      this.mBtnNew.removeAttribute("disabled");
      
      //var elem = document.getElementById("paint-listbox-children");
      //dd("listbox styyle="+elem.style.cssText);
      
      
      /*
// DEBUG: dump all style sheet rules
  var nlen = document.styleSheets.length;
  for (i=0; i<nlen; ++i) {
    var ss = document.styleSheets[i];
    for (var j=0; j<ss.cssRules.length; ++j) {
      var sr = ss.cssRules[j];
      // dd("css "+i+", "+j+" = "+sr);
      // if ('cssText' in sr)
      // dd("css ="+sr.cssText);
      if ('selectorText' in sr &&
          sr.selectorText.indexOf("#paint-listbox-children::-moz-tree-cell")==0) {
        dd("css sel="+sr.cssText);
        // dd("css sel="+sr.selectorText);
        // sr.style.setProperty("background", "blue", "important");
      }
    }
  }
*/

      ++this.serial;
      this.mTreeView.setData(nodes);
    };

/// Setup main panel
panel._setupData = function (aRend)
{
  // dd("PaintPanel._setupData> Rend id="+aRend.uid+
  // ", type="+aRend._wrapped.getClassName()+
  // ", coloring="+aRend.coloring);

  let res = true;

  if (!('coloring' in aRend) || aRend.coloring==null) {
    dd("ColoringPanel> target "+aRend.name+" has no coloring");
    //alert("ColoringPanel> target "+aRend.name+" has no coloring");

    // check multi-grad color for scalar-field renderers
    if ('multi_grad' in aRend &&
        aRend.colormode=="multigrad") {
      this._selectDeckById("coloring-deck-multigrad");
      this.mTgtColType = COL_MULTIGRAD;
      this.mColMenu.disabled = false;
      res = true;
    }
    else if ('defaultcolor' in aRend) {
      this._setupSolidColoring(aRend);
      if ('multi_grad' in aRend)
        this.mColMenu.disabled = false;
      res = true;
    }
    else {
      // Unknown renderer
      this._setupUnknownColoring(aRend);
      // ERROR ??
      res = false;
    }

    // Setup the coloring pull-down menulist
    this.setupColoringSelector(aRend);

    return res;
  }

  // dd("*** COLORING rend.coloring._wrapped: "+aRend.coloring._wrapped);
  // dd("*** COLORING classname: "+aRend.coloring._wrapped.getClassName());

  this.mColMenu.disabled = false;

  var coloring = aRend.coloring;
  var clsname = coloring._wrapped.getClassName();
  var rend_type = "";
  if ('type_name' in aRend)
    rend_type = aRend.type_name;

  // make the coloring pull-down menulist
  this.setupColoringSelector(aRend);

  // check surface mesh renderers
  if (rend_type == "molsurf" || rend_type == "dsurface") {
    if (aRend.colormode == "potential") {
      this._selectDeckById("coloring-deck-elepot");
      this.mTgtColType = COL_ELEPOT;
      return true;
    }

    if ('multi_grad' in aRend &&
        aRend.colormode=="multigrad") {
      this._selectDeckById("coloring-deck-multigrad");
      this.mTgtColType = COL_MULTIGRAD;
      return true;
    }
  }

  if (clsname == "CPKColoring") {
    this._selectDeckById("coloring-deck-cpk");
    this.mTgtColType = COL_CPK;
    return true;
  }
  else if (clsname == "RainbowColoring") {
    this._selectDeckById("coloring-deck-rainbow");
    this.mTgtColType = COL_RAINBOW;
    return true;
  }
  else if (clsname == "BfacColoring") {
    this._selectDeckById("coloring-deck-bfac");
    this.mTgtColType = COL_BFAC;
    return true;
  }
  else if (clsname == "ScriptColoring") {
    this._selectDeckById("coloring-deck-script");
    this.mTgtColType = COL_SCRIPT;
    return true;
  }

  if (clsname=="PaintColoring") {
    this._setupPaintColoring(aRend, coloring);
    return true;
  }

  /*if (clsname=="AtomPropColoring") {
    this._setupUnknownColoring(aRend);
    return true;
    }*/

  this._setupSolidColoring(aRend);
  return true;
};

panel._removePaintColCSS = function ()
{
  var i, nlen = document.styleSheets.length;
  for (i=0; i<nlen; ++i) {
    var ss = document.styleSheets[i];
    for (var j=ss.cssRules.length-1; j>=0; --j) {
      var sr = ss.cssRules[j];
      if ('selectorText' in sr &&
          sr.selectorText.indexOf("#paint-listbox-children::-moz-tree-cellcol")==0) {
        ss.deleteRule(j);
      }
    }
  }
}

panel._setPaintColCSS = function (aPropName, aColor)
{
  var strcol = "rgb("+aColor.r()+","+aColor.g()+","+aColor.b()+")";

  var ss = document.styleSheets[document.styleSheets.length-1];
  var propnm = aPropName; //"col"+aInd;
  var insid = ss.insertRule("#paint-listbox-children::-moz-tree-cell("+propnm+") {}",
                            ss.cssRules.length);
  var sr = ss.cssRules[insid];
  sr.style.backgroundColor = strcol;
}

/// Setup coloring selector dropdown menu
panel.setupColoringSelector = function (aRend)
{
  var rend_type = "";
  if ('type_name' in aRend)
    rend_type = aRend.type_name;

  if ("multi_grad" in aRend) {
    document.getElementById("paint-type-multigrad").hidden = false;
  }
  else {
    document.getElementById("paint-type-multigrad").hidden = true;
  }

  if ("coloring" in aRend) {
    document.getElementById("paint-type-paint-popup").hidden = false;
    document.getElementById("paint-type-cpk").hidden = false;
    document.getElementById("paint-type-bfac").hidden = false;
    document.getElementById("paint-type-rainbow").hidden = false;
    document.getElementById("paint-type-elepot").hidden = false;
    document.getElementById("paint-type-resetdef").hidden = false;
  }
  else {
    document.getElementById("paint-type-paint-popup").hidden = true;
    document.getElementById("paint-type-cpk").hidden = true;
    document.getElementById("paint-type-bfac").hidden = true;
    document.getElementById("paint-type-rainbow").hidden = true;
    document.getElementById("paint-type-elepot").hidden = true;
    document.getElementById("paint-type-resetdef").hidden = true;
  }
  
  if (rend_type == "molsurf" || rend_type == "dsurface") {
    document.getElementById("paint-type-elepot").hidden = false;
  }
  else {
    document.getElementById("paint-type-elepot").hidden = true;
  }
}

/// Perform initialization (complete update) of widgets from model (i.e. renderer) data
panel._initWidgets = function (aRend)
{
  var type = this.mTgtColType;

  switch (type) {
  case  COL_PAINT: {
    this.mTreeView.buildView();
    break;
  }
  case COL_SOLID: {
    this.updateSolidWidgets(aRend);
    break;
  }
  case COL_CPK: {
    this.mCPKColC.setTargetSceneID(this.mTgtSceID);
    this.mCPKColN.setTargetSceneID(this.mTgtSceID);
    this.mCPKColO.setTargetSceneID(this.mTgtSceID);
    this.mCPKColP.setTargetSceneID(this.mTgtSceID);
    this.mCPKColS.setTargetSceneID(this.mTgtSceID);
    this.mCPKColH.setTargetSceneID(this.mTgtSceID);
    this.mCPKColX.setTargetSceneID(this.mTgtSceID);
    this.updateCPKAll(aRend);
    break;
  }
  case COL_RAINBOW: {
    this.updateRainbowWidgets(aRend);
    break;
  }
  case COL_BFAC: {
    this.updateBfacWidgets(aRend);
    break;
  }
  case COL_ELEPOT: {
    this.updateElepotWidgets(aRend);
    break;
  }
  case COL_SCRIPT: {
    this.updateScriptWidgets(aRend);
    break;
  }
  case COL_MULTIGRAD: {
    this.updateMultigradWidgets(aRend);
    break;
  }
  }
}

/// Perform (partial) update of widgets from model (i.e. renderer) data
panel._updateWidgets = function (aRend, aPropName, aParentName)
{
  var type = this.mTgtColType;

  switch (type) {
  case COL_PAINT: {
    this.mTreeView.buildView();
    return;
  }
  case COL_SOLID: {
    this.updateSolidWidgets(aRend);
    return;
  }
  case COL_CPK: {
    if (aParentName=="coloring")
      this.updateCPK(aRend, aPropName);
    else 
      this.updateCPKAll(aRend);
    return;
  }
  case COL_RAINBOW: {
    if (aParentName=="coloring")
      this.updateRainbowWidgets(aRend, aPropName);
    else 
      this.updateRainbowWidgets(aRend);
    return;
  }
  case COL_BFAC: {
    if (aParentName=="coloring")
      this.updateBfacWidgets(aRend, aPropName);
    else 
      this.updateBfacWidgets(aRend);
    return;
  }
  case COL_ELEPOT: {
    if (aPropName=="colormode")
      // color-mode change --> update all widgets
      this.updateElepotWidgets(aRend);
    else 
      this.updateElepotWidgets(aRend, aPropName);
    return;
  }
  case COL_SCRIPT: {
    this.updateScriptWidgets(aRend);
    break;
  }
  case COL_MULTIGRAD: {
    this.updateMultigradWidgets(aRend);
    break;
  }
  }
}

panel.attachRenderer = function (aRend)
{
  if (typeof aRend == 'undefined' || aRend==null) {
    // no target renderer
    this._setupUnknownColoring(aRend);
    return;
  }

  this.mTgtRendID = aRend.uid;
  this.mTgtSceID = aRend.getScene().uid;

  // This is initial update, so we have to do complete update.
  if (this._setupData(aRend))
    this._initWidgets(aRend);
}

panel.detachRenderer = function ()
{
}

//////////////////////////
// event handlers

panel.onLoad = function ()
{
  try {

    var that = this;

    this.mColMenu = document.getElementById("colpanel-coloring-menu");

    // Setup the toolbuttons/widgets
    this.mPanelDeck = document.getElementById("colpanel-deck");
    this.mColClassName = document.getElementById("colpanel-clsname");

    this.mBtnNew = document.getElementById("paintpanel-addbtn");
    this.mBtnDel = document.getElementById("paintpanel-delbtn");
    this.mBtnProp = document.getElementById("paintpanel-propbtn");
    this.mBtnUp = document.getElementById("paintpanel-moveupbtn");
    this.mBtnDown = document.getElementById("paintpanel-movedownbtn");

    // Setup event handlers

    this.mSelector.addSelChanged(function(aEvent) {
      try { that.targetChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });

    this.mTreeView.addEventListener("select", function(e) { that.onTreeSelChanged(); }, false);

    // Setup Solid coloring panel
    this.loadSolidWidgets();

    // Setup CPKColoring panel
    this.loadCPKWidgets();

    /// Rainbow coloring panel
    this.loadRainbowWidgets();

    /// Bfac coloring panel
    this.loadBfacWidgets();

    /// Elepot coloring panel
    this.loadElepotWidgets();

    this.loadScriptWidgets();

    // Multigrad panel
    this.loadMultigradWidgets();

    // set listener for elepot-obj-selector "select" change event
    this.mPotSel.addSelChanged(function(args) {that.onPotSelChanged(args)});

    this.mLoaded = true;
  }
  catch (e) {
    debug.exception(e);
  }
}

panel.onUnLoad = function ()
{
  detachRenderer();
  this.mLoaded = false;
}

panel.onPanelShown = function ()
{
  if (this.mLoaded) {
    this.mTreeView.ressignTreeView();
    this.targetChanged(null);
  }
  // alert("Panel "+this.id+" shown");
}

panel.onPanelMoved = function ()
{
  if (this.mLoaded) {
    this.mTreeView.ressignTreeView();
    this.targetChanged(null);
  }
}

panel.onPanelClosed = function ()
{
  // alert("Panel "+this.id+" closed");
};

panel.onPaintColShowing = function (aEvent)
{
  try {
    var uobj = cuemol.getUIDObj(this.mTgtRendID);
    var menu = aEvent.currentTarget.menupopup;
    if ('style' in uobj) {
      // uobj has style (i.e. rend)
      cuemolui.populateStyleMenus(uobj.scene_uid, menu, /Paint$/, true);
    }
    else {
      // uid does not support style (i.e. obj)
      util.clearMenu(menu);
      util.appendMenu(document, menu, "paint-type-paint", "Default");
    }
  }
  catch (e) { debug.exception(e); }

  // cuemolui.onPaintColShowing(aEvent);
};

panel.onChgColoring = function (aEvent)
{
  try {
    if (!this.mTgtRendID) {
      dd("onChgColoring> ERROR: mTgtRendID=null!!");
      return;
    }

    dd("onChgCol> tgtrend id "+this.mTgtRendID);
    let rend = cuemol.getUIDObj(this.mTgtRendID);
    let id = aEvent.originalTarget.value;

    if (id=="paint-type-resetdef") {
      // EDIT TXN START //
      let scene = rend.getScene();
      scene.startUndoTxn("Reset coloring style");
      try {
        cuemol.resetProp(rend, "coloring");
      }
      catch (e) {
        debug.exception(e);
        scene.rollbackUndoTxn();
        return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //
      return;
    }
    else if (id=="paint-type-multigrad") {
      this.setDefaultMultiGrad(rend);
      return;
    }

    if (!('coloring' in rend)) {
      if (id=="paint-type-solid") {
        if ("colormode" in rend) {
          // EDIT TXN START //
          let scene = rend.getScene();
          scene.startUndoTxn("Set solid coloring");
          try {
            rend.colormode = "solid";
          }
          catch (e) {
            debug.exception(e);
            scene.rollbackUndoTxn();
            return;
          }
          scene.commitUndoTxn();
          // EDIT TXN END //
        }
      }
      return;
    }

    let rend_type = "";
    if ('type_name' in rend)
      rend_type = rend.type_name;

    if (rend_type=="molsurf" || rend_type == "dsurface") {
      if (id=="paint-type-elepot") {
        this.setDefaultElepot(rend);
        return;
      }
    }


    dd("setRendColoring: id="+id+", rend="+rend.name);
    gQm2Main.setRendColoring(id, rend);
  }
  catch (e) {
    debug.exception(e);
  }
};

/// obj/rend-listbox selection (target) is changed
panel.targetChanged = function (scid)
{
  if (!this.shown) {
    dd("PaintPanel targetChanged, but panel is not shown: "+this.shown);
    return;
  }

  var obj;
  try {
    obj = this.mSelector.getSelectedObj();
    dd("PaintPanel, targetChanged selected="+obj+", this.mTreeView="+this.mTreeView);
    this.detachRenderer();
    this.attachRenderer(obj);
  }
  catch (e) {
    dd("Error in panel.targetSceneChanged !!");
    debug.exception(e);
  }
  obj = null;
}

/// Property of renerer is changed
/// ATTN: Event for all renderers in the scene will be reported.
panel.targetPropChanged = function (args)
{
  var rend;

  // filter out unrelated events
  if (this.mTgtRendID<1 ||
      this.mTgtRendID!=args.obj.target_uid) return;

  var propname = args.obj.propname;
  var parentname = args.obj.parentname;
  dd("PaintPanel> TargetPropChanged prop: "+propname);
  dd("PaintPanel> TargetPropChanged parent: "+parentname);

  if (propname=="styles" ||
      propname=="coloring" ||
      parentname=="coloring" ||
      propname=="colormode") {
    rend = cuemol.getUIDObj(this.mTgtRendID);
    if (!rend) {
      dd("PaintPanel.targetPropChanged> error, invalid target rend id="+this.mTgtRendID);
      return;
    }
    if (this._setupData(rend)) {
      //dd("PaintPanel.targetPropChanged> call update w prop="+propname);
      this._updateWidgets(rend, propname, parentname);
    }
  }
}

/// Commit property change
panel.commitPropChange = function (aPropName, aPropVal, aMsg)
{
  var rend = cuemol.getUIDObj(this.mTgtRendID);
  if ( !rend || !('coloring' in rend) ) return;
  var scene = rend.getScene();
  if (!scene) return;
  var coloring = rend.coloring;

  // EDIT TXN START //
  scene.startUndoTxn(aMsg);
  try {
   if (rend._wrapped.isPropDefault("coloring"))
      rend.coloring = coloring;

    coloring._wrapped.setProp(aPropName, aPropVal);
  }
  catch (e) {
    dd("PaintPanel.commitPropChg> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
}

////////////////////////////////////////////////////////////////
// Paint coloring implementation

/// selection of paint element list is changed
panel.onTreeSelChanged = function ()
{
  var elem = this.mTreeView.getSelectedNode();
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

panel.onPaintItemClick = function (aEvent, elem, col)
{
  if (elem==null||col==null) {
    this.mTreeView.setSelectedRow(-1);
    return;
  }
  if (aEvent.detail==2) {
    // dblclicked --> propchg
    this.onPropCmd(aEvent);
    aEvent.preventDefault();
    aEvent.stopPropagation();
    return;
  }
}

panel.onAddCmd = function (aEvent)
{
  // try {

  var rend = cuemol.getUIDObj(this.mTgtRendID);
  if ( !rend || !('coloring' in rend) ) return;
  var coloring = rend.coloring;
  var scene = rend.getScene();

  // check current mol selection
  var cursel = null;
  try {
    var mol = rend.getClientObj();
    if (mol.sel && mol.sel.toString())
      cursel = mol.sel;
  }
  catch (e) {
    dd("PaintPanel> rend client is not a mol??");
  }

  // check selected tree node
  var elem = this.mTreeView.getSelectedNode();
  var id = 0;
  if (elem)
    id = elem.obj_id;

  // prepare default sel and col
  var args = new Object();
  args.scene_id = scene.uid;
  args.rend_id = rend.uid;
  args.sel = cursel;
  if (id<coloring.size) {
    if (args.sel==null)
      args.sel = coloring.getSelAt(id);
    args.col = coloring.getColorAt(id);
  }
  else {
    if (args.sel==null)
      args.sel = cuemol.makeSel("*");
    args.col = cuemol.makeColor("#FFF");
  }

  dd("defval.sel: "+args.sel.toString());
  dd("defval.col: "+args.col.toString());

  // show paintprop dialog
  window.openDialog("chrome://cuemol2/content/paint-propdlg.xul",
                    "New paint property",
                    "chrome,modal,resizable=no,dependent,centerscreen",
                    args);

  dd("rval.sel: "+args.sel.toString());
  dd("rval.col: "+args.col.toString());
  dd("rval.OK: "+args.bOK);

  if (!args.bOK)
    return;

  //dd("onAddCmd elem="+require("debug_util").dumpObjectTree(elem, 1));


  // EDIT TXN START //
  scene.startUndoTxn("Add paint entry");

  try {
    if (rend._wrapped.isPropDefault("coloring"))
      rend.coloring = coloring;
    coloring.insertBefore(id, args.sel, args.col);
  }
  catch (e) {
    dd("***** ERROR: insewrtBefore "+e);
    debug.exception(e);
  }

  scene.commitUndoTxn();
  // EDIT TXN END //

  // } catch (e) { debug.exception(e); }
};

panel._deletePaintEntriesImpl = function (elems, coloring)
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
    coloring.removeAt(ids[i]);
};

panel.onDeleteCmd = function (aEvent)
{
  try {
    var bDelAll = false;
    if (aEvent.target.id=="paintpanel-delallbtn")
      bDelAll = true;

    let elems = null;
    if (!bDelAll)
      elems = this.mTreeView.getSelectedNodeList();

    // get rend, coloring, and scene
    var rend, coloring, scene;
    rend = cuemol.getUIDObj(this.mTgtRendID);
    coloring = rend.coloring;
    scene = rend.getScene();

    // EDIT TXN START //
    scene.startUndoTxn("Remove paint entry");
    try {
      if (rend._wrapped.isPropDefault("coloring"))
        rend.coloring = coloring;
      if (bDelAll)
        coloring.clear();
      else {
        //for (i=0; i<nelems; ++i)
        //coloring.removeAt(ids[i]);
        this._deletePaintEntriesImpl(elems, coloring);
      }
    }
    catch (e) {
      dd("PaintPanel> ERROR in remove paint entries "+e);
      debug.exception(e);
    }
    scene.commitUndoTxn();
    // EDIT TXN END //

  } catch (e) { debug.exception(e); }
}

panel.onPropCmd = function (aEvent)
{
  var elem = this.mTreeView.getSelectedNode();
  if (!elem) return;
  var id = elem.obj_id;

  var rend = cuemol.getUIDObj(this.mTgtRendID);
  if ( !rend || !('coloring' in rend) ) return;
  var coloring = rend.coloring;

  var scene = rend.getScene();
  if (!scene) return;

  var args = new Object();
  args.scene_id = scene.uid;
  args.rend_id = rend.uid;
  args.sel = coloring.getSelAt(id);
  args.col = coloring.getColorAt(id);
  args.rval = new Object();
  args.rval.sel = null;
  args.rval.col = null;

  window.openDialog("chrome://cuemol2/content/paint-propdlg.xul",
                    "Paint property",
                    "chrome,modal,resizable=no,dependent,centerscreen",
                    args);

  dd("rval.sel: "+args.sel.toString());
  dd("rval.col: "+args.col.toString());
  dd("rval.OK: "+args.bOK);

  if (!args.bOK)
    return;

  // EDIT TXN START //
  scene.startUndoTxn("Change paint entry");
  try {
    if (rend._wrapped.isPropDefault("coloring"))
      rend.coloring = coloring;
    coloring.changeAt(id, args.sel, args.col);
  }
  catch (e) {
    dd("***** ERROR: ChangeAt "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

///////////////

panel.onCtxtMenuShowing = function (aEvent)
{
  // TO DO: check clipboard and enable/disable the "paste" menu here
};

/// Copy the coloring entry to the clipboard
panel.onCopy = function (aEvent)
{
  try {
    let rend = cuemol.getUIDObj(this.mTgtRendID);
    let nodes = this.mTreeView.getSelectedNodeList();
    let copyobj = this._copyPaintEntryImpl(rend, nodes, true);
    let copystr = JSON.stringify(copyobj);
    let clipboard = require("qsc-copipe");
    dd("Paint.onCopy copystr = "+copystr);

    clipboard.set(copystr, "qscpaint");
  }
  catch (e) {
    debug.exception(e);
  }
};

/// Cut the coloring entry (=copy and delete)
panel.onCut = function (aEvent)
{
  this.onCopy(aEvent);
  this.onDeleteCmd(aEvent);
};

/// Paste the coloring entry from the clipboard
panel.onPaste = function (aEvent)
{
  let i;

  try {
    let rend = cuemol.getUIDObj(this.mTgtRendID);
    let scene = rend.getScene();

    let clipboard = require("qsc-copipe");
    let jsondat = clipboard.get("qscpaint");
    if (!jsondat) {
      dd("PastePaint, ERROR: "+jsondat);
      return;
    }

    // build pasting object
    let adds = new Array();
    {
      let obj = JSON.parse(jsondat);
      let nobjs = obj.length;
      for (i=0; i<nobjs; ++i) {
	try {
	  let selobj = cuemol.makeSel(obj[i].sel, scene.uid);
	  let colobj = cuemol.makeColor(obj[i].col, scene.uid);
	  adds.push({"selobj": selobj, "colobj": colobj});
	}
	catch (e) {
	  // ignore error
	  debug.exception(e);
	  dd("WARN: Build paste obj "+i+" failed, json="+jsondat);
	}
      }
    }
    let id = this._getPaintSelImpl();

    // EDIT TXN START //
    scene.startUndoTxn("Paste paint entry");

    try {
      this._pasteImpl(rend, adds, id);
    }
    catch (e) {
      dd("***** ERROR: insertBefore "+e);
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }
    
    scene.commitUndoTxn();
    // EDIT TXN END //
  }
  catch (e) {
    debug.exception(e);
  }
};

panel._copyPaintEntryImpl = function (rend, nodes, bString)
{
  let coloring = rend.coloring;
  let nlen = nodes.length;
  if (nlen==0) {
    dd("PaintDeck.onCopy sel=0");
    return null;
  }
  
  let i, id;
  let copyobj = new Array();
  var elem;
  for (i=0; i<nlen; ++i) {
    id = nodes[i].obj_id;
    let selobj = coloring.getSelAt(id);
    let colobj = coloring.getColorAt(id);
    let sel = selobj.toString();
    let col = colobj.toString();
    dd("MakePaintEntry obj id="+id+", sel="+sel+", col="+col);
    if (bString)
      elem = {"sel": sel, "col": col};
    else
      elem = {"selobj": selobj, "colobj": colobj};

    copyobj.push(elem);
  }

  return copyobj;
}

panel._pasteImpl = function (rend, adds, id)
{
  let coloring = rend.coloring;

  // if the coloring is default,
  // copy and make new non-default instance.
  if (rend._wrapped.isPropDefault("coloring"))
    rend.coloring = coloring;

  let bAppend;
  if (id>=0) {
    adds.reverse();
    bAppend = false;
  }
  else {
    bAppend = true;
  }

  let norig = coloring.size;
  let nadds = adds.length;

  for (i=0; i<nadds; ++i) {
    let selobj = adds[i].selobj;
    let colobj = adds[i].colobj;
    if (bAppend) {
      // Append mode
      coloring.append(selobj, colobj);
    }
    else {
      // Insert-before mode
      coloring.insertBefore(id, selobj, colobj);
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
    //let that = this;
    //setTimeout( function() {
    //that.mTreeView.rangedSelect(nstart, nend, false);
    //}, 0);
  }
  catch (e) {
    // ignore errors
    debug.exception(e);
  }

};

panel._getPaintSelImpl = function ()
{
  let elems = this.mTreeView.getSelectedNodeList();
  if (elems==null) return -1;
  let nelems = elems.length;
  if (nelems==0) return -1;
  //return elems[nelems-1].obj_id;
  return elems[0].obj_id;
}

//////////

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
  let rend = cuemol.getUIDObj(this.mTgtRendID);
  let scene = rend.getScene();
  let coloring = rend.coloring;

  let nodes = this.mTreeView.getSelectedNodeList();
  let nlen = nodes.length;
  if (nlen==0) {
    dd("PaintDeck.onCopy sel=0");
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
    let ndata = coloring.size;
    if (ins_id>=ndata)
      return;
  }
  let adds = this._copyPaintEntryImpl(rend, nodes, false);
  adds.reverse();

  // EDIT TXN START //
  scene.startUndoTxn("Move paint entry " + (bUp?"up":"down") );
  try {
    if (rend._wrapped.isPropDefault("coloring"))
      rend.coloring = coloring;

    this._deletePaintEntriesImpl(nodes, coloring);
    this._pasteImpl(rend, adds, ins_id);
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

////////////////////////////////////////////////////////////////
// Solid coloring implementation

panel.loadSolidWidgets = function ()
{
  this.mSolidCol = document.getElementById("paint-default-color");
};

panel.updateSolidWidgets = function (aRend)
{
  this.mSolidCol.setTargetSceneID(this.mTgtSceID);
  this.mSolidCol.setColorObj(aRend.defaultcolor);
};

panel.onDefaultColorChanged = function (aEvent)
{
  try {
    if (!aEvent.isCompleted)
      return; // --> popup is still open

    color = aEvent.target.getColorObj();
    this.commitRendPropChange("defaultcolor", color._wrapped, "Change solid coloring");

  }
  catch (e) { debug.exception(e); }
};

/// Commit property change
panel.commitRendPropChange = function (aPropName, aPropVal, aMsg)
{
  var rend = cuemol.getUIDObj(this.mTgtRendID);
  if ( !rend || !('coloring' in rend) )
    return;
  var scene = rend.getScene();
  if (!scene)
    return;

  // EDIT TXN START //
  scene.startUndoTxn(aMsg);
  try {
    rend._wrapped.setProp(aPropName, aPropVal);
  }
  catch (e) {
    dd("PaintPanel.commitRendPropChg> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
}

////////////////////////////////////////////////////////////////
// CPK coloring implementation

panel.loadCPKWidgets = function()
{
  this.mCPKColC = document.getElementById("cpk_col_C");
  this.mCPKColN = document.getElementById("cpk_col_N");
  this.mCPKColO = document.getElementById("cpk_col_O");
  this.mCPKColS = document.getElementById("cpk_col_S");
  this.mCPKColP = document.getElementById("cpk_col_P");
  this.mCPKColH = document.getElementById("cpk_col_H");
  this.mCPKColX = document.getElementById("cpk_col_X");
};

/// Data --> widget (all)
panel.updateCPKAll = function (aRend)
{
  var coloring = aRend.coloring;
  this.mCPKColC.setColorObj(coloring.col_C);
  this.mCPKColN.setColorObj(coloring.col_N);
  this.mCPKColO.setColorObj(coloring.col_O);
  this.mCPKColP.setColorObj(coloring.col_P);
  this.mCPKColS.setColorObj(coloring.col_S);
  this.mCPKColH.setColorObj(coloring.col_H);
  this.mCPKColX.setColorObj(coloring.col_X);
};

/// Data --> widget (specific)
panel.updateCPK = function (aRend, aPropName)
{
  dd("PaintPanel.updateCPK> prop="+aPropName);
  var coloring = aRend.coloring;
  switch (aPropName) {
  case "col_C":
    this.mCPKColC.setColorObj(coloring.col_C);
    break;
  case "col_N":
    this.mCPKColN.setColorObj(coloring.col_N);
    break;
  case "col_O":
    this.mCPKColO.setColorObj(coloring.col_O);
    break;
  case "col_P":
    this.mCPKColP.setColorObj(coloring.col_P);
    break;
  case "col_S":
    this.mCPKColS.setColorObj(coloring.col_S);
    break;
  case "col_H":
    this.mCPKColH.setColorObj(coloring.col_H);
    break;
  case "col_X":
    this.mCPKColX.setColorObj(coloring.col_X);
    break;
  }
};

// CPK coloring event handling (Widget --> data)
panel.onCPKColChanged = function (aEvent)
{
  try {
  if (!aEvent.isCompleted)
    return; // --> popup is still open
  var id = aEvent.target.id;
  var color, propnm;
  switch (id) {
  case "cpk_col_C":
    propnm = "col_C";
    break;
  case "cpk_col_N":
    propnm = "col_N";
    break;
  case "cpk_col_O":
    propnm = "col_O";
    break;
  case "cpk_col_S":
    propnm = "col_S";
    break;
  case "cpk_col_P":
    propnm = "col_P";
    break;
  case "cpk_col_H":
    propnm = "col_H";
    break;
  case "cpk_col_X":
    propnm = "col_X";
    break;
  default:
    return;
  }
  color = aEvent.target.getColorObj();

  this.commitPropChange(propnm, color._wrapped, "Change CPK coloring");

  } catch (e) { debug.exception(e); }

};

////////////////////////////////////////////////////////////////
// Rainbow coloring implementation

panel.loadRainbowWidgets = function ()
{
  this.mRnbMode = document.getElementById("paint-rnb-mode");
  this.mRnbIncrMode = document.getElementById("paint-rnb-incrmode");
  this.mRnbStaH = document.getElementById("paint-rnb-starth");
  this.mRnbEndH = document.getElementById("paint-rnb-endh");
  this.mRnbBri = document.getElementById("paint-rnb-bri");
  this.mRnbSat = document.getElementById("paint-rnb-sat");
};

/// Data --> widgets
panel.updateRainbowWidgets = function (aRend, aPropName)
{
  var coloring = aRend.coloring;

  if (aPropName==undefined ||
      aPropName=="mode") {
    util.selectMenuListByValue(this.mRnbMode, coloring.mode);
  }

  if (aPropName==undefined ||
      aPropName=="incr_mode") {
    dd("updateRainbowWidgets prop="+aPropName+", value="+coloring.incr_mode);
    util.selectMenuListByValue(this.mRnbIncrMode, coloring.incr_mode);
  }
  
  if (aPropName==undefined ||
      aPropName=="start_hue") {
    this.mRnbStaH.value = coloring.start_hue;
  }
  
  if (aPropName==undefined ||
      aPropName=="end_hue") {
    this.mRnbEndH.value = coloring.end_hue;
  }
  
  if (aPropName==undefined ||
      aPropName=="sat") {
    this.mRnbSat.value = coloring.sat * 100;
  }

  if (aPropName==undefined ||
      aPropName=="bri") {
    this.mRnbBri.value = coloring.bri * 100;
  }
};

panel.onRainbowChange = function (aEvent)
{
  var tgtid = aEvent.currentTarget.id;
  var propname;
  var val;

  //dd("*** isDragging="+aEvent.isDragging);
  //dd("*** isMouse="+aEvent.isMouse);

  // Ignore the event for starting of slider thumb drag
  if ('isDragging' in aEvent && aEvent.isDragging)
    return;

  dd("Paint.RnbChg> target="+tgtid);

  switch (tgtid) {
  case "paint-rnb-mode":
    propname = "mode";
    val = aEvent.target.value;
    break;

  case "paint-rnb-incrmode":
    propname = "incr_mode";
    val = aEvent.target.value;
    break;

  case "paint-rnb-starth":
    propname = "start_hue";
    val = parseFloat(this.mRnbStaH.value);
    // dd("%%% "+val);
    if (isNaN(val) || val<0.0 || val>360.0)
      return;
    break;

  case "paint-rnb-endh":
    propname = "end_hue";
    val = parseFloat(this.mRnbEndH.value);
    if (isNaN(val) || val<0.0 || val>360.0)
      return;
    break;

  case "paint-rnb-bri":
    propname = "bri";
    val = parseFloat(this.mRnbBri.value);
    if (isNaN(val) || val<0 || val>100)
      return;
    val /= 100.0;
    break;

  case "paint-rnb-sat":
    propname = "sat";
    val = parseFloat(this.mRnbSat.value);
    if (isNaN(val) || val<0 || val>100)
      return;
    val /= 100.0;
    break;

  default:
    return;
  }

  this.commitPropChange(propname, val, "Change rainbow coloring");
};

////////////////////////////////////////////////////////////////
// Bfac coloring implementation

panel.loadBfacWidgets = function ()
{
  this.mBfacMode = document.getElementById("paint-bfac-mode");
  this.mBfacColLo = document.getElementById("paint-bfac-collo");
  this.mBfacColHi = document.getElementById("paint-bfac-colhi");
  this.mBfacAuto = document.getElementById("paint-bfac-auto");
  this.mBfacParLo = document.getElementById("paint-bfac-parlo");
  this.mBfacParHi = document.getElementById("paint-bfac-parhi");
};

/// Data --> widgets
panel.updateBfacWidgets = function (aRend, aPropName)
{
  var coloring = aRend.coloring;


  if (aPropName==undefined ||
      aPropName=="mode") {
    util.selectMenuListByValue(this.mBfacMode, coloring.mode);
  }
  
  if (aPropName==undefined ||
      aPropName=="lowcol") {
    this.mBfacColLo.setTargetSceneID(this.mTgtSceID);
    this.mBfacColLo.setColorObj(coloring.lowcol);
  }
  if (aPropName==undefined ||
      aPropName=="highcol") {
    this.mBfacColHi.setTargetSceneID(this.mTgtSceID);
    this.mBfacColHi.setColorObj(coloring.highcol);
  }
  
  if (aPropName==undefined ||
      aPropName=="auto") {
    var value = coloring.auto;
    util.selectMenuListByValue(this.mBfacAuto, value);
    if (value=="none") {
      this.mBfacParLo.disabled = false;
      this.mBfacParHi.disabled = false;
    }
    else {
      this.mBfacParLo.disabled = true;
      this.mBfacParHi.disabled = true;
    }
  }

  if (aPropName==undefined ||
      aPropName=="lowpar") {
    this.mBfacParLo.value = coloring.lowpar;
  }
  if (aPropName==undefined ||
      aPropName=="highpar") {
    this.mBfacParHi.value = coloring.highpar;
  }
  
};

panel.onBfacChange = function (aEvent)
{
  var tgtid = aEvent.currentTarget.id;
  var propname;
  var val;

  // color picking is not completed --> ignore event
  if ('isCompleted' in aEvent &&
      !aEvent.isCompleted)
    return;

  dd("Paint.BfacChg> target="+tgtid);
  switch (tgtid) {
  case "paint-bfac-mode":
    propname = "mode";
    val = aEvent.target.value;
    break;
  case "paint-bfac-collo":
    propname = "lowcol";
    val = this.mBfacColLo.getColorObj()._wrapped;
    break;
  case "paint-bfac-colhi":
    propname = "highcol";
    val = this.mBfacColHi.getColorObj()._wrapped;
    break;

  case "paint-bfac-auto":
    propname = "auto";
    val = aEvent.target.value;
    if (val=="none") {
      this.mBfacParLo.disabled = false;
      this.mBfacParHi.disabled = false;
    }
    else {
      this.mBfacParLo.disabled = true;
      this.mBfacParHi.disabled = true;
    }
    break;

  case "paint-bfac-parlo":
    propname = "lowpar";
    val = parseFloat(this.mBfacParLo.value);
    if (isNaN(val)) return;
    break;
  case "paint-bfac-parhi":
    propname = "highpar";
    val = parseFloat(this.mBfacParHi.value);
    if (isNaN(val)) return;
    break;
  }

  this.commitPropChange(propname, val, "Change Bfac coloring");

};

////////////////////////////////////////////////////////////////
// Electrostatic coloring implementation

panel.loadElepotWidgets = function ()
{
  this.mPotRamp = document.getElementById("paint-elepot-ramp-above");
  this.mPotColL = document.getElementById("paint-elepot-coll");
  this.mPotColM = document.getElementById("paint-elepot-colm");
  this.mPotColH = document.getElementById("paint-elepot-colh");
  this.mPotParL = document.getElementById("paint-elepot-parl");
  this.mPotParM = document.getElementById("paint-elepot-parm");
  this.mPotParH = document.getElementById("paint-elepot-parh");
};

/// Setup default electrostatic coloring
panel.setDefaultElepot = function (aRend)
{
  var tgtname = null;
  if (this.mPotSel.getItemCount()>0) {
    if (aRend.elepot=="") {
      var pot = this.mPotSel.getSelectedObj();
      tgtname = pot.name;
    }
  }

  var scene = aRend.getScene();
  // EDIT TXN START //
  scene.startUndoTxn("Change to elepot coloring");
  try {
    if (tgtname)
      aRend.elepot = tgtname;
    aRend.colormode = "potential";
  }
  catch (e) {
    dd("PaintPanel.setDefaultElepot> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
  return;
};

/// elepot selector change event listener
panel.onPotSelChanged = function (aEvent)
{
  var obj = this.mPotSel.getSelectedObj();
  if (!obj)
    return;

  var rend = cuemol.getUIDObj(this.mTgtRendID);

  var rend_type = "";
  if ('type_name' in rend)
    rend_type = rend.type_name;

  if (!(rend_type=="molsurf" || rend_type=="dsurface"))
    return;
  if (rend.elepot==obj.name)
    return;

  // alert("onPotSelChanged called: rend="+rend.name+", elepot="+obj.name);

  this.commitElepotPropChange("elepot", obj.name);
};

/// Data --> widgets
panel.updateElepotWidgets = function (aRend, aPropName)
{
  // alert("Update elepot widgets: "+aPropName);
  if (aPropName==undefined ||
      aPropName=="elepot") {
    this.mPotSel.selectObjectByName(aRend.elepot);
  }

  if (aPropName==undefined ||
      aPropName=="ramp_above") {
    if (aRend.ramp_above)
      this.mPotRamp.setAttribute("checked", "true");
    else
      this.mPotRamp.removeAttribute("checked");
  }

  if (aPropName==undefined ||
      aPropName=="lowcol") {
    this.mPotColL.setTargetSceneID(this.mTgtSceID);
    this.mPotColL.setColorObj(aRend.lowcol);
  }

  if (aPropName==undefined ||
      aPropName=="midcol") {
    this.mPotColM.setTargetSceneID(this.mTgtSceID);
    this.mPotColM.setColorObj(aRend.midcol);
  }

  if (aPropName==undefined ||
      aPropName=="highcol") {
    this.mPotColH.setTargetSceneID(this.mTgtSceID);
    this.mPotColH.setColorObj(aRend.highcol);
  }

  ////

  if (aPropName==undefined ||
      aPropName=="lowpar") {
    this.mPotParL.value = aRend.lowpar;
  }

  if (aPropName==undefined ||
      aPropName=="midpar") {
    this.mPotParM.value = aRend.midpar;
  }

  if (aPropName==undefined ||
      aPropName=="highpar") {
    this.mPotParH.value = aRend.highpar;
  }

};

/// Elepot widgets --> data
panel.onElepotChange = function (aEvent)
{
  var tgtid = aEvent.currentTarget.id;
  var propname;
  var val;

  // color picking is not completed --> ignore event
  if ('isCompleted' in aEvent &&
      !aEvent.isCompleted)
    return;

  dd("Paint.ElepotChg> target="+tgtid);
  switch (tgtid) {
  case "paint-elepot-ramp-above":
    propname = "ramp_above";
    val = aEvent.target.checked;
    break;

  case "paint-elepot-coll":
    propname = "lowcol";
    val = this.mPotColL.getColorObj()._wrapped;
    break;
  case "paint-elepot-parl":
    propname = "lowpar";
    val = parseFloat(this.mPotParL.value);
    if (isNaN(val)) return;
    break;

  case "paint-elepot-colm":
    propname = "midcol";
    val = this.mPotColM.getColorObj()._wrapped;
    break;
  case "paint-elepot-parm":
    propname = "midpar";
    val = parseFloat(this.mPotParM.value);
    if (isNaN(val)) return;
    break;

  case "paint-elepot-colh":
    propname = "highcol";
    val = this.mPotColH.getColorObj()._wrapped;
    break;
  case "paint-elepot-parh":
    propname = "highpar";
    val = parseFloat(this.mPotParH.value);
    if (isNaN(val)) return;
    break;
  }

  this.commitElepotPropChange(propname, val);

};

panel.commitElepotPropChange = function (propname, val)
{
  var rend = cuemol.getUIDObj(this.mTgtRendID);
  var scene = rend.getScene();

  // EDIT TXN START //
  scene.startUndoTxn("Change Elepot coloring");
  try {
    rend._wrapped.setProp(propname, val);
  }
  catch (e) {
    dd("PaintPanel.commitPropChg> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
};

////////////////////////////////////////////////////////////////
// Script coloring implementation

panel.loadScriptWidgets = function ()
{
  this.mScriptText = document.getElementById("paint-sciprt-textbox");
  this.mScrUpdateBtn = document.getElementById("paint-script-updatebtn");
  this.mScrUpdateBtn.disabled = true;
  this.mScriptText.addEventListener("change", function(e) { panel.onChgScrTest(e); }, false);
};

panel.onChgScrTest = function (aEvent)
{
  dd("Change script text");
  this.mScrUpdateBtn.disabled = false;
};

panel.updateScriptWidgets = function (aRend)
{
  this.mScriptText.value = aRend.coloring.script;
  this.mScrUpdateBtn.disabled = true;
};

panel.onLoadColoringScript = function (aEvent)
{
  var rend = cuemol.getUIDObj(this.mTgtRendID);
  var scene = rend.getScene();
  var val = this.mScriptText.value;

  // EDIT TXN START //
  scene.startUndoTxn("Change Script coloring");
  try {
    rend._wrapped.setProp("coloring.script", val);
  }
  catch (e) {
    dd("PaintPanel.commitPropChg> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //

};

////////////////////////////////////////////////////////////////
// Multigrad coloring implementation

panel.loadMultigradWidgets = function ()
{
  let that = this;
  // set listener for elepot-obj-selector "select" change event
  this.mColMapSel.addSelChanged(function(args) {that.onColMapSelChanged(args)});
};

panel.updateMultigradWidgets = function (aRend)
{
  if ('elepot' in aRend)
    this.mColMapSel.selectObjectByName(aRend.elepot);
  else if ('color_mapname' in aRend) {
    let res = this.mColMapSel.selectObjectByName(aRend.color_mapname);
    //dd("this.mColMapSel._data = "+debug.dumpObjectTree(this.mColMapSel._data));
    debug.trace();
    dd("this.mColMapSel._data = "+this.mColMapSel._data);
    dd("this.mColMapSel._data.length = "+this.mColMapSel._data.length);
    //alert("update color_mapname to: "+aRend.color_mapname+" res="+res);
  }
};

/// elepot selector change event listener
panel.onColMapSelChanged = function (aEvent)
{
  var obj = this.mColMapSel.getSelectedObj();
  if (!obj)
    return;

  var rend = cuemol.getUIDObj(this.mTgtRendID);

  if ('elepot' in rend) {
    if (rend.elepot==obj.name)
      return;
    this.commitElepotPropChange("elepot", obj.name);
  }
  else if ('color_mapname' in rend) {
    if (rend.color_mapname==obj.name)
      return;
    //alert("change color_mapname to: "+obj.name);
    this.commitElepotPropChange("color_mapname", obj.name);
  }
};

/// Setup default multi-gradient coloring
panel.setDefaultMultiGrad = function (aRend)
{
  if (!"colormode" in aRend) {
    dd("setDefaultMultiGrad> ERROR!! aRend does not have colormode prop");
    return;
  }

  let tgtname = null;
  if (this.mColMapSel.getItemCount()>0) {
    if (aRend.color_mapname=="") {
      let pot = this.mColMapSel.getSelectedObj();
      tgtname = pot.name;
    }
  }

  var scene = aRend.getScene();
  // EDIT TXN START //
  scene.startUndoTxn("Change to multigrad coloring");
  try {
    if (tgtname) {
      if ("color_mapname" in aRend)
        aRend.color_mapname = tgtname;
      else if ("elepot" in aRend)
        aRend.elepot = tgtname;
      else {
        dd("setDefaultMultiGrad> ERROR!! aRend does not have color_map/elepot prop");
      }
    }
    aRend.colormode = "multigrad";
  }
  catch (e) {
    dd("PaintPanel.setDefaultMultiGrad> FATAL ERROR: "+e);
    debug.exception(e);
    scene.rollbackUndoTxn();
    return;
  }
  scene.commitUndoTxn();
  // EDIT TXN END //
  
  return;
};

panel.onEditMultiGrad = function (aEvent)
{
  var rend = cuemol.getUIDObj(this.mTgtRendID);
  let scene = rend.getScene();

  var argobj = {
  scene_id: scene.uid,
  rend_id: rend.uid
  };

  var stylestr = "chrome,modal,resizable=yes,dependent,centerscreen";
  window.openDialog("chrome://cuemol2/content/tools/multigrad_editor.xul",
		    "", stylestr, argobj);

};

////////////////////////////////////////////////////////////////

} )();

}

