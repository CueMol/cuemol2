//
// Nucleic acid renderer property page
//

// Make main page object
window.gMain = new cuemolui.GenPropEdit();

// Make renderer-common-prop "page" object
window.gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

// Make renderer-tube-prop "page" object
window.gTube = new cuemolui.RendTubePropPage();
gMain.registerPage("tube-tab", gTube);

window.gNucl = ( function () { try {

  var NuclPropEdit = function ()
  {
    dd("NuclPropEdit> Constructor called");
  };

  NuclPropEdit.prototype.onLoad = function ()
  {
    // NuclPropEdit.superclass.onLoad.call(this);

    dd("NuclPropEdit> OnLoad called");

    this.mShowTube = document.getElementById("napage-showtube");
    this.mShowBP = document.getElementById("napage-showbp");
    this.mDetail = document.getElementById("napage-detail");
    this.mBaseSize = document.getElementById("napage-size");
    this.mBaseThick = document.getElementById("napage-thick");
    this.mBaseType = document.getElementById("napage-basetype");

    var that = this;

    this.mShowTube.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
    this.mShowBP.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
    this.mBaseType.addEventListener("command", function (event) { that.validateWidgets(event) }, false);
    this.mDetail.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mBaseSize.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
    this.mBaseThick.addEventListener("change", function (event) { that.validateWidgets(event) }, false);
  };


  NuclPropEdit.prototype.onActivate = function ()
  {
    dd("NuclPropPage ENTER");
    this.updateWidgets();
  };

  NuclPropEdit.prototype.onInactivate = function ()
  {
    dd("NuclPropPage LEAVE");
    this.validateWidgets();
  };

  /// Intrn-data --> widget
  NuclPropEdit.prototype.updateWidgets = function ()
  {
    var elem;

    elem = gMain.findPropData("show_tube");
    this.mShowTube.checked = elem.value;

    elem = gMain.findPropData("show_basepair");
    this.mShowBP.checked = elem.value;

    elem = gMain.findPropData("base_detail");
    this.mDetail.value = elem.value;

    elem = gMain.findPropData("base_size");
    this.mBaseSize.value = elem.value;
    var bssize = elem.value;

    elem = gMain.findPropData("base_thick");
    this.mBaseThick.value = (elem.value*100.0) / bssize;

    elem = gMain.findPropData("base_type");
    util.selectMenuListByValue(this.mBaseType, elem.value);

    this.updateEnabledState();
  };

  /// Widget --> Intrn-data
  NuclPropEdit.prototype.validateWidgets = function (aEvent)
  {
    this.updateEnabledState();

    try {
      var tgt_id = null;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;
      dd("NuclPropPage.validateTubeWidgets> called, cur target_id="+tgt_id);

      var new_val, elem;

      if (tgt_id==null || tgt_id=="napage-showtube") {
	gMain.updateData("show_tube", this.mShowTube.checked);
      }

      if (tgt_id==null || tgt_id=="napage-showbp") {
	gMain.updateData("show_basepair", this.mShowBP.checked);
      }

      if (tgt_id==null || tgt_id=="napage-detail") {
	new_val = parseInt(this.mDetail.value, 10);
	if (!isNaN(new_val) && new_val>=2)
	  gMain.updateData("base_detail", new_val);
      }

      if (tgt_id==null || tgt_id=="napage-size") {
	new_val = parseFloat(this.mBaseSize.value);
	dd("NuclPropEdit BaseSize newval="+new_val);
	if (!isNaN(new_val) && new_val>=0 && new_val<=10)
	  gMain.updateData("base_size", new_val);
      }

      if (tgt_id==null || tgt_id=="napage-thick") {
	var elem = gMain.findPropData("base_size");
	var bssize = elem.value;
	new_val = parseFloat(this.mBaseThick.value);
	if (!isNaN(new_val) && new_val>=0 && new_val<=100)
	  gMain.updateData("base_thick", new_val * bssize / 100.0);
      }

      if (tgt_id==null || tgt_id=="napage-basetype") {
	gMain.updateData("base_type", this.mBaseType.value);
      }
    } catch (e) { debug.exception(e); }
  };

  NuclPropEdit.prototype.updateEnabledState = function ()
  {
    if (this.mShowTube.checked) {
      gTube.disableAll(false);
    }
    else {
      gTube.disableAll(true);
    }
      /*if (this.mRing.checked) {
      this.mRingThick.disabled = false;
      this.mRingCol.disabled = false;
    }
    else {
      this.mRingThick.disabled = true;
      this.mRingCol.disabled = true;
      }*/
  };


  return new NuclPropEdit();

} catch (e) {debug.exception(e)}
} ) ();

gMain.registerPage("nucl-tab", gNucl);

