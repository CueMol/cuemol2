// -*-Mode: javascript;-*-
//
// cartoon-propdlg.js
//  Cartoon Property Editor page
//

// Make main page object
window.gMain = new cuemolui.GenPropEdit();

window.gHelix = new cuemolui.CtnHscPropEdit("helix");
gMain.registerPage("cartoon-helix-tab", window.gHelix);

window.gSheet = new cuemolui.CtnHscPropEdit("sheet");
gMain.registerPage("cartoon-sheet-tab", window.gSheet);

window.gCoil = new cuemolui.CtnHscPropEdit("coil");
gMain.registerPage("cartoon-coil-tab", window.gCoil);

// Make renderer-common-prop "page" object
window.gComm = new cuemolui.RendCommPropPage(gMain);
gMain.registerPage("common-tab", gComm);

// Cartoon common prop page
window.gCartoon = ( function () { try {

  var util = require("util");

  var CartoonPropEdit = function ()
  {
    dd("CartoonPropEdit> Constructor called");
  };
  
  CartoonPropEdit.prototype.onLoad = function ()
  {
    // this.mSectDet = document.getElementById("compage-sectdet");
    this.mAxDet = document.getElementById("compage-axdet");
    this.mSmoCol = document.getElementById("compage-smocol");
    this.mPivotChk = document.getElementById("compage-pivotcheck");
    this.mPivotAtom = document.getElementById("compage-pivotatom");
    this.mStartType = document.getElementById("compage-starttype");
    this.mEndType = document.getElementById("compage-endtype");

    this.mAncChk = document.getElementById("compage-anchor-chk");
    this.mAncSel = document.getElementById("compage-anchor-sel");
    this.mAncWgtSli = document.getElementById("compage-anchor-wgt");

    dd("target obj ID = "+gMain.getClientObjID());
    this.mAncSel.molID = gMain.getClientObjID();
    //window.setTimeout( function () {
//    this.mAncSel.addEventListener("select",
//				  function (event) {this.validateWidgets(event)},
//				  false);
    //}, 0);

    dd("CartoonPropEdit> OnLoad called");

    //gRendComm.onLoad();
  };

  CartoonPropEdit.prototype.onActivate = function ()
  {
    dd("CartoonCommPropPage ENTER");
    this.updateWidgets();

    //gRendComm.updateWidgets();
  };
  
  CartoonPropEdit.prototype.onInactivate = function ()
  {
    dd("CartoonCommPropPage LEAVE");
    // this.validateWidgets();

    //gRendComm.validateWidgets();
  };

  /// Intrn-data --> widget
  CartoonPropEdit.prototype.updateWidgets = function ()
  {
    var elem;
    
    //elem = gMain.findPropData("coil.detail");
    //this.mSectDet.value = elem.value;

    elem = gMain.findPropData("axialdetail");
    this.mAxDet.value = elem.value;

    elem = gMain.findPropData("smoothcolor");
    this.mSmoCol.checked = elem.value;

    elem = gMain.findPropData("start_captype");
    util.selectMenuListByValue(this.mStartType, elem.value);
    elem = gMain.findPropData("end_captype");
    util.selectMenuListByValue(this.mEndType, elem.value);
    
    elem = gMain.findPropData("pivotatom");
    this.mPivotAtom.value = elem.value;
    this.mPivotChk.checked = !elem.isdefault;
    this.mPivotAtom.disabled = !this.mPivotChk.checked;

    elem = gMain.findPropData("anchor_sel");
    //dd("updateW anchor_sel="+elem.value);
    if (elem.value=="" || elem.value=="none") {
      this.enableAnchorWidgets(false);
      elem.value="none";
    }
    else {
      this.enableAnchorWidgets(true);
    }
    this.mAncSel.origSel = elem.value;
    this.mAncSel.buildBox();

    elem = gMain.findPropData("anchor_weight");
    this.mAncWgtSli.value = elem.value;
    
  };

  CartoonPropEdit.prototype.enableAnchorWidgets = function (aEnable)
  {
    this.mAncChk.checked = aEnable;
    this.mAncSel.disabled = !aEnable;
    this.mAncWgtSli.disabled = !aEnable;
  };

  /// Widget --> Intrn-data
  CartoonPropEdit.prototype.validateWidgets = function (aEvent)
  {
    try {

      // Ignore the event for starting of slider thumb drag
      if ( (typeof aEvent =='object') && ('isDragging' in aEvent) && aEvent.isDragging )
	return;

      var tgt_id = aEvent.currentTarget.id;
      dd("CartoonPropEdit.validateTubeWidgets> called, cur target_id="+tgt_id);
      // dd("current target_id="+aEvent.currentTarget.id);

      var new_val;

      if (tgt_id=="compage-anchor-chk" || tgt_id==null) {
	new_val = this.mAncChk.checked;
	if (new_val) {
	  // enable anchor atoms
	  this.enableAnchorWidgets(true);
	}
	else {
	  // disable anchor atoms
	  this.enableAnchorWidgets(false);
	  gMain.updateData("anchor_sel", "");
	  gMain.updateDefault("anchor_sel", true);
	}
      }

      if (tgt_id=="compage-anchor-sel" || tgt_id==null) {
	new_val = this.mAncSel.selectedSel.toString();
	if (new_val=="none")
	  new_val = "";
//dd("validateW> anchor_sel="+new_val);
	gMain.updateData("anchor_sel", new_val);
	this.mAncSel.addHistorySel();
      }

      if (tgt_id=="compage-anchor-wgt" || tgt_id==null) {
	var new_val = parseFloat(this.mAncWgtSli.value);
	if (isNaN(new_val)) return;
	if (new_val<0.0) new_val = 0.0;
	if (new_val>20.0) new_val = 20.0;
	gMain.updateData("anchor_weight", new_val);
      }

      switch (tgt_id) {
      /*case "compage-sectdet":
	new_val = parseInt(this.mSectDet.value);
	if (isNaN(new_val) || new_val<2 || new_val>20)
	  return;
	gMain.updateData("coil.detail", new_val);
	gMain.updateData("helix.detail", new_val);
	gMain.updateData("sheet.detail", new_val);
	break;
       */
	
      case "compage-axdet":
	new_val = parseInt(this.mAxDet.value);
	if (isNaN(new_val) || new_val<2 || new_val>20)
	  return;
	gMain.updateData("axialdetail", new_val);
	break;

      case "compage-smocol":
	gMain.updateData("smoothcolor", this.mSmoCol.checked);
	break;

      case "compage-starttype":
	gMain.updateData("start_captype", aEvent.target.value);
	break;

      case "compage-endtype":
	gMain.updateData("end_captype", aEvent.target.value);
	break;

      case "compage-pivotcheck":
	new_val = this.mPivotChk.checked;
	if (new_val) {
	  this.mPivotAtom.disabled = false;
	  gMain.updateDefault("pivotatom", false);
	}
	else {
	  this.mPivotAtom.disabled = true;
	  gMain.updateDefault("pivotatom", true);
	  gMain.updateData("pivotatom", "");
	}
	break;

      case "compage-pivotatom":
	gMain.updateData("pivotatom", this.mPivotAtom.value);
	break;

      default:
	dd("Unknown target id:"+tgt_id);
	break;
      }

    } catch (e) { debug.exception(e); }
  }

  return new CartoonPropEdit();
  
} catch (e) {debug.exception(e)} } ) ();

gMain.registerPage("cartoon-tab", gCartoon);

