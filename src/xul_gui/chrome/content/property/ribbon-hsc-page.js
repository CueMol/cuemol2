//
// ribbon-hsc-page.js
//  RibbonRenderer Property Editor Page (for Helix/Sheet/Coil)
//
// $Id: ribbon-hsc-page.js,v 1.1 2011/01/02 14:15:47 rishitani Exp $
//

if (!("HscPropEdit" in cuemolui)) {

cuemolui.HscPropEdit = ( function () {

  var util = require("util");

  var ctor = function (aPrefix)
  {
    dd("HscPropEdit> Constructor called, ID prefix="+aPrefix);
    this.mIdPfx = aPrefix + "page";
    this.mPropPfx = aPrefix;
    this.mUseJct = true;
  };

  ctor.prototype.onLoad = function ()
  {
    this.mSectType = document.getElementById(this.mIdPfx+"-secttype");
    this.mLineWidth = document.getElementById(this.mIdPfx+"-width");
    this.mSharp = document.getElementById(this.mIdPfx+"-sharp");
    this.mTuber = document.getElementById(this.mIdPfx+"-tuber");
    this.mSmooth = document.getElementById(this.mIdPfx+"-smooth");
    
    // Add event listeners
    var that = this;
    this.mSectType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
    this.mLineWidth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mSharp.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mTuber.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mSmooth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);

    if (this.mUseJct) {
      this.mHeadType = document.getElementById(this.mIdPfx+"-head-type");
      this.mHeadGamma = document.getElementById(this.mIdPfx+"-head-gamma");
      this.mHeadBasw = document.getElementById(this.mIdPfx+"-head-basw");
      this.mHeadArrow = document.getElementById(this.mIdPfx+"-head-arrow");
      
      this.mTailType = document.getElementById(this.mIdPfx+"-tail-type");
      this.mTailGamma = document.getElementById(this.mIdPfx+"-tail-gamma");
      this.mTailBasw = document.getElementById(this.mIdPfx+"-tail-basw");
      this.mTailArrow = document.getElementById(this.mIdPfx+"-tail-arrow");

      this.mHeadType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mHeadGamma.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mHeadBasw.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mHeadArrow.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      
      this.mTailType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mTailGamma.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mTailBasw.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mTailArrow.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    }

    if (this.mPropPfx=="helix" || this.mPropPfx=="sheet") {
      this.mUseHBCol = document.getElementById(this.mIdPfx+"-usebackcol");
      this.mUseHBCol.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mHBCol = document.getElementById(this.mIdPfx+"-backcol");
      this.mHBCol.setTargetSceneID(gMain.mTgtSceID);
      this.mHBCol.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    }

    dd("HscPropEdit> OnLoad called");
  };

  ctor.prototype.onActivate = function ()
  {
    dd("HscPropPage ENTER");
    this.updateWidgets();
  };

  ctor.prototype.onInactivate = function ()
  {
    dd("HscPropPage LEAVE");
    // this.validateWidgets();
  };

  /// Intrn-data --> widget
  ctor.prototype.updateWidgets = function ()
  {
    var elem;

    elem = gMain.findPropData(this.mPropPfx+".type");
    util.selectMenuListByValue(this.mSectType, elem.value);

    elem = gMain.findPropData(this.mPropPfx+".width");
    this.mLineWidth.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+".sharp");
    this.mSharp.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+".tuber");
    this.mTuber.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+"_smooth");
    this.mSmooth.value = elem.value;

    //

    if (this.mUseJct) {

      elem = gMain.findPropData(this.mPropPfx+"head.type");
      util.selectMenuListByValue(this.mHeadType, elem.value);

      elem = gMain.findPropData(this.mPropPfx+"head.gamma");
      this.mHeadGamma.value = elem.value;

      elem = gMain.findPropData(this.mPropPfx+"head.basw");
      this.mHeadBasw.value = (1.0-elem.value) * 100.0;

      elem = gMain.findPropData(this.mPropPfx+"head.arrow");
      this.mHeadArrow.value = (elem.value-1.0) * 50.0;

      //

      elem = gMain.findPropData(this.mPropPfx+"tail.type");
      util.selectMenuListByValue(this.mTailType, elem.value);

      elem = gMain.findPropData(this.mPropPfx+"tail.gamma");
      this.mTailGamma.value = elem.value;

      elem = gMain.findPropData(this.mPropPfx+"tail.basw");
      this.mTailBasw.value = (1.0-elem.value) * 100.0;

      elem = gMain.findPropData(this.mPropPfx+"tail.arrow");
      this.mTailArrow.value = (elem.value-1.0) * 50.0;
    }

    if (this.mPropPfx=="helix") {
      elem = gMain.findPropData("helix_usebackcol");
      this.mUseHBCol.checked = elem.value;

      elem = gMain.findPropData("helix_backcol");
      this.mHBCol.setColorText(elem.value);
    }
    else if (this.mPropPfx=="sheet") {
      elem = gMain.findPropData("sheet_usesidecol");
      this.mUseHBCol.checked = elem.value;

      elem = gMain.findPropData("sheet_sidecol");
      this.mHBCol.setColorText(elem.value);
    }

    this.updateDisabledState();
  }

  ctor.prototype.updateDisabledState = function ()
  {
    if (this.mSectType.value=="roundsquare" ||
	this.mSectType.value=="fancy1")
      this.mSharp.disabled = false;
    else
      this.mSharp.disabled = true;

    if (this.mUseJct) {
      this.mHeadBasw.disabled = this.mHeadArrow.disabled =
	(this.mHeadType.value=="arrow") ? false : true;
      
      this.mTailBasw.disabled = this.mTailArrow.disabled =
	(this.mTailType.value=="arrow") ? false : true;
    }

    if (this.mPropPfx=="helix" || this.mPropPfx=="sheet") {
      if (this.mUseHBCol.checked)
	this.mHBCol.disabled = false;
      else
	this.mHBCol.disabled = true;
    }
  }

  /// Widget --> Intrn-data
  ctor.prototype.validateWidgets = function (aEvent)
  {
    // Ignore the event for starting of slider thumb drag
    if ('isDragging' in aEvent && aEvent.isDragging)
      return;

    var tgt_id = aEvent.currentTarget.id;
    dd("ctor.validateTubeWidgets> called, cur target_id="+tgt_id);
    // dd("current target_id="+aEvent.currentTarget.id);

    var new_val;
    switch (tgt_id) {
    case this.mIdPfx+"-secttype":
      new_val = aEvent.target.value;
      this.updateDisabledState();
      gMain.updateData(this.mPropPfx+".type", new_val);
      break;

    case this.mIdPfx+"-width":
      new_val = parseFloat(this.mLineWidth.value);
      if (isNaN(new_val) || new_val<=0.0 || new_val>10)
	return;
      gMain.updateData(this.mPropPfx+".width", new_val);
      break;

    case this.mIdPfx+"-tuber":
      new_val = parseFloat(this.mTuber.value);
      if (isNaN(new_val) || new_val<0.1 || new_val>10)
	return;
      gMain.updateData(this.mPropPfx+".tuber", new_val);
      break;

    case this.mIdPfx+"-sharp":
      new_val = parseFloat(this.mSharp.value);
      if (isNaN(new_val) || new_val<0 || new_val>1)
	return;
      gMain.updateData(this.mPropPfx+".sharp", new_val);
      break;

    case this.mIdPfx+"-smooth":
      new_val = parseFloat(this.mSmooth.value);
      if (isNaN(new_val) || new_val<0.0 || new_val>1.0)
	return;
      gMain.updateData(this.mPropPfx+"_smooth", new_val);
      break;

      //////////

    case this.mIdPfx+"-head-type":
      new_val = aEvent.target.value;
      this.updateDisabledState();
      gMain.updateData(this.mPropPfx+"head.type", new_val);
      break;

    case this.mIdPfx+"-head-gamma":
      new_val = parseFloat(this.mHeadGamma.value);
      if (isNaN(new_val) || new_val<0.1 || new_val>10)
	return;
      gMain.updateData(this.mPropPfx+"head.gamma", new_val);
      break;

    case this.mIdPfx+"-head-basw":
      new_val = parseInt(this.mHeadBasw.value);
      if (isNaN(new_val)) return;
      new_val = (100.0-new_val)/100.0;
      if (new_val<0.0 || new_val>1.0) return;
      gMain.updateData(this.mPropPfx+"head.basw", new_val);
      break;

    case this.mIdPfx+"-head-arrow":
      new_val = parseInt(this.mHeadArrow.value);
      if (isNaN(new_val)) return;
      new_val = new_val/50.0 + 1.0;
      if (new_val<1.0 || new_val>3.0) return;
      gMain.updateData(this.mPropPfx+"head.arrow", new_val);
      break;

      //////////

    case this.mIdPfx+"-tail-type":
      new_val = aEvent.target.value;
      this.updateDisabledState();
      gMain.updateData(this.mPropPfx+"tail.type", new_val);
      break;

    case this.mIdPfx+"-tail-gamma":
      new_val = parseFloat(this.mTailGamma.value);
      if (isNaN(new_val) || new_val<0.1 || new_val>10)
	return;
      gMain.updateData(this.mPropPfx+"tail.gamma", new_val);
      break;

    case this.mIdPfx+"-tail-basw":
      new_val = parseInt(this.mTailBasw.value);
      if (isNaN(new_val)) return;
      new_val = (100.0-new_val)/100.0;
      if (new_val<0.0 || new_val>1.0) return;
      gMain.updateData(this.mPropPfx+"tail.basw", new_val);
      break;

    case this.mIdPfx+"-tail-arrow":
      new_val = parseInt(this.mTailArrow.value);
      if (isNaN(new_val)) return;
      new_val = new_val/50.0 + 1.0;
      if (new_val<1.0 || new_val>3.0) return;
      gMain.updateData(this.mPropPfx+"tail.arrow", new_val);
      break;

      //////////
      
    case this.mIdPfx+"-usebackcol":
      new_val = this.mUseHBCol.checked;
      if (this.mPropPfx=="helix")
	gMain.updateData("helix_usebackcol", new_val);
      else if (this.mPropPfx=="sheet")
	gMain.updateData("sheet_usesidecol", new_val);
      this.updateDisabledState();
      break;

    case this.mIdPfx+"-backcol":
      new_val = this.mHBCol.getColorText();
      if (this.mPropPfx=="helix")
	gMain.updateData("helix_backcol", new_val);
      else if (this.mPropPfx=="sheet")
	gMain.updateData("sheet_sidecol", new_val);
      break;

    default:
      dd("Unknown target id:"+tgt_id);
      break;
    }
  }

  return ctor;

} ) ();
}

