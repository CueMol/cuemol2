//
// style_editor.js
//  Style editor (core) implementation
//

if (!("StyleEditor" in cuemolui)) {
  cuemolui.StyleEditor = ( function () {

    /// Constructor
    var ctor = function ()
    {
      let that = this;
      this.mStylem = cuemol.getService("StyleManager");

      // get arguments (Name of styleset)
      var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
      this.mTgtName = args.target;
      this.mTgtID = args.target_id;
      this.mSceneID = args.scene_id;

      let style_set = this.mStylem.getStyleSet(this.mTgtID);
      // data source path (readonly)
      //this.mSrcPath = this.mStylem.getStyleSetSource(this.mTgtID);
      this.mSrcPath = style_set.src;
      this.mReadOnly = style_set.readonly;
      if (this.mSceneID==0) {
	dd("StyleEditor> read-only mode");
	this.mReadOnly = true;
      }

      // setup color-list treeview
      this.mTreeView = new cuemolui.TreeView(window, "color-listbox");
      this.mTreeView.clickHandler = function (ev, row, col) {
	dd("ColorTree clicked!!");
	that.updateColNameValBoxes();
      }
      this.mColTgt = null;

      // dummy serial number to invalidate the CSS color (for color listbox)
      this.mSerial = 0;
      
      // setup molsel-list treeview
      this.mSelTreeView = new cuemolui.TreeView(window, "molsel-listbox");
      this.mSelTreeView.clickHandler = function (ev, row, col) {
	dd("MolSelTree clicked!!");
	that.updateSelNameValBoxes();
      }
      this.mSelTgt = null;

      // set onload handler
      addEventListener("load", function() {
	try { that.onLoad(); } catch (e) { debug.exception(e); }
      }, false);

      dd("StyleEditor> taget name="+this.mTgtName);
      dd("StyleEditor> taget UID="+this.mTgtID);
    };
    
    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      var that = this;
      dd("StyleEditor> onLoad called");

      let srcstr = "(embed)";
      if (this.mSrcPath.length>0)
	srcstr = this.mSrcPath;
      document.getElementById("style-src").value = srcstr;

      let stypestr = "";
      if (this.mSceneID==0)
	stypestr = "System";
      else
	stypestr = "Local";

      if (this.mReadOnly)
	stypestr += " (read-only)";

      document.getElementById("style-type").value = stypestr;

      document.getElementById("style-name").label = "Name: "+this.mTgtName;

      ////////////
      // color panel setup

      this.mColAddBtn = document.getElementById("color-addbtn");
      this.mColDelBtn = document.getElementById("color-delbtn");
      this.mColNameBox = document.getElementById("color-name-box");
      this.mColValueBox = document.getElementById("color-value-edit");

      //dd("ColValueBox: "+debug.dumpObjectTree(this.mColValueBox));
      this.mColValueBox.setTargetSceneID(this.mSceneID);

      this.loadColorDefs();

      if (this.mReadOnly) {
	this.mColAddBtn.disabled = true;
	this.mColDelBtn.disabled = true;
	this.enableColNameValBoxes(false);
      }
      else {
	this.enableColNameValBoxes(this.mTreeView.isSelected());
      }

      ////////////
      // molsel panel setup

      this.mSelAddBtn = document.getElementById("molsel-addbtn");
      this.mSelDelBtn = document.getElementById("molsel-delbtn");
      this.mSelNameBox = document.getElementById("molsel-name-box");
      this.mSelValueBox = document.getElementById("molsel-value-edit");

      //this.mSelTreeView.addEventListener("select",
      //function(e) { that.onSelTreeSelChanged(); },
      //false);
      this.loadMolSelDefs();

      if (this.mReadOnly) {
	this.mSelAddBtn.disabled = true;
	this.mSelDelBtn.disabled = true;
	this.enableSelNameValBoxes(false);
      }
      else {
	this.enableSelNameValBoxes(this.mSelTreeView.isSelected());
      }

      ////////////
      // style panel setup
      this.mStyleList = document.getElementById("style-listbox");
      this.mStyleDelBtn = document.getElementById("style-delbtn");

      this.loadStyleDefs();

      if (this.mReadOnly)
	this.mStyleDelBtn.disabled = true;
      else
	this.mStyleDelBtn.disabled = false;
    };
    
    ////////////////////////

    klass.enableColNameValBoxes = function (aEnable)
    {
      if (this.mReadOnly) {
	this.mColNameBox.disabled = true;
	this.mColValueBox.disabled = true;
      }
      else {
	this.mColNameBox.disabled = !aEnable;
	this.mColValueBox.disabled = !aEnable;
      }
    };

    function makeRGBCol(col)
    {
      return "rgb("+col.r()+","+col.g()+","+col.b()+")";
    };

    klass.loadColorDefs = function ()
    {
      var stylem = this.mStylem;
      var scene_id = this.mSceneID;
      var tgt_id = this.mTgtID;
      var json = stylem.getColorDefsJSON2(scene_id, tgt_id);
      dd("StyleEditor> SetupColor json="+json);

      var defs = JSON.parse(json);
      
      this.mOrigColors = new Array();
      var nodes = new Array();
      var ind=0;
      defs.forEach(function (e, i) {
	try {
	  var col = stylem.getColor2(e, scene_id, tgt_id);

	  var node = new Object();
	  node.name = e.toString();
	  node.rgbcol = makeRGBCol(col);
	  node.values = { color_value: col.toString() };
	  nodes.push(node);
	  //dd("color "+node.name+", value="+node.values.color_value);

	  this.mOrigColors.push(e);
	}
	catch (e) {
	  dd("exception: "+e);
	  debug.exception(e);
	}
      }, this);

      this.mColDefs = nodes;
      this.realizeNodeColors();

      this.mTreeView.setData(nodes);
      this.mTreeView.buildView();
    };

    /// setup obj_id of node & color CSS
    klass.realizeNodeColors = function ()
    {
      var node, propval;
      const nsize = this.mColDefs.length;
      for (var i=0; i<nsize; ++i) {
	node = this.mColDefs[i];
	node.obj_id = i;
	propval = "col_"+this.mSerial+"_"+i;
	node.props = { color_value: propval };
	this._setColCSS(node);
      }
      ++this.mSerial;
    };

    klass._setColCSS = function (aNode)
    {
      var ss = document.styleSheets[document.styleSheets.length-1];
      var propnm = aNode.props.color_value;
      var insid = ss.insertRule("#color-listbox-children::-moz-tree-cell("+propnm+") {}",
				ss.cssRules.length);
      var sr = ss.cssRules[insid];
      sr.style.backgroundColor = aNode.rgbcol;
      dd("setColCSS> name="+aNode.name+" rgbcol="+aNode.rgbcol);
    };

    klass.updateColNameValBoxes = function ()
    {
      var elem = this.mTreeView.getSelectedNode();
      this.mColTgt = elem;
      if (!elem) {
	this.enableColNameValBoxes(false);
	return;
      }
      
      this.enableColNameValBoxes(true);
      this.mColNameBox.value = elem.name;
      this.mColValueBox.setColorText(elem.values.color_value);
    };

    klass.findColorDef = function (name)
    {
      const nsize = this.mColDefs.length;
      for (var j=0; j<nsize; ++j) {
	if (name==this.mColDefs[j].name)
	  return this.mColDefs[j];
      }
      return null;
    };

    klass.createColorName = function ()
    {
      var i, name;
      for (i=0; ; ++i) {
	name = "color_"+i;
	if (this.findColorDef(name)==null)
	  return name;
      }
    };

    klass.onAddColor = function (aEvent)
    {
      var elem = this.mTreeView.getSelectedNode();
      var strcol = "#FFFFFF";
      var newval = "rgb(1,1,1)";
      if (elem) {
	newval = elem.values.color_value;
	strcol = elem.rgbcol;
      }

      var newnode = new Object();
      newnode.name = this.createColorName();
      newnode.rgbcol = strcol;
      newnode.values = { color_value: newval };

      //this.mColDefs.splice(ind, 0, newnode);
      this.mColDefs.push(newnode);
      this.realizeNodeColors();

      this.mTreeView.buildView();
      this.mTreeView.setSelectedRow(this.mColDefs.length-1);
      
      this.updateColNameValBoxes();
      // this.enableColNameValBoxes(true);
    };

    klass.onDelColor = function (aEvent)
    {
      var irow = this.mTreeView.getSelectedRow();
      if (irow<0)
	return;

      this.mTreeView.removeNodeIndex(irow, 1);
      // this.realizeNodeColors();
      
      this.updateColNameValBoxes();
      // this.enableColNameValBoxes(this.mTreeView.isSelected());
    };

    klass.isValidColName = function (aName)
    {
      if (aName.length==0)
	return false;
      if (this.findColorDef(aName))
	return false;
      return true;
    };

    klass.onColChg = function (aEvent)
    {
      //var elem = this.mTreeView.getSelectedNode();
      var elem = this.mColTgt;
      if (!elem)
	return;

      dd("onColChg called for "+elem.name);

      var id = aEvent.target.id;
      if (id=="color-name-box") {
	let newval = this.mColNameBox.value;
	if (!this.isValidColName(newval))
	  return;
	elem.name = newval;
	this.mTreeView.updateNode(function (node) { return elem==node; });
      }
      else if (id=="color-value-edit") {
	let newval = this.mColValueBox.getColorText();
	dd("onColChg> new color val="+newval);
	elem.rgbcol = makeRGBCol(this.mColValueBox.getColorObj());
	elem.values = { color_value: newval };
	this.realizeNodeColors();

	// this.mTreeView.updateNode(function (node) { return true; });

	this.mTreeView.saveSelection();
	this.mTreeView.buildView();
	this.mTreeView.restoreSelection();
      }
    };

    /// compare two colors
    klass.equalsColor = function (col1, col2)
    {
      if (col1.r()==col2.r() &&
	  col1.g()==col2.g() &&
	  col1.b()==col2.b() &&
	  col1.a()==col2.a())
	return true;
      else
	return false;
    };
    
    //////////////////////////////////////////////////
    // selection editor

    klass.enableSelNameValBoxes = function (aEnable)
    {
      if (this.mReadOnly) {
	this.mSelNameBox.disabled = true;
	this.mSelValueBox.disabled = true;
      }
      else {
	this.mSelNameBox.disabled = !aEnable;
	this.mSelValueBox.disabled = !aEnable;
      }
    };

    klass.updateSelNameValBoxes = function ()
    {
      var elem = this.mSelTreeView.getSelectedNode();
      this.mSelTgt = elem;
      if (!elem) {
	this.enableSelNameValBoxes(false);
	return;
      }
      
      this.enableSelNameValBoxes(true);
      this.mSelNameBox.value = elem.name;
      this.mSelValueBox.value = elem.values.molsel_value;
    };

    klass.loadMolSelDefs = function ()
    {
      var stylem = this.mStylem;
      var scene_id = this.mSceneID;
      var tgt_id = this.mTgtID;
      var json = stylem.getStrDataDefsJSON2("sel", scene_id, tgt_id);
      dd("StyleEditor> SetupMolSel json="+json);

      var defs = JSON.parse(json);

      this.mOrigSels = new Array();
      var nodes = new Array();
      var ind=0;
      defs.forEach(function (e, i) {
	try {
	  var value = stylem.getStrData2("sel", e, scene_id, tgt_id);

	  var node = new Object();
	  node.name = e;
	  node.values = { molsel_value: value };
	  nodes.push(node);
	  //dd("color "+node.name+", value="+node.values.color_value);

	  this.mOrigSels.push(e);
	}
	catch (e) {
	  dd("exception: "+e);
	  debug.exception(e);
	}
      }, this);
      
      this.mSelDefs = nodes;
      this.mSelTreeView.setData(nodes);
      this.mSelTreeView.buildView();
    };
    
    klass.findSelDef = function (name)
    {
      const nsize = this.mSelDefs.length;
      for (var j=0; j<nsize; ++j) {
	if (name==this.mSelDefs[j].name)
	  return this.mSelDefs[j];
      }
      return null;
    };

    klass.createSelName = function ()
    {
      var i, name;
      for (i=0; ; ++i) {
	name = "sel_"+i;
	if (this.findSelDef(name)==null)
	  return name;
      }
    };

    klass.onAddMolSel = function (aEvent)
    {
      // default new item
      var newval = "*";

      var elem = this.mSelTreeView.getSelectedNode();
      if (elem) {
	newval = elem.values.molsel_value;
      }

      var newnode = new Object();
      newnode.name = this.createSelName();
      newnode.values = { molsel_value: newval };

      //this.mSelDefs.splice(ind, 0, newnode);
      this.mSelDefs.push(newnode);

      this.mSelTreeView.buildView();

      // no selection --> select the added elem (always at the last)
      this.mSelTreeView.setSelectedRow(this.mSelDefs.length-1);
      
      this.updateSelNameValBoxes();
    };

    klass.onDelMolSel = function (aEvent)
    {
      var irow = this.mSelTreeView.getSelectedRow();
      if (irow<0)
	return;

      this.mSelTreeView.removeNodeIndex(irow, 1);
      
      this.updateSelNameValBoxes();
    };

    klass.isValidSelName = function (aName)
    {
      if (aName.length==0)
	return false;
      if (this.findSelDef(aName))
	return false;
      return true;
    };

    klass.isValidSelValue = function (aSelStr)
    {
      var bOK = false;
      try {
	var sel = cuemol.makeSel(aSelStr, this.mSceneID);
	if (sel)
	  bOK = true;
      }
      catch (e) {
	dd("exception: "+e);
	debug.exception(e);
      }
      return bOK;
    };

    klass.onSelChg = function (aEvent)
    {
      var elem = this.mSelTgt;
      if (!elem)
	return;

      dd("onSelChg called for "+elem.name);

      var id = aEvent.target.id;
      if (id=="molsel-name-box") {
	let newval = this.mSelNameBox.value;
	if (!this.isValidSelName(newval))
	  return;
	elem.name = newval;
	this.mSelTreeView.updateNode(function (node) { return elem==node; });
      }
      else if (id=="molsel-value-edit") {
	let newval = this.mSelValueBox.value;
	if (!this.isValidSelValue(newval))
	  return;

	dd("onSelChg> new molsel val="+newval);
	elem.values = { molsel_value: newval };

	//this.mSelTreeView.updateNode(function (node) { return true; });
	
	this.mSelTreeView.saveSelection();
	this.mSelTreeView.buildView();
	this.mSelTreeView.restoreSelection();
      }
    };

    //////////////////////////////////////////////////
    // style editor (viewer)

    klass.loadStyleDefs = function ()
    {
      var stylem = this.mStylem;
      var scene_id = this.mSceneID;
      var tgt_id = this.mTgtID;

      var sset = stylem.getStyleSet(tgt_id);
      if (sset==null) {
	// ERROR!!
	return;
      }
      
      var json = sset.getStyleNamesJSON();
      dd("StyleEditor> SetupStyleDefs json="+json);

      var defs = JSON.parse(json);

      this.mOrigStyles = new Array();
      //this.mStyleDefs = new Array();

      var nitems = defs.length;
      for (var i=0; i<nitems; ++i) {
	let id = defs[i].name;
	this.mStyleList.appendItem(id,id);
	this.mOrigStyles.push(id);
	//this.mStylesDefs.push(id);
      }
      
    };

    klass.onDelStyle = function (aEvent)
    {
      var irow = this.mStyleList.selectedIndex;
      if (irow<0)
	return;

      this.mStyleList.removeItemAt(irow);
      
      //this.updateSelNameValBoxes();
    };

    //////////////////////////////////////////////////

    klass.onDialogAccept = function (aEvent)
    {
      var stylem = this.mStylem;
      var nScopeID = this.mSceneID;
      var nStyleSetID = this.mTgtID;
      dd("StyleEditor> dialog accept");

      //
      // update color defs
      //
      try {
	let node, name, nsize;

	// detect removed entries
	nsize = this.mOrigColors.length;
	for (var i=0; i<nsize; ++i) {
	  name = this.mOrigColors[i];
	  if (!this.mColDefs.some( function (e) {
	    return (e.name===name);
	  } )) {
	    // name is not found in mColDefs --> removed
	    //dd("entry "+name+" was removed");
	    stylem.removeColor(name, nScopeID, nStyleSetID);
	  }
	}

	// process changed/added entries
	nsize = this.mColDefs.length;
	for (var i=0; i<nsize; ++i) {
	  node = this.mColDefs[i];
	  let name = node.name;
	  if (!this.mOrigColors.some( function (e) {
	    return (e===name);
	  } )) {
	    // node.name is not found in mOrig --> appended
	    //dd("entry "+name+", value="+node.values.color_value+" was added");
	    var new_col = cuemol.makeColor(node.values.color_value);
	    stylem.setColor(name, new_col, nScopeID, nStyleSetID);
	  }
	  else {
	    // check changed
	    var orig_col = stylem.getColor2(name, nScopeID, nStyleSetID);
	    var new_col = cuemol.makeColor(node.values.color_value);
	    if (!this.equalsColor(orig_col, new_col)) {
	      //dd("entry "+name+" was changed");
	      stylem.setColor(name, new_col, nScopeID, nStyleSetID);
	    }
	  }
	}

      }
      catch (e) {
	dd("exception: "+e);
	debug.exception(e);
      }

      //
      // update molsel defs
      //
      try {
	let node, name, nsize;

	// detect removed entries
	nsize = this.mOrigSels.length;
	for (var i=0; i<nsize; ++i) {
	  name = this.mOrigSels[i];
	  if (!this.mSelDefs.some( function (e) {
	    return (e.name===name);
	  } )) {
	    // name is not found in mColDefs --> removed
	    //dd("entry "+name+" was removed");
	    stylem.removeStrData("sel", name, nScopeID, nStyleSetID);
	  }
	}

	// process changed/added entries
	nsize = this.mSelDefs.length;
	for (var i=0; i<nsize; ++i) {
	  node = this.mSelDefs[i];
	  let name = node.name;
	  if (!this.mOrigSels.some( function (e) {
	    return (e===name);
	  } )) {
	    // node.name is not found in mOrig --> appended
	    //dd("entry "+name+", value="+node.values.molsel_value+" was added");
	    var new_sel = node.values.molsel_value;
	    stylem.setStrData("sel", name, new_sel, nScopeID, nStyleSetID);
	  }
	  else {
	    // check changed
	    var orig_sel = stylem.getStrData2("sel", name, nScopeID, nStyleSetID);
	    var new_sel = node.values.molsel_value;
	    if (orig_sel!=new_sel) {
	      //dd("entry "+name+" was changed");
	      stylem.setStrData("sel", name, new_sel, nScopeID, nStyleSetID);
	    }
	  }
	}

      }
      catch (e) {
	dd("exception: "+e);
	debug.exception(e);
      }

      //
      // update molsel defs
      //
      try {
	let node, name, nsize;

	let sset = stylem.getStyleSet(this.mTgtID);

	// copy the current list box contents to the js array, styleDefs
	nsize = this.mStyleList.itemCount;
	let styleDefs = new Array();
	for (let i=0; i<nsize; ++i)
	  styleDefs.push(this.mStyleList.getItemAtIndex(i).value);
	
	// detect removed entries
	nsize = this.mOrigStyles.length;
	for (let i=0; i<nsize; ++i) {
	  name = this.mOrigStyles[i];
	  if (!styleDefs.some( function (e) {
	    //alert("e= "+e+" name= "+name);
	    return (e===name);
	  } )) {
	    // name is not found in mStyleDefs --> removed
	    alert("entry "+name+" removed");
	    //stylem.removeStrData("sel", name, nScopeID, nStyleSetID);
	    sset.removeStyle(name);
	  }
	}
	
      }
      catch (e) {
	alert("exception: "+e);
	debug.exception(e);
      }

      stylem.firePendingEvents();
      dd("StyleEditor> dialog accept OK");
    };

    return ctor;
  } ) ();
}

window.gMain = new cuemolui.StyleEditor();

