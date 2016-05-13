//
// animobj-common-proppage.js
//  AnimObj common property page
//

if (!("AnimObjPropPage" in cuemolui)) {

  cuemolui.AnimObjPropPage = ( function () {

    var ctor = function (aMain)
    {
      dd("AnimObjPropPage> Constructor called");
      this.mMain = aMain;

      var filter_fn = function (elem) {
	return cuemol.implIface(elem.type,"MorphMol");
      };

      this.mMolAnimTarg = new cuemolui.ObjMenuList(
	"molanim_tgtmol",
	window, filter_fn,
	cuemol.evtMgr.SEM_OBJECT);
      this.mMolAnimTarg._tgtSceID = this.mMain.getSceneID();

    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;
      // let scid = this.mMain.getSceneID();

      this.mNameEdit = document.getElementById("comprop-name");
      this.mNameEdit.addEventListener("change",
				      function (event) { that.validateWidgets(event) },
				      false);

      this.mDisChk = document.getElementById("comprop-disabled");
      this.mDisChk.addEventListener("command",
				    function (event) { that.validateWidgets(event) },
				    false);

      this.mStartTime = document.getElementById("comprop-starttime");
      this.mStartTime.addEventListener("change",
				       function (event) { that.validateWidgets(event) },
				       false);

      this.mDurTime = document.getElementById("comprop-duration");
      this.mDurTime.addEventListener("change",
				     function (event) { that.validateWidgets(event) },
				     false);

      this.mTimeRefList = document.getElementById("comprop-time-refobj");
      this.mTimeRefList.addEventListener("select",
				    function (event) { that.validateWidgets(event) },
				    false);

      this.mQuadSli = document.getElementById("comprop-quadric");
      this.mQuadSli.addEventListener("change",
				     function (event) { that.validateWidgets(event) },
				     false);

      this.buildRefObjMenu();

      dd("AnimObjPropPage> onLoad OK");

      let target = this.mMain.mTgtObj;
      let clsn = cuemol.getClassName(target);
      this._tgtClsName = clsn;

      this.onLoadSimSpin();
      this.onLoadCamMot();
      this.onLoadShowHide();
      this.onLoadSlideIO();

      this.onLoadMolAnim();
    };

    klass.onActivate = function ()
    {
      dd("AnimObjPropPage> ENTER");
      this.updateWidgets();
    };

    klass.onInactivate = function ()
    {
      dd("AnimObjPropPage> LEAVE");
      // MacOS UI requires to validate widgets here,
      // since the change event is not fired on the tabsel change or closing the dialog
      this.validateWidgets();
    };

    /// Intrn-data --> widget
    klass.updateWidgets = function ()
    {
      var elem;

      elem = this.mMain.findPropData("name");
      this.mNameEdit.value = elem.value;

      /////

      elem = this.mMain.findPropData("disabled");
      this.mDisChk.checked = elem.value;
      
      /////

      elem = this.mMain.findPropData("start");
      this.mStartTime.strvalue = elem.value;

      elem = this.mMain.findPropData("end");
      {
	let ms_st = this.mStartTime.value;
	let ms_en = this.mStartTime.convToIntValue(elem.value);
	this.mDurTime.value = ms_en - ms_st;
      }

      elem = this.mMain.findPropData("timeRefName");
      util.selectMenuListByValue(this.mTimeRefList, elem.value);

      /////
      
      elem = this.mMain.findPropData("quadric");
      if (elem)
	this.mQuadSli.value = elem.value * 100.0;
      else
	this.mQuadSli.disabled = true;

      dd("AnimObjPropPage> updateWidgets OK");

      this.updateSimSpinWidgets();
      this.updateCamMotWidgets();
      this.updateShowHideWidgets();
      this.updateSlideIOWidgets();
      this.updateMolAnimWidgets();
    };
    
    /// Widget --> Intrn-data
    klass.validateWidgets = function (aEvent)
    {
      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate tgt_id="+tgt_id);

      /////

      if (tgt_id=="comprop-name" || tgt_id==null) {
	new_val = this.mNameEdit.value;
	this.mMain.updateData("name", new_val);
      }

      /////

      if (tgt_id=="comprop-disabled" || tgt_id==null) {
	new_val = this.mDisChk.checked;
	this.mMain.updateData("disabled", new_val);
      }

      /////

      if (tgt_id=="comprop-starttime" || tgt_id==null) {
	new_val = this.mStartTime.strvalue;
	this.mMain.updateData("start", new_val);

	let ms_end = this.mStartTime.value + this.mDurTime.value;
	let str_end = this.mStartTime.convToStrValue(ms_end);
	this.mMain.updateData("end", str_end);
      }

      if (tgt_id=="comprop-duration" || tgt_id==null) {
	let ms_end = this.mStartTime.value + this.mDurTime.value;
	let str_end = this.mStartTime.convToStrValue(ms_end);
	this.mMain.updateData("end", str_end);
      }

      if (tgt_id=="comprop-time-refobj" || tgt_id==null) {
	new_val = this.mTimeRefList.selectedItem.value;
	this.mMain.updateData("timeRefName", new_val);
      }
      
      /////

      if (tgt_id=="comprop-quadric" || tgt_id==null) {
	var new_val = parseFloat(this.mQuadSli.value);
	if (!(isNaN(new_val) || new_val<=0.0 || new_val>50.0))
	  this.mMain.updateData("quadric", new_val/100.0);
      }

      if (tgt_id==null) {
	this.validateSimSpinWidgets();
	this.validateCamMotWidgets();
	this.validateShowHideWidgets();
	this.validateSlideIOWidgets();
	this.validateMolAnimWidgets();
      }
    };

    klass.resetAll = function ()
    {
      this.mMain.resetAllToDefault();
      // this.updateWidgets();
    };
    
    klass.buildRefObjMenu = function ()
    {
      var scid = this.mMain.getSceneID();
      var scene = cuemol.getScene(scid);
      var animMgr = scene.getAnimMgr();

      var menu = this.mTimeRefList.menupopup;
      util.clearMenu(menu);

      var i, nlen = animMgr.size;

      util.appendMenu(document, menu, "", "(absolute)");

      var target = this.mMain.mTgtObj;

      for (i=0; i<nlen; ++i) {
	let ao = animMgr.getAt(i);
	if (ao.name==target.name)
	  continue;
	let type = cuemol.getClassName(ao);
	let label = ao.name + " ("+type+")";
	let value = ao.name;
	util.appendMenu(document, menu, value, label);
      }
    };

    /*klass.refObjChanged = function (aEvent)
    {
      this.validateWidgets(aEvent);
    };*/

    ////////////////////////////////////////////////

    klass.onLoadSimSpin = function()
    {
      if (this._tgtClsName!="SimpleSpin")
	return;

      let that = this;

      var simspin_page = document.getElementById("simspin-group");
      simspin_page.hidden = false;
      
      this.mAnglSli = document.getElementById("simspin-angle");
      this.mAnglSli.addEventListener("change",
				     function (event) { that.validateSimSpinWidgets(event) },
				     false);

      this.mAxisType = document.getElementById("simspin-axis-type");
      this.mAxisType.addEventListener("select",
				      function (event) { that.axisMenuChanged(event) },
				      false);

      this.mAxisX = document.getElementById("simspin-axis-x");
      this.mAxisY = document.getElementById("simspin-axis-y");
      this.mAxisZ = document.getElementById("simspin-axis-z");

      this.mAxisX.addEventListener("change",
				   function (event) { that.validateSpinAxis(event) },
				   false);
      this.mAxisY.addEventListener("change",
				   function (event) { that.validateSpinAxis(event) },
				   false);
      this.mAxisZ.addEventListener("change",
				   function (event) { that.validateSpinAxis(event) },
				   false);

      this._bAxisMenuSysChg = true;
      util.selectMenuListByValue(this.mAxisType, "cart");

      this._vec = cuemol.createObj("Vector");
    };

    klass.updateSimSpinWidgets = function ()
    {
      if (this._tgtClsName!="SimpleSpin")
	return;

      var elem;

      elem = this.mMain.findPropData("angle");
      this.mAnglSli.value = elem.value;

      elem = this.mMain.findPropData("axis");
      dd("Axis="+elem.value);
      this._vec.strvalue = elem.value;
      this.mAxisX.value = this._vec.x;
      this.mAxisY.value = this._vec.y;
      this.mAxisZ.value = this._vec.z;

      dd("AnimObjPropPage> updateSimSpinWidgets OK");
    };

    klass.validateSimSpinWidgets = function (aEvent)
    {
      if (this._tgtClsName!="SimpleSpin")
	return;

      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate simspin tgt_id="+tgt_id);

      /////

      if (tgt_id=="simspin-angle" || tgt_id==null) {
	var new_val = parseFloat(this.mAnglSli.value);
	if (isNaN(new_val)) return;
	// round to 0:360
	while (new_val<0.0) new_val += 360.0;
	while (new_val>360.0) new_val -= 360.0;
	this.mMain.updateData("angle", new_val);
      }

      if (tgt_id=="simspin-axis-x" ||
	  tgt_id=="simspin-axis-y" ||
	  tgt_id=="simspin-axis-z" || tgt_id==null) {
	this.validateSpinAxis(aEvent);
      }
    };

    klass.validateSpinAxis = function (aEvent)
    {
      var axtype = this.mAxisType.selectedItem.value;

      var x = parseFloat(this.mAxisX.value);
      if (isNaN(x)) return;

      var y = parseFloat(this.mAxisY.value);
      if (isNaN(y)) return;

      var z = parseFloat(this.mAxisZ.value);
      if (isNaN(z)) return;

      this._vec.x = x;
      this._vec.y = y;
      this._vec.z = z;
      this._vec.w = 0.0;

      var strval;
      try {
	// normalization
	this._vec = this._vec.normalize();
	// conversion
	strval = this._vec.strvalue;
      }
      catch (e) {
	debug.exception(e);
	// this.axisErrReset();
	return;
      }

      this.mMain.updateData("axis", strval);
    }
    
    klass.axisErrReset = function ()
    {
      this.mAxisX.value = 0;
      this.mAxisY.value = 1;
      this.mAxisZ.value = 0;
    };

    klass.axisMenuChanged = function (aEvent)
    {
      if (this._bAxisMenuSysChg) {
	this._bAxisMenuSysChg = false;
	return;
      }
      
      var new_val = this.mAxisType.selectedItem.value;
      dd("SimpleSpin axis-type="+new_val);
      if (new_val=="xaxis") {
	this.mAxisX.value = 1;
	this.mAxisY.value = 0;
	this.mAxisZ.value = 0;
	this.disableAxisEdit(true);
      }
      else if (new_val=="yaxis") {
	this.mAxisX.value = 0;
	this.mAxisY.value = 1;
	this.mAxisZ.value = 0;
	this.disableAxisEdit(true);
      }
      else if (new_val=="zaxis") {
	this.mAxisX.value = 0;
	this.mAxisY.value = 0;
	this.mAxisZ.value = 1;
	this.disableAxisEdit(true);
      }
      else {
	this.disableAxisEdit(false);
	return;
      }

      this.validateSpinAxis(aEvent);
    };

    klass.disableAxisEdit = function (aFlag)
    {
      this.mAxisX.disabled = aFlag;
      this.mAxisY.disabled = aFlag;
      this.mAxisZ.disabled = aFlag;
    };

    ////////////////////////////////////////////////

    klass.onLoadCamMot = function()
    {
      if (this._tgtClsName!="CamMotion")
	return;

      let that = this;

      var page = document.getElementById("cammot-group");
      page.hidden = false;
      
      this.mTgtCam = document.getElementById("cammot-targ-cam");
      this.mTgtCam.sceneID = this.mMain.getSceneID();
      this.mTgtCam.addEventListener("select",
				    function (event) { that.validateCamMotWidgets(event); },
				    false);

      this.mIgnRot = document.getElementById("cammot-ign-rotate");
      this.mIgnRot.addEventListener("command",
				     function (event) { that.validateCamMotWidgets(event) },
				     false);

      this.mIgnCen = document.getElementById("cammot-ign-center");
      this.mIgnCen.addEventListener("command",
				    function (event) { that.validateCamMotWidgets(event) },
				    false);

      this.mIgnZoom = document.getElementById("cammot-ign-zoom");
      this.mIgnZoom.addEventListener("command",
				     function (event) { that.validateCamMotWidgets(event) },
				     false);

      this.mIgnSlab = document.getElementById("cammot-ign-slab");
      this.mIgnSlab.addEventListener("command",
				     function (event) { that.validateCamMotWidgets(event) },
				     false);

    };

    /// Intrn-data --> widget
    klass.updateCamMotWidgets = function ()
    {
      if (this._tgtClsName!="CamMotion")
	return;

      var elem;

      elem = this.mMain.findPropData("endcam");
      dd("***** endcam value="+elem.value);
      this.mTgtCam.value = elem.value;

      /////

      elem = this.mMain.findPropData("ignorerotate");
      this.mIgnRot.checked = elem.value;

      elem = this.mMain.findPropData("ignorecenter");
      this.mIgnCen.checked = elem.value;

      elem = this.mMain.findPropData("ignorezoom");
      this.mIgnZoom.checked = elem.value;
      
      elem = this.mMain.findPropData("ignoreslab");
      this.mIgnSlab.checked = elem.value;

      dd("AnimObjPropPage> updateCamMotWidgets OK");

    };

    /// Widget --> Intrn-data
    klass.validateCamMotWidgets = function (aEvent)
    {
      if (this._tgtClsName!="CamMotion")
	return;

      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate tgt_id="+tgt_id);

      /////

      if (tgt_id=="cammot-targ-cam" || tgt_id==null) {
	new_val = this.mTgtCam.value;
	this.mMain.updateData("endcam", new_val);
      }

      /////

      if (tgt_id=="cammot-ign-rotate" || tgt_id==null) {
	new_val = this.mIgnRot.checked;
	this.mMain.updateData("ignorerotate", new_val);
      }

      if (tgt_id=="cammot-ign-center" || tgt_id==null) {
	new_val = this.mIgnCen.checked;
	this.mMain.updateData("ignorecenter", new_val);
      }

      if (tgt_id=="cammot-ign-zoom" || tgt_id==null) {
	new_val = this.mIgnZoom.checked;
	this.mMain.updateData("ignorezoom", new_val);
      }

      if (tgt_id=="cammot-ign-slab" || tgt_id==null) {
	new_val = this.mIgnSlab.checked;
	this.mMain.updateData("ignoreslab", new_val);
      }
    };

    ////////////////////////////////////////////////

    klass.onLoadShowHide = function()
    {
      if (this._tgtClsName!="ShowHideAnim")
	return;

      let that = this;

      var page = document.getElementById("showhide-group");
      page.hidden = false;
      
      this.onLoadRendSel("showhide-targ-rends");

      this.mMenuShowHide = document.getElementById("showhide-menu-showhide");
      this.mMenuShowHide.addEventListener("select",
					  function (event) { that.validateShowHideWidgets(event) },
					  false);

      this.mChkFade = document.getElementById("showhide-chk-fade");
      this.mChkFade.addEventListener("command",
				     function (event) { that.validateShowHideWidgets(event) },
				     false);

      this.mTgtASli = document.getElementById("showhide-tgtalpha");
      this.mTgtASli.addEventListener("change",
				     function (event) { that.validateWidgets(event) },
				     false);


    };

    /// Intrn-data --> widget
    klass.updateShowHideWidgets = function ()
    {
      if (this._tgtClsName!="ShowHideAnim")
	return;

      var elem;

      /////

      this.updateRendList();

      /////

      // Show/Hide
      elem = this.mMain.findPropData("hide");
      if (elem.value)
	this.mMenuShowHide.selectedIndex = 1; // hide
      else
	this.mMenuShowHide.selectedIndex = 0; // show

      // Fade
      elem = this.mMain.findPropData("fade");
      this.mChkFade.checked = elem.value;

      // Target alpha
      elem = this.mMain.findPropData("tgt_alpha");
      if (elem)
	  this.mTgtASli.value = elem.value;
      else
	  this.mTgtASli.disabled = true;

      dd("AnimObjPropPage> updateShowHideWidgets OK");

    };

    /// Widget --> Intrn-data
    klass.validateShowHideWidgets = function (aEvent)
    {
      if (this._tgtClsName!="ShowHideAnim")
	return;

      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate tgt_id="+tgt_id);

      /////

      if (tgt_id=="showhide-targ-rends" || tgt_id==null) {
	this.validateRendList();
      }

      /////

      if (tgt_id=="showhide-menu-showhide" || tgt_id==null) {
	new_val = this.mMenuShowHide.selectedItem.value;
	this.mMain.updateData("hide", new_val);
      }

      if (tgt_id=="showhide-chk-fade" || tgt_id==null) {
	new_val = this.mChkFade.checked;
	this.mMain.updateData("fade", new_val);
      }

      if (tgt_id=="showhide-tgtalpha" || tgt_id==null) {
	  var new_val = parseFloat(this.mTgtASli.value);
	  if (!(isNaN(new_val) || new_val<0.0 || new_val>1.0))
	      this.mMain.updateData("tgt_alpha", new_val);
      }

    };

    ////////////////////////////////////////////////

    klass.onLoadSlideIO = function()
    {
      if (this._tgtClsName!="SlideInOutAnim")
	return;

      let that = this;

      var page = document.getElementById("slideio-group");
      page.hidden = false;
      
      this.onLoadRendSel("slideio-targ-rends");

      this.mMenuShowHide = document.getElementById("slideio-menu-showhide");
      this.mMenuShowHide.addEventListener("select",
					  function (event) { that.validateSlideIOWidgets(event) },
					  false);

      this.mDirSli = document.getElementById("slideio-angle");
      this.mDirSli.addEventListener("change",
				    function (event) { that.validateSlideIOWidgets(event) },
				    false);
      
      this.mDistSli = document.getElementById("slideio-dist");
      this.mDistSli.addEventListener("change",
				     function (event) { that.validateSlideIOWidgets(event) },
				     false);

      this.mDirType = document.getElementById("slideio-dir-type");
      this.mDirType.addEventListener("select",
				     function (event) { that.dirTypeMenuChanged(event) },
				     false);

    };

    klass.dirTypeMenuChanged = function (aEvent)
    {
      var new_val = this.mDirType.selectedItem.value;
      this.mDirSli.value = new_val;
      var dum = {
      currentTarget : {
      id: "slideio-angle"
      }
      };
      this.validateSlideIOWidgets(dum);
    };
    
    /// Intrn-data --> widget
    klass.updateSlideIOWidgets = function ()
    {
      if (this._tgtClsName!="SlideInOutAnim")
	return;

      var elem;

      this.updateRendList();
      //elem = this.mMain.findPropData("rend");
      //this.mTgtRends.value = elem.value;

      /////

      elem = this.mMain.findPropData("direction");
      this.mDirSli.value = elem.value;

      elem = this.mMain.findPropData("distance");
      this.mDistSli.value = elem.value;

      elem = this.mMain.findPropData("hide");
      if (elem.value)
	this.mMenuShowHide.selectedIndex = 1; // hide
      else
	this.mMenuShowHide.selectedIndex = 0; // show

      dd("AnimObjPropPage> updateSlideIOWidgets OK");

    };

    /// Widget --> Intrn-data
    klass.validateSlideIOWidgets = function (aEvent)
    {
      if (this._tgtClsName!="SlideInOutAnim")
	return;

      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate tgt_id="+tgt_id);

      /////

      if (tgt_id=="slideio-targ-rends" || tgt_id==null) {
	this.validateRendList();
      }

      /////

      if (tgt_id=="slideio-angle" || tgt_id==null) {
	var new_val = parseFloat(this.mDirSli.value);
	if (isNaN(new_val)) return;
	this.mMain.updateData("direction", new_val);
      }

      if (tgt_id=="slideio-dist" || tgt_id==null) {
	var new_val = parseFloat(this.mDistSli.value);
	if (isNaN(new_val) || new_val<0.0) return;
	this.mMain.updateData("distance", new_val);
      }

      if (tgt_id=="slideio-menu-showhide" || tgt_id==null) {
	new_val = this.mMenuShowHide.selectedItem.value;
	this.mMain.updateData("hide", new_val);
      }

    };

    //////////

    klass.onLoadRendSel = function (aId)
    {
      var that = this;
      this.mRendList = document.getElementById(aId);
      this.mRendList.addEventListener("change",
				      function (event) { that.rendListSelChanged(event) },
       			      false);
      this.makeRendList();
    };

    klass.makeRendList = function ()
    {
      let scid = this.mMain.getSceneID();
      let scene = cuemol.getScene(scid);
      
      var json_str = scene.getObjectTreeJSON();
      var data;
      try {
	data = JSON.parse(json_str);
      }
      catch (e) {
	dd("error : "+json_str);
	debug.exception(e);
	return;
      }

      let list = new Array();
      var i, nlen = data.length;
      for (i=1; i<nlen; ++i) {
	elem = data[i];
	let obj_name = elem.name;
	if (elem.rends && elem.rends.length>0) {
	  let j, njlen = elem.rends.length;
	  for (j=0; j<njlen; ++j) {
	    let rend = elem.rends[j];
	    if (rend.name=="")
	      continue;
	    //this.mRendList.appendItem(rend.name+" (ID:"+rend.ID+")", rend.name);
	    list.push({"label": obj_name+"/"+rend.name+" (ID:"+rend.ID+")", "value":rend.name});
	  }
	}
      }
      this.mRendList.setList(list);
    };

    /*klass.convStr2Sel = function (aStr)
    {
      let re = new RegExp("\\s*,\\s*");
      let list = aStr.split(re);

      let aMenuList = this.mRendList;
      
      const nelem = aMenuList.itemCount;
      aMenuList.selectedIndex = -1;

      for (var i=0; i<nelem; ++i) {
	let item = aMenuList.getItemAtIndex(i);
	if (list.some( function (elem) { return item.value==elem; } )) {
	  aMenuList.toggleItemSelection(item);
	  dd("item "+item.value+" selected");
	}
      }

    };*/

    /*klass.convSel2Str = function ()
    {
      let sels = new Array();
      let aMenuList = this.mRendList;
      const nelem = aMenuList.itemCount;
      for (var i=0; i<nelem; ++i) {
	let item = aMenuList.getItemAtIndex(i);
	if (item.selected)
	  sels.push(item.value);
      }
      return sels.join(",");
    };*/

    klass.rendListSelChanged = function (aEvent)
    {
      this.validateRendList();
    };

    /// Intrn-data --> widget
    klass.updateRendList = function ()
    {
      var elem;
      elem = this.mMain.findPropData("rend");

      var that = this;
      // setTimeout( function () { that.convStr2Sel(elem.value); }, 0);
      setTimeout( function () { that.mRendList.setSelValues(elem.value); }, 0);
    };
    
    klass.validateRendList = function ()
    {
      //let new_val = this.convSel2Str();
      let new_val = this.mRendList.getSelValues();
      dd("validateRendList = "+new_val);
      this.mMain.updateData("rend", new_val);
    };

    ////////////////////////////////////////////////

    klass.onLoadMolAnim = function()
    {
      if (this._tgtClsName!="MolAnim")
	return;

      let that = this;

      var page = document.getElementById("molanim-group");
      page.hidden = false;
      
      this.mStartVal = document.getElementById("molanim_startval");
      this.mEndVal = document.getElementById("molanim_endval");

      this.mMolAnimTarg.addSelChanged(function(aEvent) {
	try { that.validateMolAnimWidgets(aEvent);}
	catch (e) { debug.exception(e); }
      });
    };

    /// Intrn-data --> widget
    klass.updateMolAnimWidgets = function ()
    {
      dd("AnimObjProp> *********** validate MolAnimW");
      if (this._tgtClsName!="MolAnim")
	return;

      var elem;

      /////

      elem = this.mMain.findPropData("mol");
      this.mMolAnimTarg.selectObjectByName(elem.value);

      elem = this.mMain.findPropData("startValue");
      this.mStartVal.value = elem.value;

      elem = this.mMain.findPropData("endValue");
      this.mEndVal.value = elem.value;

      dd("AnimObjPropPage> updateMolAnimWidgets OK");

    };

    /// Widget --> Intrn-data
    klass.validateMolAnimWidgets = function (aEvent)
    {
      if (this._tgtClsName!="MolAnim")
	return;

      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("AnimObjProp> validate tgt_id="+tgt_id);

      /////

      if (tgt_id=="molanim_tgtmol" || tgt_id==null) {
	let obj = this.mMolAnimTarg.getSelectedObj();
	if (obj)
	  this.mMain.updateData("mol", obj.name);
      }

      if (tgt_id=="molanim_startval" || tgt_id==null) {
	new_val = parseFloat(this.mStartVal.value);
	if (!(isNaN(new_val) || new_val<0.0 || new_val>1.0))
	  this.mMain.updateData("startValue", new_val);
      }

      if (tgt_id=="molanim_endval" || tgt_id==null) {
	new_val = parseFloat(this.mEndVal.value);
	if (!(isNaN(new_val) || new_val<0.0 || new_val>1.0))
	  this.mMain.updateData("endValue", new_val);
      }

    };

    ////////////////////////////////////////////////

    return ctor;
    
  } ) ();

}

