//
// Disorder renderer property page
//

// Make main page object
window.gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
window.gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

window.gDiso = ( function () { try {

  var DisoPropEdit = function ()
  {
    dd("DisoPropEdit> Constructor called");
  };

  DisoPropEdit.prototype.onLoad = function ()
  {
    dd("DisoPropEdit> OnLoad called");

    let that = this;
    let rend = gMain.mTgtObj;
    let tgtobj = rend.getClientObj();

    this.mTargRend = document.getElementById("disopage-targrend");
    let rend_names = cuemol.getRendNameList(tgtobj, "tube", "ribbon", "cartoon", "nucl");
    let menu = this.mTargRend.menupopup;
    util.appendMenu(document, menu, "", "(none)");
    rend_names.forEach(function (aElem) {
      util.appendMenu(document, menu, aElem, aElem);
    });

    this.mDetail = document.getElementById("disopage-detail");
    this.mDotSize = document.getElementById("disopage-dotsize");
    this.mDotSep = document.getElementById("disopage-dotsep");
    this.mLoopSize = document.getElementById("disopage-loopsize");
    this.mLoopSize2 = document.getElementById("disopage-loopsize2");

    this.mCol = document.getElementById("disopage-color");
    this.mCol.setTargetSceneID(gMain.mTgtSceID);

  };

  DisoPropEdit.prototype.onActivate = function ()
  {
    this.updateWidgets();
  };

  DisoPropEdit.prototype.onInactivate = function ()
  {
    this.validateWidgets();
  };

  /// Intrn-data --> widget
  DisoPropEdit.prototype.updateWidgets = function ()
  {
    var elem;

    elem = gMain.findPropData("target");
    if (elem.value)
      util.selectMenuListByValue(this.mTargRend, elem.value);
    else
      util.selectMenuListByValue(this.mTargRend, "");

    elem = gMain.findPropData("detail");
    this.mDetail.value = elem.value;

    elem = gMain.findPropData("width");
    this.mDotSize.value = elem.value;

    elem = gMain.findPropData("dotsep");
    this.mDotSep.value = elem.value;

    elem = gMain.findPropData("loopsize");
    this.mLoopSize.value = elem.value;

    elem = gMain.findPropData("loopsize2");
    this.mLoopSize2.value = elem.value;

    elem = gMain.findPropData("defaultcolor");
    this.mCol.setColorText(elem.value);

    this.updateEnabledState();
  };

  DisoPropEdit.prototype.updateEnabledState = function ()
  {
/*
    if (this.mRing.checked) {
      this.mRingThick.disabled = false;
      this.mCol.disabled = false;
    }
    else {
      this.mRingThick.disabled = true;
      this.mCol.disabled = true;
    }
*/
  };

  /// Widget --> Intrn-data
  DisoPropEdit.prototype.validateWidgets = function ()
  {
    try {
      var new_val, elem;

      new_val = this.mTargRend.value;
      gMain.updateData("target", new_val);

      for (;;) {
	new_val = parseInt(this.mDetail.value, 10);
	if (isNaN(new_val) || new_val<2)
	  break;
	gMain.updateData("detail", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mDotSize.value);
	dd("DisoPropEdit dotsize newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("width", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mDotSep.value);
	dd("DisoPropEdit DotSep newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("dotsep", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mLoopSize.value);
	dd("DisoPropEdit LoopSize newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("loopsize", new_val);
	break;
      }

      for (;;) {
	new_val = parseFloat(this.mLoopSize2.value);
	dd("DisoPropEdit LoopSize2 newval="+new_val);
	if (isNaN(new_val) || new_val<0 || new_val>10)
	  break;
	gMain.updateData("loopsize2", new_val);
	break;
      }

      /*
      new_val = this.mRing.checked;
      gMain.updateData("ring", new_val);
      dd("DisoPropEdit Ring newval="+new_val);
      this.updateEnabledState();
       */

      new_val = this.mCol.getColorText();
      gMain.updateData("defaultcolor", new_val);

    } catch (e) { debug.exception(e); }
  };

  return new DisoPropEdit();

} catch (e) {debug.exception(e)}
} ) ();

gMain.registerPage("disorder-tab", gDiso);

