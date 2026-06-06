
//var util = require("util");
window.gDlg = {
mDlgData: window.arguments[0],

onLoad: function ()
{
  this.mListResoln = document.getElementById("list_resoln");
  this.mListUnit = document.getElementById("list_unit");
  this.mTextWidth = document.getElementById("text_width");
  this.mTextHeight = document.getElementById("text_height");
  this.mTextHUnit = document.getElementById("text_hunit");
  this.mChkReasp = document.getElementById("chk_retainasp");

  this.mDlgData.faspect = this.mDlgData.width/this.mDlgData.height;
  dd("onLoad faspect = "+this.mDlgData.faspect);
  if (this.mDlgData.exporter.name=="luxrend") {
    this.mDlgData.dpi = "72";
    this.mDlgData.unit = "px";
  }
  else {
    this.mDlgData.dpi = "72";
    this.mDlgData.unit = "mm";
  }
  //this.mTextWidth.value = this.mDlgData.width;
  //this.mTextHeight.value = this.mDlgData.height;

  this.updateWidgets();

  if (this.mDlgData.exporter.name=="luxrend") {
    this.mListResoln.disabled = true;
    this.mListUnit.disabled = true;
    //this.mChkReasp.disabled = true;
    document.getElementById("chk_alpha").hidden = true;
    document.getElementById("PNGOptDlg").setAttribute("title", "LuxRender options");
  }
},

////////

// dlgdata --> widgets
updateWidgets: function ()
{
  this.validateDPI();
  util.selectMenuListByValue(this.mListResoln, this.mDlgData.dpi);
  util.selectMenuListByValue(this.mListUnit, this.mDlgData.unit);
  this.mTextHUnit.value = this.mDlgData.unit;
  this.updateSizeText();
},

// dlgdata.dpi --> fdpi
validateDPI: function ()
{
  var fdpi = parseFloat(this.mDlgData.dpi);
  if (isNaN(fdpi) || fdpi<=0.0) {
    dd("Invalid DPI value: "+this.mDlgData.dpi);
    this.mDlgData.dpi = "72";
    fdpi = 72.0;
  }
  this.mDlgData.fdpi = fdpi;
},

// widget unit and res --> dlgdata.dpi, fdpi, unit
validateUnitRes: function ()
{
  this.mDlgData.dpi = this.mListResoln.value;
  this.validateDPI();
  util.selectMenuListByValue(this.mListResoln, this.mDlgData.dpi);
  this.mDlgData.unit = this.mListUnit.value;
  if (this.mDlgData.unit == "px") {
    this.mTextWidth.setAttribute("decimalplaces", 0);
    this.mTextHeight.setAttribute("decimalplaces", 0);
  }
  else {
    this.mTextWidth.setAttribute("decimalplaces", 2);
    this.mTextHeight.setAttribute("decimalplaces", 2);
  }
  this.mTextHUnit.value = this.mDlgData.unit;
  this.updateSizeText();
},

////////

getConvFac: function ()
{
  var fdpi = this.mDlgData.fdpi;
  var conv_fac = 1.0;
  if (this.mDlgData.unit == "mm") {
    conv_fac = 25.4;
  }
  else if (this.mDlgData.unit == "cm") {
    conv_fac = 2.54;
  }
  else if (this.mDlgData.unit == "in") {
  }
  else if (this.mDlgData.unit == "px") {
    conv_fac = fdpi;
  }
  return conv_fac;
},

////////

updateSizeText: function ()
{
  var fdpi = this.mDlgData.fdpi;
  var width_inch = this.mDlgData.width/fdpi;
  var height_inch = this.mDlgData.height/fdpi;

  var conv_fac = this.getConvFac();
  this.mTextWidth.value = width_inch * conv_fac;
  this.mTextHeight.value = height_inch * conv_fac;
},

validateSizeText: function (aEvent)
{
  var fdpi = this.mDlgData.fdpi;
  var conv_fac = this.getConvFac();

  var width_inch = parseFloat(this.mTextWidth.value) / conv_fac;
  var height_inch = parseFloat(this.mTextHeight.value) / conv_fac;

  this.mDlgData.width = parseInt(width_inch*fdpi);
  this.mDlgData.height = parseInt(height_inch*fdpi);

  if (this.mChkReasp.checked && aEvent) {
    var id = aEvent.target.id;
    if (id=="text_height")
      this.mDlgData.width = this.mDlgData.height * this.mDlgData.faspect;
    else
      this.mDlgData.height = this.mDlgData.width / this.mDlgData.faspect;
    this.updateSizeText();
  }

  dd("validate, ImageWidth: "+this.mDlgData.width);
  dd("validate, ImageHeight: "+this.mDlgData.height);
},

////////

validateReasp: function ()
{
  this.validateUnitRes();
  this.validateSizeText();
  var elem = this.mChkReasp;
  if (elem.checked) {
    this.mDlgData.width = this.mDlgData.height * this.mDlgData.faspect;
    this.updateSizeText();
  }
  else {
  }
},

////////

onAccept: function ()
{
  try {
    this.validateUnitRes();
    this.validateSizeText();
    this.mDlgData.ok = true;

    this.mDlgData.exporter.width = this.mDlgData.width;
    this.mDlgData.exporter.height = this.mDlgData.height;

    if (this.mDlgData.exporter.name=="png") {
      //this.mDlgData.intrl = document.getElementById("chk_intrl").checked;
      this.mDlgData.alpha = document.getElementById("chk_alpha").checked;
      //this.mDlgData.exporter.interlace = this.mDlgData.intrl;
      this.mDlgData.exporter.alpha = this.mDlgData.alpha;
      this.mDlgData.exporter.resoln = this.mDlgData.fdpi;
    }
    return true;
  }
  catch (e) { debug.exception(e); }
},
};
