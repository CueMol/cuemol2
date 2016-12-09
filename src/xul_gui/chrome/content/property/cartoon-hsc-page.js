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
    if (aPrefix=="sheet"||aPrefix=="helix")
      this.mUseJct = true;
    else
      this.mUseJct = false;
  };

  ctor.prototype.onLoad = function ()
  {
    var that = this;

    if (this.mIdPfx=="helixpage") {
      this.mHelixType = document.getElementById("helixpage-type");
      this.mHelixDeck = document.getElementById("helixpage-deck");
      this.mHelixType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);

      this.mHelixWmode = document.getElementById("helixpage-wmode");
      this.mHelixWmode.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mHelixExtn = document.getElementById("helixpage-extend");
      this.mHelixExtn.addEventListener("change", function (event) { that.validateWidgets(event) }, false);

      let pfx = "ribhlxpage";
      this.mRhSectType = document.getElementById(pfx+"-secttype");
      this.mRhSectDet = document.getElementById(pfx+"-sectdet");
      this.mRhLineWidth = document.getElementById(pfx+"-width");
      this.mRhSharp = document.getElementById(pfx+"-sharp");
      this.mRhTuber = document.getElementById(pfx+"-tuber");

      this.mRhSectType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mRhSectDet.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mRhLineWidth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mRhSharp.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mRhTuber.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    }

    if (this.mIdPfx=="helixpage" || this.mIdPfx=="sheetpage") {
      this.mWsmo = document.getElementById(this.mIdPfx+"-wsmooth");
      this.mWsmo.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    }

    this.mSectType = document.getElementById(this.mIdPfx+"-secttype");
    this.mSectDet = document.getElementById(this.mIdPfx+"-sectdet");
    this.mLineWidth = document.getElementById(this.mIdPfx+"-width");
    this.mSharp = document.getElementById(this.mIdPfx+"-sharp");
    this.mTuber = document.getElementById(this.mIdPfx+"-tuber");
    this.mSmooth = document.getElementById(this.mIdPfx+"-smooth");
    
    // Add event listeners
    this.mSectType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
    this.mSectDet.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mLineWidth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mSharp.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mTuber.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mSmooth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);


    if (this.mUseJct) {
      let pfx = this.mIdPfx;

      this.mHeadType = document.getElementById(pfx+"-head-type");
      this.mHeadGamma = document.getElementById(pfx+"-head-gamma");
      this.mHeadBasw = document.getElementById(pfx+"-head-basw");
      this.mHeadArrow = document.getElementById(pfx+"-head-arrow");
      
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

    if (this.mPropPfx=="helix") {
      elem = gMain.findPropData("helix_ribbon");
      if (elem.value)
	util.selectMenuListByValue(this.mHelixType, "ribbon");
      else
	util.selectMenuListByValue(this.mHelixType, "cylinder");

      elem = gMain.findPropData("helix_width_mode");
      util.selectMenuListByValue(this.mHelixWmode, elem.value);

      elem = gMain.findPropData("helix_extend");
      this.mHelixExtn.value = elem.value;

      let pfx = "ribhelix";
      elem = gMain.findPropData(pfx+".type");
      util.selectMenuListByValue(this.mRhSectType, elem.value);

      elem = gMain.findPropData(pfx+".detail");
      this.mRhSectDet.value = elem.value;

      elem = gMain.findPropData(pfx+".width");
      this.mRhLineWidth.value = elem.value;
      
      elem = gMain.findPropData(pfx+".sharp");
      this.mRhSharp.value = elem.value;
      
      elem = gMain.findPropData(pfx+".tuber");
      this.mRhTuber.value = elem.value;
    }

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
    
    elem = gMain.findPropData(this.mPropPfx+".detail");
    this.mSectDet.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+".sharp");
    this.mSharp.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+".tuber");
    this.mTuber.value = elem.value;

    elem = gMain.findPropData(this.mPropPfx+"_smooth");
    this.mSmooth.value = elem.value;

    if (this.mPropPfx=="helix" || this.mPropPfx=="sheet") {
      elem = gMain.findPropData(this.mPropPfx+"_wsmooth");
      this.mWsmo.value = elem.value;
    }

    //

    if (this.mUseJct) {
      let pfx = this.mPropPfx;
      if (this.mPropPfx=="helix")
	pfx = "ribhelix_";

      elem = gMain.findPropData(pfx+"head.type");
      util.selectMenuListByValue(this.mHeadType, elem.value);

      elem = gMain.findPropData(pfx+"head.gamma");
      this.mHeadGamma.value = elem.value;

      elem = gMain.findPropData(pfx+"head.basw");
      this.mHeadBasw.value = (1.0-elem.value) * 100.0;

      elem = gMain.findPropData(pfx+"head.arrow");
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

    if (this.mIdPfx=="helixpage") {
      if (this.mHelixType.value=="ribbon")
	this.mHelixDeck.selectedIndex = 0;
      else
	this.mHelixDeck.selectedIndex = 1;

      if (this.mHelixWmode.value=="wavy")
	this.mWsmo.disabled = false;
      else
	this.mWsmo.disabled = true;
    }
  }

  ////////////////////////////////////////////////////////

  /// Widget --> Intrn-data
  ctor.prototype.validateWidgets = function (aEvent)
  {
    // Ignore the event for starting of slider thumb drag
    if ( (typeof aEvent =='object') && ('isDragging' in aEvent) && aEvent.isDragging )
      return;

    var tgt_id = aEvent.currentTarget.id;
    dd("validateWidgets> called, cur target_id="+tgt_id);

    var new_val;

    //////////

    if (tgt_id==this.mIdPfx+"-smooth") {
      new_val = parseFloat(this.mSmooth.value);
      if (isNaN(new_val)) return;
      if (new_val<-5.0) new_val = -5.0;
      if (new_val>5.0) new_val = 5.0;
      gMain.updateData(this.mPropPfx+"_smooth", new_val);
    }

    if (tgt_id==this.mIdPfx+"-wsmooth") {
      new_val = parseFloat(this.mWsmo.value);
      if (isNaN(new_val)) return;
      if (new_val<-5.0) new_val = -5.0;
      if (new_val>5.0) new_val = 5.0;
      gMain.updateData(this.mPropPfx+"_wsmooth", new_val);
    }

    //////////

    if (tgt_id==this.mIdPfx+"-secttype") {
      new_val = aEvent.target.value;
      this.updateDisabledState();
      gMain.updateData(this.mPropPfx+".type", new_val);
    }

    if (tgt_id==this.mIdPfx+"-sectdet") {
      new_val = parseFloat(this.mSectDet.value);
      if (isNaN(new_val) || new_val<2 || new_val>50)
	return;
      gMain.updateData(this.mPropPfx+".detail", new_val);
    }

    if (tgt_id==this.mIdPfx+"-width") {
      new_val = parseFloat(this.mLineWidth.value);
      if (isNaN(new_val)) return;
      if (this.mPropPfx=="helix") {
	if (new_val<-2.0) new_val = -2.0;
	if (new_val>3.0) new_val = 3.0;
	gMain.updateData("helix_wplus", new_val);
      }
      else {
	if (new_val<0.0) new_val = 0.0;
	if (new_val>5.0) new_val = 5.0;
	gMain.updateData(this.mPropPfx+".width", new_val);
      }
    }

    if (tgt_id==this.mIdPfx+"-tuber") {
      new_val = parseFloat(this.mTuber.value);
      if (isNaN(new_val) || new_val<0.1 || new_val>10)
	return;
      gMain.updateData(this.mPropPfx+".tuber", new_val);
    }

    if (tgt_id==this.mIdPfx+"-sharp") {
      new_val = parseFloat(this.mSharp.value);
      if (isNaN(new_val) || new_val<0 || new_val>1)
	return;
      gMain.updateData(this.mPropPfx+".sharp", new_val);
    }

    /////////////////////////////////
    // sheet-page specific properties

    if (this.mIdPfx=="sheetpage") {
      if (tgt_id==this.mIdPfx+"-head-type") {
	new_val = aEvent.target.value;
	this.updateDisabledState();
	gMain.updateData(this.mPropPfx+"head.type", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-gamma") {
	new_val = parseFloat(this.mHeadGamma.value);
	if (isNaN(new_val) || new_val<0.1 || new_val>10)
	  return;
	gMain.updateData(this.mPropPfx+"head.gamma", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-basw") {
	new_val = parseInt(this.mHeadBasw.value);
	if (isNaN(new_val)) return;
	new_val = (100.0-new_val)/100.0;
	if (new_val<0.0 || new_val>1.0) return;
	gMain.updateData(this.mPropPfx+"head.basw", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-arrow") {
	new_val = parseInt(this.mHeadArrow.value);
	if (isNaN(new_val)) return;
	new_val = new_val/50.0 + 1.0;
	if (new_val<1.0 || new_val>3.0) return;
	gMain.updateData(this.mPropPfx+"head.arrow", new_val);
      }
    }

    ////////////////////////////////
    // helix-page specific properties
    
    if (this.mIdPfx=="helixpage") {
      if (tgt_id=="helixpage-type") {
	new_val = this.mHelixType.value; //aEvent.target.value;
	// alert("helixpage-type="+new_val);
	this.updateDisabledState();
	if (new_val=="ribbon")
	  gMain.updateData("helix_ribbon", true);
	else
	  gMain.updateData("helix_ribbon", false);
	
      }

      if (tgt_id=="helixpage-wmode") {
	new_val = this.mHelixWmode.value;
	// alert("helixpage-wmode="+new_val);
	this.updateDisabledState();
	gMain.updateData("helix_width_mode", new_val);
      }

      if (tgt_id=="helixpage-extend") {
	new_val = parseFloat(this.mHelixExtn.value);
	if (isNaN(new_val)) return;
	if (new_val<0.0) new_val = 0.0;
	if (new_val>5.0) new_val = 5.0;
	gMain.updateData("helix_extend", new_val);
      }

      let idpfx = "ribhlxpage";
      let pfx = "ribhelix";
      if (tgt_id==idpfx+"-secttype") {
	new_val = this.mRhSectType.value;
	this.updateDisabledState();
	gMain.updateData(pfx+".type", new_val);
      }
      
      if (tgt_id==idpfx+"-sectdet") {
	new_val = parseFloat(this.mRhSectDet.value);
	if (isNaN(new_val) || new_val<2 || new_val>20)
	  return;
	gMain.updateData(pfx+".detail", new_val);
      }

      if (tgt_id==idpfx+"-width") {
	new_val = parseFloat(mRhLineWidth.value);
	if (isNaN(new_val)) return;
	if (new_val<0.0) new_val = 0.0;
	if (new_val>5.0) new_val = 5.0;
	gMain.updateData(pfx+".width", new_val);
      }
      
      if (tgt_id==idpfx+"-tuber") {
	new_val = parseFloat(this.mRhTuber.value);
	if (isNaN(new_val) || new_val<0.1 || new_val>10)
	  return;
	gMain.updateData(pfx+".tuber", new_val);
      }
      
      if (tgt_id==idpfx+"-sharp") {
	new_val = parseFloat(this.mRhSharp.value);
	if (isNaN(new_val) || new_val<0 || new_val>1)
	  return;
	gMain.updateData(pfx+".sharp", new_val);
      }

      pfx = "ribhelix_";
      if (tgt_id==this.mIdPfx+"-head-type") {
	new_val = this.mHeadType.value;
	this.updateDisabledState();
	gMain.updateData(pfx+"head.type", new_val);
	gMain.updateData(pfx+"tail.type", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-gamma") {
	new_val = parseFloat(this.mHeadGamma.value);
	if (isNaN(new_val) || new_val<0.1 || new_val>10)
	  return;
	gMain.updateData(pfx+"head.gamma", new_val);
	gMain.updateData(pfx+"tail.gamma", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-basw") {
	new_val = parseInt(this.mHeadBasw.value);
	if (isNaN(new_val)) return;
	new_val = (100.0-new_val)/100.0;
	if (new_val<0.0 || new_val>1.0) return;
	gMain.updateData(pfx+"head.basw", new_val);
	gMain.updateData(pfx+"tail.basw", new_val);
      }
      
      if (tgt_id==this.mIdPfx+"-head-arrow") {
	new_val = parseInt(this.mHeadArrow.value);
	if (isNaN(new_val)) return;
	new_val = new_val/50.0 + 1.0;
	if (new_val<1.0 || new_val>3.0) return;
	gMain.updateData(pfx+"head.arrow", new_val);
	gMain.updateData(pfx+"tail.arrow", new_val);
      }
    }

  }

  return ctor;

} ) ();
}

