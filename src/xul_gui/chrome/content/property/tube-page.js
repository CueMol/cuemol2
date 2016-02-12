//
// tube-page.js
//  Tube Renderer Property Editor Page
//

if (!("RendTubePropPage" in cuemolui)) {

  cuemolui.RendTubePropPage = ( function () { try {

    var util = require("util");

    var TubePropPage = function ()
    {
      dd("TubePropPage> Constructor called");
    };

    TubePropPage.prototype.onLoad = function ()
    {
      this.mSectType = document.getElementById("tubepage-secttype");
      this.mLineWidth = document.getElementById("tubepage-width");
      //this.mTuber = document.getElementById("tubepage-tuber");
      this.mWidth2 = document.getElementById("tubepage-width2");
      this.mSharp = document.getElementById("tubepage-sharp");
      this.mSectDet = document.getElementById("tubepage-sectdet");

      this.mAxDet = document.getElementById("tubepage-axdet");
      this.mSmooth = document.getElementById("tubepage-smooth");
      this.mSmoCol = document.getElementById("tubepage-smocol");

      this.mPivotChk = document.getElementById("tubepage-pivotcheck");
      this.mPivotAtom = document.getElementById("tubepage-pivotatom");

      this.mCapType = document.getElementById("tubepage-captype");
      this.mSegEndFade = document.getElementById("tubepage-segendfade");

      // Add event listeners
      var that = this;
      this.mSectType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mSectDet.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mLineWidth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      //this.mTuber.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mWidth2.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mSharp.addEventListener("change", function (event) { that.validateWidgets(event) }, false);

      this.mAxDet.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mSmooth.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mSmoCol.addEventListener("command", function (event) { that.validateWidgets(event) }, false);

      this.mPivotChk.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mPivotAtom.addEventListener("change", function (event) { that.validateWidgets(event) }, false);

      this.mCapType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mSegEndFade.addEventListener("command", function (event) { that.validateWidgets(event) }, false);

      // Putty
      this.mPuttyMode = document.getElementById("tubepage-puttymode");
      this.mPuttyMode.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mPuttyTgt = document.getElementById("tubepage-puttytgt");
      this.mPuttyTgt.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
      this.mPuttyLoScl = document.getElementById("tubepage-puttyloscl");
      this.mPuttyLoScl.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
      this.mPuttyHiScl = document.getElementById("tubepage-puttyhiscl");
      this.mPuttyHiScl.addEventListener("change", function (event) { that.validateWidgets(event) }, false);

    };

    TubePropPage.prototype.onActivate = function ()
    {
      //dd("TubePropPage ENTER");
      this.updateWidgets();
    };

    TubePropPage.prototype.onInactivate = function ()
    {
      //dd("TubePropPage LEAVE");
      // this.validateWidgets();
    };

    /// Intrn-data --> widget
    TubePropPage.prototype.updateWidgets = function ()
    {
      var elem;

      elem = gMain.findPropData("section.type");
      util.selectMenuListByValue(this.mSectType, elem.value);

      elem = gMain.findPropData("section.width");
      this.mLineWidth.value = elem.value;

      elem = gMain.findPropData("section.sharp");
      this.mSharp.value = elem.value;

      elem = gMain.findPropData("section.tuber");
      //this.mTuber.value = elem.value;
      this.mWidth2.value = elem.value * this.mLineWidth.value;

      elem = gMain.findPropData("section.detail");
      this.mSectDet.value = elem.value;

      elem = gMain.findPropData("axialdetail");
      this.mAxDet.value = elem.value;

      elem = gMain.findPropData("smooth");
      this.mSmooth.value = elem.value;

      elem = gMain.findPropData("smoothcolor");
      this.mSmoCol.checked = elem.value;

      elem = gMain.findPropData("start_captype");
      util.selectMenuListByValue(this.mCapType, elem.value);
      // elem = gMain.findPropData("end_captype");
      // util.selectMenuListByValue(this.mEndType, elem.value);

      elem = gMain.findPropData("segend_fade");
      this.mSegEndFade.checked = elem.value;
      
      elem = gMain.findPropData("pivotatom");
      this.mPivotAtom.value = elem.value;
      this.mPivotChk.checked = !elem.isdefault;

      // putty
      elem = gMain.findPropData("putty_mode");
      //dd("putty_mode = "+elem.value);
      util.selectMenuListByValue(this.mPuttyMode, elem.value);
      //dd("putty_mode set = "+this.mPuttyMode.value);
      elem = gMain.findPropData("putty_tgt");
      util.selectMenuListByValue(this.mPuttyTgt, elem.value);

      elem = gMain.findPropData("putty_hiscl");
      this.mPuttyHiScl.value = elem.value;
      elem = gMain.findPropData("putty_loscl");
      this.mPuttyLoScl.value = elem.value;

      this.updateDisabledState();
    }

    /// Widget --> Intrn-data
    TubePropPage.prototype.validateWidgets = function (aEvent)
    {
      // Ignore the event for starting of slider thumb drag
      if ('isDragging' in aEvent && aEvent.isDragging)
	return;

      var tgt_id = aEvent.currentTarget.id;
      dd("TubePropPage.validateTubeWidgets> called, cur target_id="+tgt_id);
      // dd("current target_id="+aEvent.currentTarget.id);

      var new_val;
      switch (tgt_id) {
      case "tubepage-secttype":
	new_val = aEvent.target.value;
	this.updateDisabledState();
	gMain.updateData("section.type", new_val);
	break;

      case "tubepage-width":
	new_val = parseFloat(this.mLineWidth.value);
	if (isNaN(new_val) || new_val<=0.0 || new_val>10)
	  return;
	gMain.updateData("section.width", new_val);
	break;

      case "tubepage-width2":
	new_val = parseFloat(this.mWidth2.value);
	if (isNaN(new_val) || new_val<=0.0 || new_val>10)
	  return;
	var w = parseFloat(this.mLineWidth.value);
	gMain.updateData("section.tuber", new_val/w);
	break;
      /*case "tubepage-tuber":
	new_val = parseFloat(this.mTuber.value);
	if (isNaN(new_val) || new_val<0.1 || new_val>10)
	  return;
	gMain.updateData("section.tuber", new_val);
	break;*/

      case "tubepage-sharp":
	new_val = parseFloat(this.mSharp.value);
	if (isNaN(new_val) || new_val<0 || new_val>1)
	  return;
	gMain.updateData("section.sharp", new_val);
	break;

      case "tubepage-sectdet":
	new_val = parseInt(this.mSectDet.value);
	if (isNaN(new_val) || new_val<2 || new_val>20)
	  return;
	gMain.updateData("section.detail", new_val);
	break;

      case "tubepage-axdet":
	new_val = parseInt(this.mAxDet.value);
	if (isNaN(new_val) || new_val<2 || new_val>20)
	  return;
	gMain.updateData("axialdetail", new_val);
	break;

      case "tubepage-smooth":
	new_val = parseFloat(this.mSmooth.value);
	if (isNaN(new_val) || new_val<0.0 || new_val>1.0)
	  return;
	gMain.updateData("smooth", new_val);
	break;

      case "tubepage-smocol":
	gMain.updateData("smoothcolor", this.mSmoCol.checked);
	break;

      case "tubepage-captype":
	gMain.updateData("start_captype", aEvent.target.value);
	gMain.updateData("end_captype", aEvent.target.value);
	break;

      case "tubepage-segendfade":
	gMain.updateData("segend_fade", this.mSegEndFade.checked);
	break;

	//case "tubepage-endtype":
	//gMain.updateData("end_captype", aEvent.target.value);
	//break;

      case "tubepage-pivotcheck":
	new_val = aEvent.target.checked;
	this.updateDisabledState();
	this.updateDefault("pivotatom", !new_val);
	break;

      case "tubepage-pivotatom":
	gMain.updateData("pivotatom", this.mPivotAtom.value);
	break;

	// putty
      case "tubepage-puttymode":
	gMain.updateData("putty_mode", aEvent.target.value);
	break;
      case "tubepage-puttytgt":
	gMain.updateData("putty_tgt", aEvent.target.value);
	break;
      case "tubepage-puttyhiscl":
	new_val = parseFloat(this.mPuttyHiScl.value);
	if (isNaN(new_val) || new_val<0.01 || new_val>10)
	  return;
	gMain.updateData("putty_hiscl", new_val);
	break;
      case "tubepage-puttyloscl":
	new_val = parseFloat(this.mPuttyLoScl.value);
	if (isNaN(new_val) || new_val<0.01 || new_val>10)
	  return;
	gMain.updateData("putty_loscl", new_val);
	break;

      default:
	dd("Unknown target id:"+tgt_id);
	break;
      }

      this.updateDisabledState();
    };
    
    /// update the enable states of the widgets
    TubePropPage.prototype.updateDisabledState = function ()
    {
      this.mSectDet.disabled = false;

      switch (this.mSectType.value) {
      case "elliptical":
	this.mSharp.disabled = true;
	break;
      case "roundsquare":
	this.mSharp.disabled = false;
	break;
      case "rectangle":
	this.mSharp.disabled = true;
	break;
      case "fancy1":
	this.mSharp.disabled = false;
	break;
      }

      this.mPivotAtom.disabled = !(this.mPivotChk.checked);

      dd("TubePropPage.updateDisabledStat:"+this.mPuttyMode.value);
      if (this.mPuttyMode.value=="none") {
	this.mPuttyTgt.disabled = true;
	this.mPuttyHiScl.disabled = true;
	this.mPuttyLoScl.disabled = true;
      }
      else {
	this.mPuttyTgt.disabled = false;
	this.mPuttyHiScl.disabled = false;
	this.mPuttyLoScl.disabled = false;
      }

    };
    
    TubePropPage.prototype.disableAll = function (bdis)
    {
      this.mSectType.disabled = bdis;
      this.mLineWidth.disabled = bdis;
      this.mWidth2.disabled = bdis;
      //this.mTuber.disabled = bdis;
      this.mSharp.disabled = bdis;
      this.mSectDet.disabled = bdis;

      this.mAxDet.disabled = bdis;
      this.mSmooth.disabled = bdis;
      this.mSmoCol.disabled = bdis;

      this.mPivotChk.disabled = bdis;
      this.mPivotAtom.disabled = bdis;

      this.mCapType.disabled = bdis;
      //this.mEndType.disabled = bdis;
      this.mSegEndFade.disabled = bdis;

      this.mPuttyMode.disabled = bdis;
      this.mPuttyTgt.disabled = bdis;
      this.mPuttyHiScl.disabled = bdis;
      this.mPuttyLoScl.disabled = bdis;
    };

    ///////////////////////////////////////////
    
    return TubePropPage;

  } catch (e) {debug.exception(e)} } ) ();

} // if (!("TubePropPage" in cuemolui))


