// -*-Mode: javascript;-*-
//
// ribbon-propdlg.js
//  Ribbon Property Editor page
//
// $Id: ribbon-propdlg.js,v 1.3 2011/04/29 17:38:47 rishitani Exp $
//

// Make main page object
window.gMain = new cuemolui.GenPropEdit();

window.gHelix = new cuemolui.HscPropEdit("helix");
gMain.registerPage("ribbon-helix-tab", window.gHelix);

window.gSheet = new cuemolui.HscPropEdit("sheet");
gMain.registerPage("ribbon-sheet-tab", window.gSheet);

window.gCoil = new cuemolui.HscPropEdit("coil");
window.gCoil.mUseJct = false;
gMain.registerPage("ribbon-coil-tab", window.gCoil);

// Make renderer-common prop object
window.gRendComm = new cuemolui.RendCommPropEdit(gMain);

// Ribbon common prop page
window.gComm = ( function () { try {

  var util = require("util");

  var CommPropEdit = function ()
  {
    dd("CommPropEdit> Constructor called");
  };
  
  CommPropEdit.prototype.onLoad = function ()
  {
    this.mSectDet = document.getElementById("compage-sectdet");
    this.mAxDet = document.getElementById("compage-axdet");
    this.mSmoCol = document.getElementById("compage-smocol");
    this.mPivotChk = document.getElementById("compage-pivotcheck");
    this.mPivotAtom = document.getElementById("compage-pivotatom");
    this.mCapType = document.getElementById("compage-captype");
    // this.mEndType = document.getElementById("compage-endtype");
    this.mSegEndFade = document.getElementById("compage-segendfade");

    dd("CommPropEdit> OnLoad called");

    gRendComm.onLoad();
  };

  CommPropEdit.prototype.onActivate = function ()
  {
    dd("RibbonCommPropPage ENTER");
    this.updateWidgets();

    gRendComm.updateWidgets();
  };
  
  CommPropEdit.prototype.onInactivate = function ()
  {
    dd("RibbonCommPropPage LEAVE");
    // this.validateWidgets();

    gRendComm.validateWidgets();
  };

  /// Intrn-data --> widget
  CommPropEdit.prototype.updateWidgets = function ()
  {
    var elem;
    
    //elem = gMain.findPropData("section.detail");
    elem = gMain.findPropData("coil.detail");
    this.mSectDet.value = elem.value;

    elem = gMain.findPropData("axialdetail");
    this.mAxDet.value = elem.value;

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
    this.mPivotAtom.disabled = !this.mPivotChk.checked;
    
    // this.updateDisabledState();
  }

  /// Widget --> Intrn-data
  CommPropEdit.prototype.validateWidgets = function (aEvent)
  {
    try {

    // Ignore the event for starting of slider thumb drag
    if (typeof aEvent =='object' && 'isDragging' in aEvent && aEvent.isDragging)
      return;
    
    var tgt_id = aEvent.currentTarget.id;
    dd("CommPropEdit.validateTubeWidgets> called, cur target_id="+tgt_id);
    // dd("current target_id="+aEvent.currentTarget.id);

    var new_val;
    switch (tgt_id) {
    case "compage-sectdet":
      new_val = parseInt(this.mSectDet.value);
      if (isNaN(new_val) || new_val<2 || new_val>20)
	return;
      gMain.updateData("coil.detail", new_val);
      gMain.updateData("helix.detail", new_val);
      gMain.updateData("sheet.detail", new_val);
      break;
      
    case "compage-axdet":
      new_val = parseInt(this.mAxDet.value);
      if (isNaN(new_val) || new_val<2 || new_val>20)
	return;
      gMain.updateData("axialdetail", new_val);
      break;
      
    case "compage-smocol":
      gMain.updateData("smoothcolor", this.mSmoCol.checked);
      break;

    case "compage-captype":
      gMain.updateData("start_captype", aEvent.target.value);
      gMain.updateData("end_captype", aEvent.target.value);
      break;
      // case "compage-endtype":
      // gMain.updateData("end_captype", aEvent.target.value);
      // break;

    case "compage-segendfade":
      gMain.updateData("segend_fade", this.mSegEndFade.checked);
      break;

    case "compage-pivotcheck":
      new_val = aEvent.target.checked;
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

  return new CommPropEdit();
  
} catch (e) {debug.exception(e)} } ) ();

gMain.registerPage("ribbon-main-tab", gComm);

