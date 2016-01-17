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
      this.populateAddMenu();
      this.updateDisabledStates();
    };

    klass.populateStyleList = function ()
    {
      let style_list = null;

      try {
	let rend = cuemol.getRenderer(this.mRendID);
	let stylestr = rend.style;
	dd("target rend style: "+stylestr);
	style_list = stylestr.split(",");
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
      regex = RegExp(type_name+"$", "i");
      cuemolui.populateStyleMenus(this.mSceneID, menu, regex, true);
      
      if (type_name != "simple" &&
	  type_name != "trace" &&
	  type_name != "spline" &&
	  type_name != "*namelabel" &&
	  type_name != "*selection" &&
	  type_name != "coutour") {
	regex = /^EgLine/;
	util.appendMenuSep(document, menu);
	cuemolui.populateStyleMenus(this.mSceneID, menu, regex, false);
      }

      this.mRendInfoLabel.value = rend.name + " ("+type_name+")";

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
      return true;
    };

    klass.onDialogAccept = function ()
    {
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

      if (selind>=0)
	this.mStyList.insertItemAt(selind+1, addval, addval);
      else
	this.mStyList.appendItem(addval, addval);
      return true;
    };

    klass.onDeleteCmd = function ()
    {
      let selind = this.mStyList.selectedIndex;
      dd("selind: "+selind);
      this.mStyList.removeItemAt(selind);
      return true;
    };

    klass.onMoveUpCmd = function ()
    {
      return true;
    };
    
    klass.onMoveDownCmd = function ()
    {
      return true;
    };

    return ctor;

  } ) ();
}

window.gMain = new cuemolui.ApplyRendStyle();

