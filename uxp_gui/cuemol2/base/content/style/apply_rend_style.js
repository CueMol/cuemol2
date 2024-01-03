//
// apply_rend_style.js
//   Apply rendere's style dialog implementation
//

if (!("ApplyRendStyle" in cuemolui)) {
  cuemolui.ApplyRendStyle = ( function () {

    /// Constructor
    var ctor = function ()
    {
      let that = this;
      this.mStylem = cuemol.getService("StyleManager");

      // get arguments (scene id)
      var args = this.mArgs = window.arguments[0]; //.QueryInterface(Ci.xpcIJSWeakReference).get(); 
      this.mSceneID = args.scene_id;
      this.mRendID = args.rend_id;

      // set onload handler
      addEventListener("load", function() {
	try { that.onLoad(); } catch (e) { debug.exception(e); }
      }, false);


      dd("ApplyRendStyle> taget scene UID="+this.mSceneID);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;

      this.mRendInfoLabel = document.getElementById("rend-info");
      this.mStyList = document.getElementById("style-list");
      this.mAddBtnPopup = document.getElementById("add-btn-popup");

      this.mAddBtn = document.getElementById("add-button");
      this.mDelBtn = document.getElementById("delete-button");
      this.mUpBtn = document.getElementById("moveup-button");
      this.mDownBtn = document.getElementById("movedown-button");

      this.populateStyleList();
      // this.populateAddMenu();
      this.updateDisabledStates();

      let rend = cuemol.getRenderer(this.mRendID);
      let type_name = rend.type_name;
      this.mRendInfoLabel.value = rend.name + " ("+type_name+")";
    };

    klass.onAddBtnPopupShowing = function (aEvent)
    {
      this.populateAddMenu();
    };

    klass.populateStyleList = function ()
    {
      let style_list = null;

      try {
	let rend = cuemol.getRenderer(this.mRendID);
	let stylestr = rend.style;
	dd("target rend style: "+stylestr);
	style_list = stylestr.split(/[,\s]/);
      }
      catch (e) {
	debug.exception(e);
	return;
      }
      
      if (style_list==null) {
	return;
      }

      let nlen = style_list.length;
      if (nlen==0||style_list[0]=="") {
	return;
      }

      util.clearMenu(this.mStyList);
      for (let i=0; i<nlen; ++i) {
	let name = style_list[i];
	let label = name;
	dd("  item="+name);
	this.mStyList.appendItem(label, name);
      }

      this.mStyList.selectedIndex = 0;
    };

    klass.populateAddMenu = function()
    {
      let menu = this.mAddBtnPopup;
      let rend = cuemol.getRenderer(this.mRendID);
      let type_name = rend.type_name;
      let regex = RegExp(type_name+"$", "i");
      let nadd = 0;

      nadd += this.populateStyleMenus(regex, true);
      
      if (type_name != "simple" &&
	  type_name != "trace" &&
	  type_name != "spline" &&
	  type_name != "*namelabel" &&
	  type_name != "*selection" &&
	  type_name != "coutour") {
	regex = /^EgLine/;
	util.appendMenuSep(document, menu);
	nadd += this.populateStyleMenus(regex, false);
      }

      if ("coloring" in rend) {
	regex = /(Coloring|Paint)$/;
	util.appendMenuSep(document, menu);
	nadd += this.populateStyleMenus(regex, false);
      }


      if (nadd==0) {
	let item = util.appendMenu(document, menu, "", "(no styles)");
	item.setAttribute("disabled", "true");
      }
    };


    klass.populateStyleMenus = function (regexp, bClear)
    {
      let menu = this.mAddBtnPopup;
      let scene_id = this.mSceneID;

      if (bClear)
	util.clearMenu(menu);

      if (regexp==null) {
	return 0;
      }

      var stylem = cuemol.getService("StyleManager");

      json = stylem.getStyleNamesJSON(0);
      //dd("JSON: "+json);
      var names = JSON.parse(json);

      json = stylem.getStyleNamesJSON(scene_id);
      //dd("JSON: "+json);
      names = names.concat( JSON.parse(json) );

      var nitems = names.length;
      var name, value, label, res;
      var nadd=0;
      for (var i=0; i<nitems; ++i) {
	name = names[i].name;
	res = name.match(regexp);
	if (res==null) {
	  //dd("Style "+name+" no match: "+regexp);
	  continue;
	}
	if (this.isInCurrentStyles(name))
	  continue;
	value = name;
	if (names[i].desc)
	  label = name + " ("+names[i].desc+")";
	else
	  label = name;
	util.appendMenu(document, menu, value, label);
	++nadd;
      }

      return nadd;
    };

    klass.isInCurrentStyles = function (aName)
    {
      let n = this.mStyList.itemCount;
      for (let i=0; i<n; ++i) {
	let item = this.mStyList.getItemAtIndex(i);
	dd("item.value="+item.value+", aName="+aName);
	if (item.value==aName)
	  return true;
      }
      return false;
    };

    klass.updateDisabledStates = function ()
    {
      let selitem = this.mStyList.selectedItem;
      this.mAddBtn.disabled = false;
      if (selitem==null) {
	this.mDelBtn.disabled = true;
	this.mUpBtn.disabled = true;
	this.mDownBtn.disabled = true;
      }
      else {
	this.mDelBtn.disabled = false;
	this.mUpBtn.disabled = false;
	this.mDownBtn.disabled = false;
      }

      let selind = this.mStyList.selectedIndex;
      if (selind==0)
	this.mUpBtn.disabled = true;
      else if (selind==this.mStyList.itemCount-1)
	this.mDownBtn.disabled = true;

      return true;
    };

    klass.onDialogAccept = function ()
    {
      // commit change
      
      let scene = cuemol.getScene(this.mSceneID);
      let rend = cuemol.getRenderer(this.mRendID);

      let nitems = this.mStyList.itemCount;
      let sty_list = [];
      for (let i=0; i<nitems; ++i) {
	let item = this.mStyList.getItemAtIndex(i);
	sty_list.push(item.value);
      }
      stylestr = sty_list.join(",");
      dd("apply style: "+stylestr);
      
      // EDIT TXN START //
      scene.startUndoTxn("Change style");
      
      try {
	rend.applyStyles(stylestr);
      }
      catch (e) {
	dd("***** ERROR: pushStyle "+e);
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
      // EDIT TXN END //
      
      return true;
    };

    klass.onStySelChg  = function (aEvent)
    {
      this.updateDisabledStates();
      return true;
    };

    klass.onAddCmd = function (aEvent)
    {
      let selind = this.mStyList.selectedIndex;
      var addval = aEvent.target.value;
      dd("selind: "+selind);
      dd("addCmd: "+addval);

      let ins = selind+1;
      let nitems = this.mStyList.itemCount;
      if (ins>=0 && ins<nitems) {
	this.mStyList.insertItemAt(ins, addval, addval);
	this.mStyList.selectedIndex = ins;
      }
      else {
	this.mStyList.appendItem(addval, addval);
	this.mStyList.selectedIndex = this.mStyList.itemCount-1;
      }
      return true;
    };

    klass.onDeleteCmd = function ()
    {
      let selind = this.mStyList.selectedIndex;
      dd("selind: "+selind);

      if (selind<0)
	return;
      
      this.mStyList.removeItemAt(selind);
      let nitems = this.mStyList.itemCount;
      if (selind>=0 && selind<nitems) {
	this.mStyList.selectedIndex = selind;
      }
      return true;
    };

    klass.onMoveUpDownCmd = function (aEvent)
    {
      let selind = this.mStyList.selectedIndex;
      dd("selind: "+selind);
      if (selind<0)
	return;
      
      let label = this.mStyList.selectedItem.label;
      let value = this.mStyList.selectedItem.value;

      let nitems = this.mStyList.itemCount;
      let ins = selind+1;
      if (aEvent.target.id=="moveup-button") {
	// move-up
	if (selind==0)
	  return;
	ins = selind-1;
      }
      else {
	// move-down
	if (selind==nitems-1)
	  return;
      }
      
      this.mStyList.removeItemAt(selind);
      nitems--;
      
      if (ins>=0 && ins<nitems)
	this.mStyList.insertItemAt(ins, label, value);
      else
	this.mStyList.appendItem(label, value);

      this.mStyList.selectedIndex = ins;

      return true;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.ApplyRendStyle();

