//
// Ball-stick renderer property page
//
// $Id: ballstick-propdlg.js,v 1.1 2011/05/01 09:28:03 rishitani Exp $

// Make main page object
window.gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
window.gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

window.gBals = ( function () { try {

  var BsPropEdit = function ()
  {
    dd("BsPropEdit> Constructor called");
  };

  BsPropEdit.prototype.onLoad = function ()
  {
    // BsPropEdit.superclass.onLoad.call(this);

    dd("BsPropEdit> OnLoad called");

    var that = this;

    this.mDetail = document.getElementById("bspage-detail");
    this.mBondWidth = document.getElementById("bspage-bondwidth");
    this.mRadius = document.getElementById("bspage-radius");
    this.mRing = document.getElementById("bspage-ring");
    this.mRingThick = document.getElementById("bspage-ring-thick");

    this.mRingCol = document.getElementById("bspage-ring-color");
    this.mRingCol.setTargetSceneID(gMain.mTgtSceID);

    // this.mRingCol.setParentUpdate(function() { that.validateWidgets(); });
    // this.updateSimpleWidgets();
  };

  BsPropEdit.prototype.onActivate = function ()
  {
    dd("BalsPropPage ENTER");
    this.updateWidgets();
  };

  BsPropEdit.prototype.onInactivate = function ()
  {
    dd("BalsPropPage LEAVE");
    this.validateWidgets();
  };

  /// Intrn-data --> widget
  BsPropEdit.prototype.updateWidgets = function ()
  {
    var elem;
    elem = gMain.findPropData("detail");
    this.mDetail.value = elem.value;

    elem = gMain.findPropData("bondw");
    this.mBondWidth.value = elem.value;

    elem = gMain.findPropData("sphr");
    this.mRadius.value = elem.value;

    elem = gMain.findPropData("ring");
    this.mRing.checked = elem.value;

    elem = gMain.findPropData("thickness");
    this.mRingThick.value = elem.value;

    elem = gMain.findPropData("ringcolor");
    this.mRingCol.setColorText(elem.value);

    this.updateEnabledState();
  };

  BsPropEdit.prototype.updateEnabledState = function ()
  {
    if (this.mRing.checked) {
      this.mRingThick.disabled = false;
      this.mRingCol.disabled = false;
    }
    else {
      this.mRingThick.disabled = true;
      this.mRingCol.disabled = true;
    }
  };

  /// Widget --> Intrn-data
  BsPropEdit.prototype.validateWidgets = function ()
  {
    try {
      var new_val, elem;
      for (;;) {
	new_val = parseInt(this.mDetail.value, 10);
	if (isNaN(new_val) || new_val<2)
	  break;
	gMain.updateData("detail", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mBondWidth.value);
	dd("BsPropEdit BondWidth newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("bondw", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mRadius.value);
	dd("BsPropEdit AtomRadius newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("sphr", new_val);
	break;
      }

      new_val = this.mRing.checked;
      gMain.updateData("ring", new_val);
      dd("BsPropEdit Ring newval="+new_val);
      this.updateEnabledState();

      for (;;) {
	new_val = parseFloat(this.mRingThick.value);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("thickness", new_val);
	break;
      }

      new_val = this.mRingCol.getColorText();
      gMain.updateData("ringcolor", new_val);

    } catch (e) { debug.exception(e); }
  };

  return new BsPropEdit();

} catch (e) {debug.exception(e)}
} ) ();

gMain.registerPage("ballstick-tab", gBals);

