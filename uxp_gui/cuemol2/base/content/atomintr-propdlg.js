//
// Atom interaction renderer property page
//
// $Id: atomintr-propdlg.js,v 1.2 2011/05/01 13:35:48 rishitani Exp $

//try {

// Call constructor
window.gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
window.gComm = new cuemolui.RendCommPropPage(gMain);

gMain.registerPage("common-tab", gComm);

window.gAintr = ( function () {//
  
  var AintrEdit = function ()
  {
    dd("AintrEdit> Constructor called");
  };

  AintrEdit.prototype.onLoad = function ()
  {
    dd("AintrEdit> OnLoad called");

    var that = this;
    this.mModeSel =document.getElementById("aintrpage-mode"); 
    this.mWidthSli=document.getElementById("aintrpage-width"); 
    this.mShowLab = document.getElementById("aintrpage-showlabel"); 

    this.mColBox = document.getElementById("aintrpage-color");
    this.mColBox.setTargetSceneID(gMain.mTgtSceID);

    this.mStpBox = new Array(6);
    for (var i=0; i<6; ++i)
      this.mStpBox[i] = document.getElementById("aintrpage-stp"+i);

    this.mDashed = document.getElementById("aintrpage-dashed"); 
    this.mDetail =document.getElementById("aintrpage-detail"); 
    this.mCapSt =document.getElementById("aintrpage-startcap"); 
    this.mCapEn =document.getElementById("aintrpage-endcap"); 
  };

  AintrEdit.prototype.onActivate = function ()
  {
    this.updateWidgets();
  };

  AintrEdit.prototype.onInactivate = function ()
  {
    //this.validateWidgets(null);
  };

  /// Intrn-data --> widget
  AintrEdit.prototype.updateWidgets = function ()
  {
    var elem;
    elem = gMain.findPropData("mode");
    util.selectMenuListByValue(this.mModeSel, elem.value);
    this.updateMode(elem.value);

    elem = gMain.findPropData("showlabel");
    this.mShowLab.checked = elem.value;

    elem = gMain.findPropData("width");
    this.mWidthSli.value = elem.value;

    elem = gMain.findPropData("color");
    this.mColBox.setColorText(elem.value);

    var bdashed = false;
    for (var i=0; i<6; ++i) {
      elem = gMain.findPropData("stipple"+i);
      if (elem.value>=0) {
	this.mStpBox[i].value = elem.value;
	bdashed = true;
      }
      else
	this.mStpBox[i].value = "";
    }
    this.mDashed.checked = bdashed;
    this.updateDashed(bdashed);

    elem = gMain.findPropData("detail");
    if (!util.selectMenuListByValue(this.mDetail, elem.value))
      this.mDetail.value = elem.value;

    elem = gMain.findPropData("captype_start");
    util.selectMenuListByValue(this.mCapSt, elem.value);
    elem = gMain.findPropData("captype_end");
    util.selectMenuListByValue(this.mCapEn, elem.value);
  }

  /// Widget --> Intrn-data
  AintrEdit.prototype.validateWidgets = function (aEvent)
  {
    var curid = null, id = null;
    if (aEvent) {
      curid = aEvent.currentTarget.id;
      id = aEvent.target.id;
    }
    var new_val, elem;

    try {
      if (curid=="aintrpage-mode") {
	new_val = this.mModeSel.selectedItem.value;
	gMain.updateData("mode", new_val);
	this.updateMode(new_val);
	return;
      }

      if (curid=="aintrpage-showlabel") {
	new_val = this.mShowLab.checked;
	gMain.updateData("showlabel", new_val);
	return;
      }

      if (curid=="aintrpage-width") {
	new_val = parseFloat(this.mWidthSli.value);
	//dd("AintrEdit BondWidth newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  return;
	gMain.updateData("width", new_val);
	return;
      }

      if (curid=="aintrpage-color") {
	new_val = this.mColBox.getColorText();
	gMain.updateData("color", new_val);
	return;
      }

      if (curid=="aintrpage-dashed") {
	new_val = this.mDashed.checked;
	if (new_val) {
	  var stp0 = parseFloat(this.mStpBox[0].value);
	  if (isNaN(stp0) || stp0<0) {
	    this.mStpBox[0].value = 1.0;
	    gMain.updateData("stipple0", 1.0);
	  }
	}
	else {
	  for (var i=0; i<6; ++i) {
	    gMain.updateData("stipple"+i, -1);
	  }
	}
	this.updateDashed(new_val);
	return;
      }

      for (var i=0; i<6; ++i) {
	if (id==("aintrpage-stp"+i) ) {
	  new_val = parseFloat(this.mStpBox[i].value);
	  dd("AintrEdit stipple"+i+" newval="+new_val);
	  if (isNaN(new_val) || new_val<0)
	    gMain.updateData("stipple"+i, -1);
	  else
	    gMain.updateData("stipple"+i, new_val);
	  return;
	}
      }

      if (curid=="aintrpage-detail") {
	new_val = parseInt(this.mDetail.value);
	if (isNaN(new_val) || new_val<0)
	  return;
	gMain.updateData("detail", new_val);
	return;
      }

      if (curid=="aintrpage-startcap") {
	new_val = this.mCapSt.selectedItem.value;
	gMain.updateData("captype_start", new_val);
	return;
      }
      if (curid=="aintrpage-endcap") {
	new_val = this.mCapEn.selectedItem.value;
	gMain.updateData("captype_end", new_val);
	return;
      }

    } catch (e) { debug.exception(e); }
  };

  AintrEdit.prototype.updateMode = function (new_val)
  {
    if (new_val=="simple") {
      this.mWidthSli.setAttribute("unit", "px");
      this.mCapSt.disabled = true;
      this.mCapEn.disabled = true;
      this.mDetail.disabled = true;
    }
    else {
      this.mWidthSli.setAttribute("unit", "\xC5");
      this.mCapSt.disabled = false;
      this.mCapEn.disabled = false;
      this.mDetail.disabled = false;
    }
  };

  AintrEdit.prototype.updateDashed = function (new_val)
  {
    for (var i=0; i<6; ++i) {
      this.mStpBox[i].disabled = !new_val;
    }
  };

  return new AintrEdit();

} ) ();

gMain.registerPage("atomintr-tab", gAintr);

//} catch (e) {debug.exception(e)}

