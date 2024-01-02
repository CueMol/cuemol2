//
// molsurf-page.js
//  Molsurf Property Editor Page
//

if (!("MolSurfCommPage" in cuemolui)) {

  cuemolui.MolSurfCommPage = ( function () {

    var ctor = function (aMain)
    {
      dd("MolSurfPropEdit> Constructor called");
      this.mMain = aMain;
      this.mRendTypeName = this.mMain.getRendType();

      this.mTargObj =
	new cuemolui.ObjMenuList("msurf-targobj", window,
				 function (elem) {
				   return cuemol.implIface(elem.type, "MolCoord");
				 },
				 cuemol.evtMgr.SEM_OBJECT);
      this.mTargObj._tgtSceID = this.mMain.getSceneID();
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;
      let scid = this.mMain.getSceneID();

      this.mDrawMode = document.getElementById("msurf-drawmode");
      this.mDrawMode.addEventListener("command",
				      function (event) {that.validateWidgets(event)},
				      false);

      this.mSurfType = document.getElementById("msurf-surftype");
      if (this.mRendTypeName=="dsurface") {
	this.mSurfType.addEventListener("command",
					function (event) {that.validateWidgets(event)},
					false);
      }
      else
	this.mSurfType.disabled = true;

      this.mLinew = document.getElementById("msurf-linew");
      this.mLinew.addEventListener("change",
				   function (event) {that.validateWidgets(event)},
				   false);

      this.mDetail = document.getElementById("msurf-detail");
      if (this.mRendTypeName=="dsurface") {
	this.mDetail.addEventListener("change",
				      function (event) {that.validateWidgets(event)},
				      false);
      }
      else
	this.mDetail.disabled = true;

      this.mPaintMode = document.getElementById("msurf-paintmode");
      if (this.mRendTypeName=="dsurface") {
	document.getElementById("menuitem_solid_color").hidden = true;
      }

      this.mShowSel = document.getElementById("msurf-showsel");
      this.mShowSel.sceneID = scid;
      this.mShowSel.buildBox();

      // Set event handler after the initialization,
      //  to avoid that default selection (elem 0) invoke selchg event
      setTimeout(function () {
	that.mTargObj.addSelChanged(function(aEvent) {
	  try { that.validateWidgets(aEvent);}
	  catch (e) { debug.exception(e); }
	});
      }, 0);
    };

    klass.onActivate = function ()
    {
      dd("MolSurfPropPage> ENTER");
      this.updateWidgets();
    };

    klass.onInactivate = function ()
    {
      dd("MolSurfPropPage> LEAVE");
      // MacOS UI requires to validate widgets here,
      // since the change event is not fired on the tabsel change or closing the dialog
      this.validateWidgets();
    };

    /// Intrn-data --> widget
    klass.updateWidgets = function ()
    {
      let elem;

      elem = this.mMain.findPropData("detail");
      if (elem)
	this.mDetail.value = elem.value;
      else
	this.mDetail.disabled = true;

      elem = this.mMain.findPropData("surftype");
      if (elem)
	util.selectMenuListByValue(this.mSurfType, elem.value);
      else
	this.mSurfType.disabled = true;

      elem = this.mMain.findPropData("drawmode");
      util.selectMenuListByValue(this.mDrawMode, elem.value);

      elem = this.mMain.findPropData("width");
      this.mLinew.value = elem.value;

      elem = this.mMain.findPropData("colormode");
      if (elem)
	util.selectMenuListByValue(this.mPaintMode, elem.value);
      else
	this.mPaintMode.disabled = true;

      elem = this.mMain.findPropData("target");
      if (elem)
	this.mTargObj.selectObjectByName(elem.value);

      elem = this.mMain.findPropData("showsel");
      var selstr = elem.value;
      this.mShowSel.origSel = selstr;
      this.mShowSel.buildBox();

      this.updateDisabledState();
    };

    /// Widget --> Intrn-data
    klass.validateWidgets = function (aEvent)
    {
      dd("MolSurfEdit> validateWidgets called");

      let tgt_id = null;
      let new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;

      if (this.mRendTypeName=="dsurface") {
	// dsurface-only props
	if (tgt_id=="msurf-detail" || tgt_id==null) {
	  new_val = parseInt(this.mDetail.value);
	  if (isNaN(new_val) || new_val<1 || new_val>21)
	    return;
	  this.mMain.updateData("detail", new_val);
	}

	if (tgt_id=="msurf-surftype" || tgt_id==null) {
	  new_val = this.mSurfType.value;
	  this.mMain.updateData("surftype", new_val);
	}
      }
      else {
	// molsurf-only props
	// (targobj is not implemented for dsurface yet)
	if (tgt_id=="msurf-targobj" || tgt_id==null) {
	  new_val = this.mTargObj.getSelectedObj();
	  if (new_val && typeof new_val=='object' && "name" in new_val)
	    this.mMain.updateData("target", new_val.name);
	}
	
      }

      // common props
      
      if (tgt_id=="msurf-paintmode" || tgt_id==null) {
	new_val = this.mPaintMode.value;
	this.updateDisabledState();
	this.mMain.updateData("colormode", new_val);
      }

      if (tgt_id=="msurf-drawmode" || tgt_id==null) {
	new_val = this.mDrawMode.value;
	this.updateDisabledState();
	this.mMain.updateData("drawmode", new_val);
      }

      if (tgt_id=="msurf-linew" || tgt_id==null) {
	new_val = parseFloat(this.mLinew.value);
	if (isNaN(new_val) || new_val<=0.0 || new_val>10)
	  return;
	this.mMain.updateData("width", new_val);
      }

      if (tgt_id=="msurf-showsel" || tgt_id==null) {
	new_val = this.mShowSel.selectedSel;
	dd("MolSurfProp showsel="+new_val.toString());
	if (new_val && typeof new_val=='object') {
	  this.mMain.updateData("showsel", new_val.toString());
	  this.mShowSel.addHistorySel();
	}
      }
    };

    klass.updateDisabledState = function ()
    {
      var id;

      id = this.mDrawMode.value;
      switch (id) {
      case "fill":
	this.mLinew.disabled = true;
	break;
      case "line":
      case "point":
	this.mLinew.disabled = false;
	break;
      }

      if (this.mRendTypeName=="dsurface") {
	this.mSurfType.disabled = false;
	this.mDetail.disabled = false;

	this.mTargObj._widget.disabled = true;
	this.mShowSel.disabled = false;
      }
      else {
	this.mSurfType.disabled = true;
	this.mDetail.disabled = true;
	
	this.mTargObj._widget.disabled = false;
	this.mShowSel.disabled = false;
      }
    };

    return ctor;

  } ) ();

}

dd("cuemolui.MolSurfCommPage="+cuemolui.MolSurfCommPage);

