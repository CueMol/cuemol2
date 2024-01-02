//
// Generic object property page
//

// Call constructor
window.gMain = new cuemolui.GenPropEdit();

if (!("ObjectCommPropPage" in cuemolui)) {

  cuemolui.ObjectCommPropPage = ( function () {

    let ctor = function (aMain)
    {
      this.mGenEdit = aMain;
    };

    let klass = ctor.prototype;

    klass.onLoad = function ()
    {
      var that = this;

      this.mObjName = document.getElementById("comprop-name");

      this.mSelList = document.getElementById("comprop-molsel");
      this.mSelList.sceneID = this.mGenEdit.getSceneID();
      this.mSelList.buildBox();
      window.setTimeout( function () {
	that.mSelList.addEventListener("select",
				       function (event) {that.validateWidgets(event)},
				       false);
      }, 0);

      // Add event listeners
      this.mObjName.addEventListener("change",
				      function (event) { that.validateWidgets(event) },
				      false);
      this.mSelList.addEventListener("change",
				     function (event) { that.validateWidgets(event) },
				     false);

      var elem = document.getElementById("comprop-visible");
      elem.addEventListener("command",
			    function (event) { that.validateWidgets(event) },
			    false);

      elem = document.getElementById("comprop-locked");
      elem.addEventListener("command",
			    function (event) { that.validateWidgets(event) },
			    false);
    };

    klass.onActivate = function ()
    {
      this.updateWidgets();
    };

    klass.onInactivate = function ()
    {
      dd("ObjectCommPropPage> Inactivated");
      this.validateWidgets();
    };

    /// Intrn-data --> widget
    klass.updateWidgets = function ()
    {
      var elem;

      elem = this.mGenEdit.findPropData("name");
      this.mObjName.value = elem.value;

      var elem = this.mGenEdit.findPropData("sel");
      if (elem) {
	var selstr = elem.value;
	//alert("objprop selstr="+selstr);
	this.mSelList.origSel = selstr;
	this.mSelList.buildBox();
      }
      else {
	this.mSelList.disabled = true;
      }

      elem = this.mGenEdit.findPropData("visible");
      document.getElementById("comprop-visible").checked = elem.value;

      elem = this.mGenEdit.findPropData("locked");
      document.getElementById("comprop-locked").checked = elem.value;

      var widget = document.getElementById("label-embed-value");
      elem = this.mGenEdit.findPropData("src");
      if (elem.value.length==0||
	  elem.value.indexOf("datachunk:")==0) {
	widget.value = "(embeded)";
      }
      else {
	let srctype = this.mGenEdit.findPropData("srctype");
	if (srctype.value)
	  widget.value = elem.value + "  ("+srctype.value+")";
	else
	  widget.value = elem.value;
      }
    };

    /// Widget --> Intrn-data
    klass.validateWidgets = function (aEvent)
    {
      var tgt_id = null;
      var new_val;
      if (aEvent)
	tgt_id = aEvent.currentTarget.id;

      dd("CommonProp> validate tgt_id="+tgt_id);
      if (tgt_id=="comprop-name" || tgt_id==null) {
	new_val = this.mObjName.value;
	this.mGenEdit.updateData("name", new_val);
      }

      if (tgt_id=="comprop-molsel" || tgt_id==null) {
	if (!this.mSelList.disabled) {
	  new_val = this.mSelList.selectedSel;
	  this.mGenEdit.updateData("sel", new_val.toString());
	  this.mSelList.addHistorySel();
	}
      }

      if (tgt_id=="comprop-visible" || tgt_id==null) {
	new_val = document.getElementById("comprop-visible").checked;
	this.mGenEdit.updateData("visible", new_val);
      }

      if (tgt_id=="comprop-locked" || tgt_id==null) {
	new_val = document.getElementById("comprop-locked").checked;
	this.mGenEdit.updateData("locked", new_val);
      }

    };

    /*klass.resetAll = function ()
    {
      this.mPropEdit.resetAll();
    };*/

    return ctor;

  } ) ();
}

// Make renderer-common-prop "page" object
gComm = new cuemolui.ObjectCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

