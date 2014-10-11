//
// cartoon-hsc-page.js
//  cartoon renderer Property Editor Page (for Helix/Sheet/Coil)
//

if (!("CtnHscPropEdit" in cuemolui)) {

cuemolui.CtnHscPropEdit = ( function () {

  var util = require("util");

  var ctor = function (aPrefix)
  {
    dd("CtnHscPropEdit> Constructor called, ID prefix="+aPrefix);
    this.mIdPfx = aPrefix + "page";
    this.mPropPfx = aPrefix;
    if (aPrefix=="sheet")
      this.mUseJct = true;
    else
      this.mUseJct = false;
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
      
      this.mHeadType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mHeadGamma.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mHeadBasw.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mHeadArrow.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    }

    dd("CtnHscPropEdit> OnLoad called");
  };

  ctor.prototype.onActivate = function ()
  {
    dd("CtnHscPropPage ENTER");
    this.updateWidgets();
  };

  ctor.prototype.onInactivate = function ()
  {
    dd("CtnHscPropPage LEAVE");
    // this.validateWidgets();
  };

  /// Intrn-data --> widget
  ctor.prototype.updateWidgets = function ()
  {
    var elem;

    elem = gMain.findPropData(this.mPropPfx+".type");
    util.selectMenuListByValue(this.mSectType, elem.value);

    if (this.mPropPfx=="helix") {
      elem = gMain.findPropData("helix_wplus");
      this.mLineWidth.value = elem.value;
    }
    else {
      elem = gMain.findPropData(this.mPropPfx+".width");
      this.mLineWidth.value = elem.value;
    }
    
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

    }

    this.updateDisabledState();
  }

  ctor.prototype.updateDisabledState = function ()
  {
    this.mSharp.disabled = (this.mSectType.value=="roundsquare") ? false : true;

    if (this.mUseJct) {
      this.mHeadBasw.disabled = this.mHeadArrow.disabled =
	(this.mHeadType.value=="arrow") ? false : true;
    }
  }

  /// Widget --> Intrn-data
  ctor.prototype.validateWidgets = function (aEvent)
  {
    // Ignore the event for starting of slider thumb drag
    if ( (typeof aEvent =='object') && ('isDragging' in aEvent) && aEvent.isDragging )
      return;

    var tgt_id = aEvent.currentTarget.id;
    dd("validateWidgets> called, cur target_id="+tgt_id);

    var new_val;
    switch (tgt_id) {

    case this.mIdPfx+"-smooth":
      new_val = parseFloat(this.mSmooth.value);
      if (isNaN(new_val)) return;
      if (new_val<-5.0) new_val = -5.0;
      if (new_val>5.0) new_val = 5.0;
      gMain.updateData(this.mPropPfx+"_smooth", new_val);
      break;

      //////////

    case this.mIdPfx+"-secttype":
      new_val = aEvent.target.value;
      this.updateDisabledState();
      gMain.updateData(this.mPropPfx+".type", new_val);
      break;

    case this.mIdPfx+"-width":
      new_val = parseFloat(this.mLineWidth.value);
      if (isNaN(new_val)) return;
      if (this.mPropPfx=="helix") {
	if (new_val<0.0) new_val = 0.0;
	if (new_val>3.0) new_val = 3.0;
	gMain.updateData("helix_wplus", new_val);
      }
      else {
	if (new_val<0.0) new_val = 0.0;
	if (new_val>5.0) new_val = 5.0;
	gMain.updateData(this.mPropPfx+".width", new_val);
      }
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

    default:
      dd("Unknown target id:"+tgt_id);
      break;
    }
  }

  return ctor;

} ) ();
}

