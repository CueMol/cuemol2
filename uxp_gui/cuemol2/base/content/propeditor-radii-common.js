//
// propeditor-radii-common.js
//  Common atomic radii Property Editor page
//

if (!("RadiiCommPage" in cuemolui)) {

  cuemolui.RadiiCommPage = ( function () {

    var ctor = function (aMain)
    {
      this.mMain = aMain;
      this._rendtype = this.mMain.getRendType();
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      let that = this;

      this.mRadiiC = document.getElementById("radii-C");
      this.mRadiiC.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiN = document.getElementById("radii-N");
      this.mRadiiN.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiO = document.getElementById("radii-O");
      this.mRadiiO.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiS = document.getElementById("radii-S");
      this.mRadiiS.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiP = document.getElementById("radii-P");
      this.mRadiiP.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiH = document.getElementById("radii-H");
      this.mRadiiH.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      this.mRadiiX = document.getElementById("radii-X");
      this.mRadiiX.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);


      this.mDetail = document.getElementById("radii-detail");
      this.mDetail.addEventListener("change",
				    function (event) {that.validateWidgets(event)},
				    false);

      if (this._rendtype!="cpk")
	document.getElementById("radii-detail-hbox").setAttribute("hidden", "true");

    };

    klass.onActivate = function ()
    {
      this.updateWidgets();
    };

    klass.onInactivate = function ()
    {
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

      elem = this.mMain.findPropData("vdwr_C");
      this.mRadiiC.value = elem.value;

      elem = this.mMain.findPropData("vdwr_N");
      this.mRadiiN.value = elem.value;

      elem = this.mMain.findPropData("vdwr_O");
      this.mRadiiO.value = elem.value;

      elem = this.mMain.findPropData("vdwr_S");
      this.mRadiiS.value = elem.value;

      elem = this.mMain.findPropData("vdwr_P");
      this.mRadiiP.value = elem.value;

      elem = this.mMain.findPropData("vdwr_H");
      this.mRadiiH.value = elem.value;

      elem = this.mMain.findPropData("vdwr_X");
      this.mRadiiX.value = elem.value;
    };

    /// Widget --> Intrn-data
    klass.validateWidgets = function (aEvent)
    {
      let tgt_id = null;
      let new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;

      this.validateRadii(this.mRadiiC.value, "radii-C", "vdwr_C", tgt_id);
      this.validateRadii(this.mRadiiN.value, "radii-N", "vdwr_N", tgt_id);
      this.validateRadii(this.mRadiiO.value, "radii-O", "vdwr_O", tgt_id);
      this.validateRadii(this.mRadiiS.value, "radii-S", "vdwr_S", tgt_id);
      this.validateRadii(this.mRadiiP.value, "radii-P", "vdwr_P", tgt_id);
      this.validateRadii(this.mRadiiH.value, "radii-H", "vdwr_H", tgt_id);
      this.validateRadii(this.mRadiiX.value, "radii-X", "vdwr_X", tgt_id);

      if (tgt_id=="radii-detail" || tgt_id==null) {
	new_val = parseInt(this.mDetail.value);
	if (!isNaN(new_val) && new_val>=2 && new_val<=20)
	  this.mMain.updateData("detail", new_val);
      }
    };

    klass.validateRadii = function (aValue, aId, aPropName, aTgtId)
    {
      if (aTgtId==aId || aTgtId==null) {
	new_val = parseFloat(aValue);
	if (!isNaN(new_val) && new_val>=0.0 && new_val<=3.0)
	  this.mMain.updateData(aPropName, new_val);
      }
    };

    return ctor;

  } ) ();
}

