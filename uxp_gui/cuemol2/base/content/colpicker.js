// -*-Mode: C++;-*-
// $Id: colpicker.js,v 1.7 2011/02/19 08:43:13 rishitani Exp $
//

////////////////////////////////
// define class ColorPicker

if (!("ColorPicker" in cuemolui)) {

cuemolui.ColorPicker = ( function () {

////////////////////////////////
// utility functions

var convHSB2RGB = util.convHSB2RGB;
var convRGB2HSB = util.convRGB2HSB;
var packToHTMLColor = util.packToHTMLColor;

const MODE_NONE = 0;
const MODE_RGB = 1;
const MODE_HSB = 2;
const MODE_NAMED = 3;
const MODE_PALETTE = 4;
const MODE_MOLCOL = 5;

/// constructor
var ColorPicker = function (aOuter)
{
  this._outer = aOuter;
  this._stylem = cuemol.getService("StyleManager");

  this.mMode = MODE_NONE;
  this.mTgtSceID = 0; // 0==invalid_uid

  this.mRGBValue = null;
  this.mDevRGBValue = null;
  this.mHSBValue = null;
  this.mNamedValue = null;

  this.mSelectedCell = null;

  this.mOrigValue = null;

  this.mDevColor = cuemol.createObj("Color");
}

ColorPicker.prototype.setTargetSceneID = function(aSceID)
{
  this.mTgtSceID = aSceID;
}

ColorPicker.prototype.convToRGB = function(aText)
{
  try {
    let color = this._stylem.compileColor(aText, this.mTgtSceID);
    return [color.r(), color.g(), color.b()];
  }
  catch (e) {
    dd("Cannot compile color string: "+aText);
    debug.exception(e);
    //return [0,0,0];
    return null;
  }
}

ColorPicker.prototype._anonid = function(aValue)
{
  return document.getAnonymousElementByAttribute(this._outer, "anonid", aValue);
}

ColorPicker.prototype.init = function()
{
  var that = this;
  
  //////////
  // Menus
  // document.getElementById("colpick_menu_hidedetail").addEventListener("command", function () { that.hideDetail(); }, false);
  this._anonid("colpick_menu_rgb").addEventListener("command", function () { that.showRGB(); }, false);
  this._anonid("colpick_menu_hsb").addEventListener("command", function () { that.showHSB(); }, false);
  this._anonid("colpick_menu_named").addEventListener("command", function () { that.showNamed(); }, false);
  this._anonid("colpick_menu_palette").addEventListener("command", function () { that.showPalette(); }, false);

  this._anonid("colpick_menu_molcol").addEventListener("command", function () {
    that.mMode = MODE_MOLCOL;
    var value = "$molcol";
    var rgb = that.convToRGB(value);
    that.mRGBValue = rgb;
    that.mNamedValue = value;
    that.updateMain();
    that.notifyChanged(true);
  }, false);

  //////////
  // main widget
  this.mMainTxtBox = this._anonid('main_textbox');
  this.mColorBox = this._anonid('main_colorbox');
  this.mDevColorBox = this._anonid('dev_colorbox');
  this.mDevWarnBox = this._anonid('dev_warnbox');
  this.mDevColorBox.addEventListener("click", function(a) { that.onGamutWarnClicked(a); }, false);
  this.mDevWarnBox.addEventListener("click", function(a) { that.onGamutWarnClicked(a); }, false);

  this.mMainTxtBox.addEventListener('change', function(a) { that.onMainTxtChanged(a); }, false);

  //////////
  // panels
  this.mSliderPopup = this._anonid('colpick_slider_popup');
  this.mNamedPopup = this._anonid('colpick_named_popup');
  this.mPalettePopup = this._anonid('colpick_palette_popup');

  this.mSliderPopup.addEventListener("popuphiding", function(a) { that.onPopupHiding(a); }, false);
  this.mNamedPopup.addEventListener("popuphiding", function(a) { that.onPopupHiding(a); }, false);
  this.mPalettePopup.addEventListener("popuphiding", function(a) { that.onPopupHiding(a); }, false);

  // named panel
  this.mNamedList = this._anonid('colpick_named_list');
  this.mNamedList.addEventListener("select", function(a) { that.onNamedListSelect(a); }, false);
  this.mNamedList.addEventListener("click", function(a) { that.onNamedListClicked(a); }, false);

  //////////
  // palette panel
  this.mPaletteBox = this._anonid('colpick_palette_box');
  //this.mPaletteBox.addEventListener("mouseover", function (ev) { that.onPaletteHoverCell(ev.originalTarget); }, false);
  this.mPaletteBox.addEventListener("click", function (ev) { that.onPaletteClickCell(ev.originalTarget); }, false);

  //////////
  // slider panel
  this.mCmpvBox1 = this._anonid('colpick_cmpv1');
  this.mCmpvBox1.addEventListener('change', function(a) { that.onCmpTextChanged(a); }, false);
  this.mColSli1 = this._anonid('colpick_sli1');
  this.mColSli1.addEventListener('change',
                                 function(aEvt) { that.onColSliChanged(aEvt);},
                                 false);
  this.mColSli1.addEventListener('dragStateChange',
                                 function(aEvt) { that.onDragStateChanged(aEvt);},
                                 false);
  //////////

  this.mCmpvBox2 = this._anonid('colpick_cmpv2');
  this.mColSli2 = this._anonid('colpick_sli2');
  this.mCmpvBox2.addEventListener('change', function(a) { that.onCmpTextChanged(a); }, false);
  this.mColSli2.addEventListener('change',
                                 function(aEvt) { that.onColSliChanged(aEvt);},
                                 false);
  this.mColSli2.addEventListener('dragStateChange',
                                 function(aEvt) { that.onDragStateChanged(aEvt);},
                                 false);
  //////////

  this.mCmpvBox3 = this._anonid('colpick_cmpv3');
  this.mColSli3 = this._anonid('colpick_sli3');
  this.mCmpvBox3.addEventListener('change', function(a) { that.onCmpTextChanged(a); }, false);
  this.mColSli3.addEventListener('change',
                                 function(aEvt) { that.onColSliChanged(aEvt);},
                                 false);
  this.mColSli3.addEventListener('dragStateChange',
                                 function(aEvt) { that.onDragStateChanged(aEvt);},
                                 false);

  //////////

  this.mCmpLab1 = this._anonid('colpick_lab1');
  this.mCmpLab2 = this._anonid('colpick_lab2');
  this.mCmpLab3 = this._anonid('colpick_lab3');

  // initialize with default value (black)
  this.setColorText("#000");
}

ColorPicker.prototype.onPopupHiding = function(aEvent)
{
  dd("*** PopupHiding: "+aEvent.target.getAttribute("anonid"));

  if (this.mOrigValue==null ||
      this.mMainTxtBox.value !== this.mOrigValue)
    this.notifyChanged(true);
}

ColorPicker.prototype.onMainTxtChanged = function(aEvent)
{
  var value = this.mMainTxtBox.value;
  var rgb = this.convToRGB(value);
  dd("MainTextChanged: value="+ value + ", in RGB: "+rgb);
  if (!rgb) {
    this.mMainTxtBox.value = this.mOrigValue;
    this.mRGBValue = this.convToRGB(this.mOrigValue);
    this.updateColorBox();
    // this.mRGBValue = unpackToRGB(this.mOrigValue);
  }
  else {
    // this.mMainTxtBox.value = value;
    this.mRGBValue = rgb;
    this.updateColorBox();
  }
  
  if (this.mMode == MODE_RGB) {
    this.updateGrads();
    this.updateThumbs();
  }
  else if (this.mMode == MODE_HSB) {
    this.mHSBValue = convRGB2HSB(this.mRGBValue);
    this.updateHSBGrads();
    this.updateHSBThumbs();
  }

  this.notifyChanged(true);
  aEvent.stopPropagation();
}

/// component text value is changed
ColorPicker.prototype.onCmpTextChanged = function(aEvent)
{
  var value;
  //var tgtid = aEvent.target.id;
  var tgtid = aEvent.target.getAttribute("anonid");
  dump("ColorPicker.onCmpTextChanged: "+tgtid+"\n");

  if (this.mMode == MODE_RGB) {

    switch (tgtid) {
    case "colpick_cmpv1":
      this.mRGBValue[0] = parseInt(this.mCmpvBox1.value);
      break;
      
    case "colpick_cmpv2":
      this.mRGBValue[1] = parseInt(this.mCmpvBox2.value);
      break;
      
    case "colpick_cmpv3":
      this.mRGBValue[2] = parseInt(this.mCmpvBox3.value);
      break;
      
    default:
      return;
    }

    this.updateGrads();
    this.updateThumbs();
  }
  else if (this.mMode == MODE_HSB) {

    switch (tgtid) {
    case "colpick_cmpv1":
      this.mHSBValue[0] = parseInt(this.mCmpvBox1.value);
      break;
      
    case "colpick_cmpv2":
      this.mHSBValue[1] = parseInt(this.mCmpvBox2.value);
      break;
      
    case "colpick_cmpv3":
      this.mHSBValue[2] = parseInt(this.mCmpvBox3.value);
      break;
      
    default:
      return;
    }

    this.mRGBValue = convHSB2RGB(this.mHSBValue);
    this.updateHSBGrads();
    this.updateHSBThumbs();
  }
  
  this.updateMain();
  this.notifyChanged(false);
  aEvent.stopPropagation();
}

ColorPicker.prototype.onColSliChanged = function(aEvent)
{
  //var tgtid = aEvent.target.id;
  var tgtid = aEvent.target.getAttribute("anonid");
  // dd("ColorPicker.onColSliChanged: "+tgtid);

  if (this.mMode==MODE_RGB) {
    switch (tgtid) {
    case "colpick_sli1":
      this.mRGBValue[0] = this.mColSli1.value;
      break;
    case "colpick_sli2":
      this.mRGBValue[1] = this.mColSli2.value;
      break;
    case "colpick_sli3":
      this.mRGBValue[2] = this.mColSli3.value;
      break;
    default:
      return;
    }
    this.updateRGBText();
    this.updateGrads();
  }
  else if (this.mMode==MODE_HSB) {
    switch (tgtid) {
    case "colpick_sli1":
      this.mHSBValue[0] = this.mColSli1.value;
      break;
    case "colpick_sli2":
      this.mHSBValue[1] = this.mColSli2.value;
      break;
    case "colpick_sli3":
      this.mHSBValue[2] = this.mColSli3.value;
      break;
    default:
      return;
    }
    this.mRGBValue = convHSB2RGB(this.mHSBValue);
    this.updateHSBText();
    this.updateHSBGrads();
  }

  this.updateMain();
  aEvent.stopPropagation();
}

ColorPicker.prototype.onDragStateChanged = function(aEvent)
{
  //var tgtid = aEvent.target.id;
  var tgtid = aEvent.target.getAttribute("anonid");
  // dd("ColorPicker.onDragStateChanged: "+tgtid);
  if (aEvent.isDragging) return;
  this.notifyChanged(false);
  aEvent.stopPropagation();
}

/////////////////////////////////////////////////////
// UI update methods

ColorPicker.prototype.updateColorBox = function()
{
  var text = packToHTMLColor(this.mRGBValue);
  this.mColorBox.style.backgroundColor = text;

  var ccode =
    (0xFF << 24) |
      ((this.mRGBValue[0] & 0xFF) << 16) |
        ((this.mRGBValue[1] & 0xFF) << 8)  |
          ((this.mRGBValue[2] & 0xFF));

  this.mDevColor.setCode(ccode);
  var devcc = this.mDevColor.getDevCode(this.mTgtSceID);
  var ingamut = this.mDevColor.isInGamut(this.mTgtSceID);
  this.mDevRGBValues = [(devcc >> 16) & 0xFF, (devcc >> 8) & 0xFF, devcc & 0xFF];

//  alert("ccode="+packToHTMLColor([(ccode >> 16) & 0xFF, (ccode >> 8) & 0xFF, ccode & 0xFF])+
//        ", devcc="+packToHTMLColor([(devcc >> 16) & 0xFF, (devcc >> 8) & 0xFF, devcc & 0xFF]));

  if (!ingamut) {
    this.mDevColorBox.hidden = false;
    this.mDevWarnBox.hidden = false;
    this.mDevColorBox.style.backgroundColor =
      packToHTMLColor(this.mDevRGBValues);
    dd("ColorBox: orig="+this.mColorBox.style.backgroundColor+", dev="+this.mDevColorBox.style.backgroundColor);
  }
  else {
    this.mDevColorBox.hidden = true;
    this.mDevWarnBox.hidden = true;
  }
}

/// fix the out-of-gamut color
ColorPicker.prototype.onGamutWarnClicked = function (aEvent)
{
  dd("onGamutWarnClicked");
  if (!this.mDevRGBValues)
    return;
  var value = packToHTMLColor(this.mDevRGBValues);
  dd("fixGamutWarn="+value);
  this.setColorText(value);
  this.notifyChanged(true);
};

ColorPicker.prototype.updateRGBText = function()
{
  this.mCmpvBox1.value = this.mRGBValue[0];
  this.mCmpvBox2.value = this.mRGBValue[1];
  this.mCmpvBox3.value = this.mRGBValue[2];
}

ColorPicker.prototype.updateHSBText = function()
{
  this.mCmpvBox1.value = this.mHSBValue[0];
  this.mCmpvBox2.value = this.mHSBValue[1];
  this.mCmpvBox3.value = this.mHSBValue[2];
}

ColorPicker.prototype.updateGrads = function()
{
  var g1b = packToHTMLColor([0, this.mRGBValue[1], this.mRGBValue[2]]);
  var g1e = packToHTMLColor([255, this.mRGBValue[1], this.mRGBValue[2]]);
  this.mColSli1.startColor = g1b;
  this.mColSli1.endColor = g1e;
  dd("ColPickSli1: "+g1b+" -> "+g1e);

  var g2b = packToHTMLColor([this.mRGBValue[0], 0, this.mRGBValue[2]]);
  var g2e = packToHTMLColor([this.mRGBValue[0], 255, this.mRGBValue[2]]);
  this.mColSli2.startColor = g2b;
  this.mColSli2.endColor = g2e;
  dd("ColPickSli2: "+g2b+" -> "+g2e);

  var g3b = packToHTMLColor([this.mRGBValue[0], this.mRGBValue[1], 0]);
  var g3e = packToHTMLColor([this.mRGBValue[0], this.mRGBValue[1], 255]);
  this.mColSli3.startColor = g3b;
  this.mColSli3.endColor = g3e;
  dd("ColPickSli3: "+g3b+" -> "+g3e);
}

ColorPicker.prototype.setupHueColsli = function(aSat, aBri)
{
  var rgb;
  rgb = convHSB2RGB([0, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_0", packToHTMLColor(rgb));
  this.mColSli1.setHueGrad("grad_360", packToHTMLColor(rgb));
  rgb = convHSB2RGB([60, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_60", packToHTMLColor(rgb));
  rgb = convHSB2RGB([120, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_120", packToHTMLColor(rgb));
  rgb = convHSB2RGB([180, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_180", packToHTMLColor(rgb));
  rgb = convHSB2RGB([240, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_240", packToHTMLColor(rgb));
  rgb = convHSB2RGB([300, aSat, aBri]);
  this.mColSli1.setHueGrad("grad_300", packToHTMLColor(rgb));
}

ColorPicker.prototype.updateHSBGrads = function()
{
  var rgb;

/*
  var g1b = packToHTMLColor([0, this.mRGBValue[1], this.mRGBValue[2]]);
  var g1e = packToHTMLColor([255, this.mRGBValue[1], this.mRGBValue[2]]);
  this.mColSli1.startColor = g1b;
  this.mColSli1.endColor = g1e;
  dd("ColPickSli1: "+g1b+" -> "+g1e);
*/
  this.mColSli1.setHueMode();
  this.setupHueColsli(this.mHSBValue[1], this.mHSBValue[2]);
  
  rgb = convHSB2RGB([this.mHSBValue[0], 0, this.mHSBValue[2]]);
  var g2b = packToHTMLColor(rgb);
  rgb = convHSB2RGB([this.mHSBValue[0], 100, this.mHSBValue[2]]);
  var g2e = packToHTMLColor(rgb);
  this.mColSli2.startColor = g2b;
  this.mColSli2.endColor = g2e;
  dd("ColPickSli2: "+g2b+" -> "+g2e);

  rgb = convHSB2RGB([this.mHSBValue[0], this.mHSBValue[1], 0]);
  var g3b = packToHTMLColor(rgb);
  rgb = convHSB2RGB([this.mHSBValue[0], this.mHSBValue[1], 100]);
  var g3e = packToHTMLColor(rgb);
  this.mColSli3.startColor = g3b;
  this.mColSli3.endColor = g3e;
  dd("ColPickSli3: "+g3b+" -> "+g3e);
}

ColorPicker.prototype.updateThumbs = function()
{
  this.mColSli1.value = this.mRGBValue[0];
  this.mColSli2.value = this.mRGBValue[1];
  this.mColSli3.value = this.mRGBValue[2];
}

ColorPicker.prototype.updateHSBThumbs = function()
{
  this.mColSli1.value = this.mHSBValue[0];
  this.mColSli2.value = this.mHSBValue[1];
  this.mColSli3.value = this.mHSBValue[2];
}

ColorPicker.prototype.updateMain = function()
{
  this.updateColorBox();

  var textv = packToHTMLColor(this.mRGBValue);

  if (this.mMode==MODE_RGB || this.mMode==MODE_PALETTE)
    this.mMainTxtBox.value = textv.toUpperCase();
  else if (this.mMode==MODE_HSB) {
    this.mMainTxtBox.value = "hsb(" + this.mHSBValue[0] + "," + (this.mHSBValue[1]/100.0) + "," + (this.mHSBValue[2]/100.0) + ")";
  }
  else if (this.mMode==MODE_NAMED) {
    this.mMainTxtBox.value = this.mNamedList.selectedItem.value;
  }
  else if (this.mMode==MODE_MOLCOL) {
    this.mMainTxtBox.value = "$molcol";
  }
}

//////////

ColorPicker.prototype.setupRGB = function ()
{
  this.mMode = MODE_RGB;
  this.mColSli1.setLinerMode();
  this.mColSli1.min = 0;
  this.mColSli1.max = 255;
  this.mColSli2.min = 0;
  this.mColSli2.max = 255;
  this.mColSli3.min = 0;
  this.mColSli3.max = 255;

  this.mCmpvBox1.max = 255;
  this.mCmpvBox2.max = 255;
  this.mCmpvBox3.max = 255;

  this.mCmpLab1.value = "R";
  this.mCmpLab2.value = "G";
  this.mCmpLab3.value = "B";

  this.updateGrads();
  this.updateThumbs();
  this.updateRGBText();
}

ColorPicker.prototype.setupHSB = function ()
{
  this.mMode = MODE_HSB;
  this.mColSli1.min = 0;
  this.mColSli1.max = 360;
  this.mColSli2.min = 0;
  this.mColSli2.max = 100;
  this.mColSli3.min = 0;
  this.mColSli3.max = 100;

  this.mCmpvBox1.max = 360;
  this.mCmpvBox2.max = 100;
  this.mCmpvBox3.max = 100;

  this.mCmpLab1.value = "H";
  this.mCmpLab2.value = "S";
  this.mCmpLab3.value = "B";

  this.mHSBValue = convRGB2HSB(this.mRGBValue);
  this.updateHSBGrads();
  this.updateHSBThumbs();
  this.updateHSBText();
}

//////////////////////////

ColorPicker.prototype.setColorText = function(value)
{
  // this.mRGBValue = this.convToRGB(value);
  var color, clsnm;
  try {
    color = this._stylem.compileColor(value, this.mTgtSceID);
    this.mRGBValue = [color.r(), color.g(), color.b()];
    clsnm = color._wrapped.getClassName();
  }
  catch (e) {
    dd("setColorText: invalid color value="+value);
    debug.exception(e);
  }

  if (!this.mRGBValue) {
    dd("ColPicker.setColorText> ERROR !!! : "+value+"\n");
    this.mRGBValue = [0,0,0];
    this.mOrigValue = "#000";
    this.mMainTxtBox.value = "#000";
    this.updateColorBox();
  }
  else {
    this.mOrigValue = value;
    this.mMainTxtBox.value = value;
    this.updateColorBox();
  }

  this.mHSBValue = convRGB2HSB(this.mRGBValue);
  if (this.mMode==MODE_RGB) {
    this.updateGrads();
    this.updateThumbs();
  }
  else if (this.mMode==MODE_HSB) {
    this.updateHSBGrads();
    this.updateHSBThumbs();
  }

  dd("colpicker.js SetColorText: "+clsnm+", value="+color.toString());
  if (clsnm == "NamedColor")
    this.mNamedValue = color.toString();
}

ColorPicker.prototype.setColorObj = function(value)
{
  if (value) {
    var str = value.toString();
    dd("colpicker.js setColorObj: str="+str);
    this.setColorText(str);
  }
  else {
    this.setColorText("");
  }
}

ColorPicker.prototype.getColorObj = function()
{
  var color = this._stylem.compileColor(this.mMainTxtBox.value, this.mTgtSceID);
  if (typeof color == 'undefined' || color===null)
    return null;
  return color;
}

ColorPicker.prototype.getColorText = function()
{
  return this.mMainTxtBox.value;
}

/// Notify changes to the clients
/// aMode==true --> colorpicking is completed
/// aMode==false --> still editing (popup is open)
ColorPicker.prototype.notifyChanged = function(aMode)
{
  if (this.mUpdateFunc)
    this.mUpdateFunc(aMode);

  var changeEvent = document.createEvent("Events");
  changeEvent.initEvent("change", true, true);
  changeEvent.isCompleted = aMode;
  this._outer.dispatchEvent(changeEvent);
}

ColorPicker.prototype.setParentUpdate = function(aFunc)
{
  this.mUpdateFunc = aFunc;
}

//////////
/*
ColorPicker.prototype.hideDetail = function()
{
  this.mSliderGrid.collapsed = true;
  this.mNamedBox.collapsed = true;
  this.mMode = MODE_NONE;
}
*/

ColorPicker.prototype.showRGB = function()
{
  this.setupRGB();
  //this.mSliderGrid.collapsed = false;
  //this.mNamedBox.collapsed = true;

  this.mSliderPopup.openPopup(this.mColorBox, "after_start", 0, 0, false, false);
}

ColorPicker.prototype.showHSB = function()
{
  this.setupHSB();
  //this.mSliderGrid.collapsed = false;
  //this.mNamedBox.collapsed = true;

  this.mSliderPopup.openPopup(this.mColorBox, "after_start", 0, 0, false, false);
}


//////////////////////////
// Named color list Impl.

ColorPicker.prototype.showNamed = function()
{
  this.mNamedPopup.openPopup(this.mColorBox, "after_start", 0, 0, false, false);
  this.setupNamedList();
  //this.mSliderGrid.collapsed = true;
  //this.mNamedBox.collapsed = false;

}

ColorPicker.prototype.setupNamedList = function()
{
  this.mMode = MODE_NAMED;

  //this.mNamedList.removeAllItems();
  while (this.mNamedList.getRowCount()>0)
    this.mNamedList.removeItemAt(0);

  var stylem = cuemol.getService("StyleManager");

  var json, defs;
  if (this.mTgtSceID!=0) {
    json = stylem.getColorDefsJSON(this.mTgtSceID);
    // dd("scene color defs: "+json);
    defs = JSON.parse(json);
    this.appendColorList(defs);
  }

  json = stylem.getColorDefsJSON(0);
  // dd("global color defs: "+json);
  defs = JSON.parse(json);
  this.appendColorList(defs);

  var that = this;
  setTimeout( function () {
    that.updateNamedColorSel();
  }, 0);
  //this.mNamedList.selectedIndex = 1;
}

ColorPicker.prototype.updateNamedColorSel = function ()
{
  this.mNamedList.clearSelection();

  if (this.mNamedValue===null) {
    //this.mNamedList.selectedIndex = 0;
    return;
  }

  var curval = this.mNamedValue;
  var nrows = this.mNamedList.getRowCount();
  var item, itemvalue;
  dd("UpdateNamedColorSel: nrows="+nrows);
  for (var i=0; i<nrows; ++i) {
    item = this.mNamedList.getItemAtIndex(i);
    itemvalue = item.getAttribute("value");
    if (itemvalue == curval) {
      dd("UpdateNamedColorSel: item="+itemvalue+", cur="+curval);
      this.mNamedList.ensureElementIsVisible(item);
      this.mNamedList.selectItem(item);
      return;
    }
  }

  dd("UpdateNamedColorSel: ["+curval+"] is not found!!");
}

ColorPicker.prototype.appendColor = function (aName, aColor)
{
  var strcol = packToHTMLColor([aColor.r(),aColor.g(),aColor.b()]); //this.makeColorStr(aColor);

  var row = document.createElement("listitem");
  var cell = document.createElement("listcell");
  cell.style.backgroundColor = strcol;
  
  row.appendChild(cell);
  
  var cell = document.createElement("listcell");
  cell.setAttribute("label", aName);
  row.appendChild(cell);

  this.mNamedList.appendChild(row);
  row.setAttribute("value", aName);
  return row;
}

ColorPicker.prototype.appendColorList = function (aDefs)
{
  var stylem = cuemol.getService("StyleManager");

  aDefs.forEach(function (e, i) {
    try {
      var color = stylem.getColor(e, this.mTgtSceID);
      this.appendColor(e, color);
    }
    catch (e) {
      dd("exception: "+e);
      debug.exception(e);
    }
  }, this);
}

ColorPicker.prototype.onNamedListSelect = function (aEvent)
{
  var value = this.mNamedList.selectedItem.getAttribute("value");
  dd("NamedList selchanged: item="+this.mNamedList.selectedItem);
  dd("NamedList selchanged: value="+value);

  var rgb = this.convToRGB(value);
  dd("MainTextChanged: "+ value + " -> "+rgb);
  if (!rgb) {
    this.mRGBValue = this.convToRGB(this.mOrigValue);
  }
  else {
    this.mRGBValue = rgb;
    this.mNamedValue = value;
  }

  this.updateMain();
  this.notifyChanged(false);

}

ColorPicker.prototype.onNamedListClicked = function (aEvent)
{
  // popup-hiding event also calls notifyChanged(true)
  this.mNamedPopup.hidePopup();
}

//////////////////////////
// Palette Impl.

ColorPicker.prototype.showPalette = function()
{
  this.mPalettePopup.openPopup(this.mColorBox, "after_start", 0, 0, false, false);
  this.setupPalette();
  //this.mSliderGrid.collapsed = true;
  //this.mNamedBox.collapsed = false;
}

ColorPicker.prototype.setupPalette = function()
{
  try {
    //this.mPaletteBox = this._anonid('colpick_palette_box');
    if (this.mPaletteBox.childNodes.length==0)
      this.buildPaletteBox();
    this.mMode = MODE_PALETTE;
  }
  catch (e) {
    debug.exception(e);
  }
    
}

ColorPicker.prototype.buildPaletteBox = function()
{
  // grayscale entry
  var row = document.createElement("hbox");
  this.appendPaletteCell(row, "#FFF", "White");
  this.appendPaletteCell(row, "rgb(0.75,0.75,0.75)", "75% Gray");
  this.appendPaletteCell(row, "rgb(0.5,0.5,0.5)", "50% Gray");
  this.appendPaletteCell(row, "rgb(0.25,0.25,0.25)", "25% Gray");
  this.appendPaletteCell(row, "#000", "Black");
  this.mPaletteBox.appendChild(row);

  this.appendPaletteRow(0, "Red");
  this.appendPaletteRow(30, "Orange");
  this.appendPaletteRow(60, "Yellow");
  this.appendPaletteRow(120, "Green");
  this.appendPaletteRow(180, "Cyan");
  this.appendPaletteRow(240, "Blue");
  this.appendPaletteRow(300, "Purple");
}

var variations = [[25, 100], [50, 100], [75, 100], [100, 100], [100, 75], [100, 50], [100, 25]];

ColorPicker.prototype.appendPaletteRow = function(aHue, aText)
{
  var row = document.createElement("hbox");

  for (var i=0; i<variations.length; ++i) {
    var sat = variations[i][0];
    var bri = variations[i][1];
    var hsbcol = "hsb("+aHue+", "+(sat/100.0)+", "+(bri/100.0)+")";
    var tooltip = aText;
    if (sat != 100)
      tooltip += (", sat="+sat+"%");
    if (bri != 100)
      tooltip += (", bri="+bri+"%");
    this.appendPaletteCell(row, hsbcol, tooltip);
  }
  
  this.mPaletteBox.appendChild(row);
}

ColorPicker.prototype.appendPaletteCell = function(aRow, aColTxt, aTip)
{
  var cell = document.createElement("spacer");
  cell.className = "colorpickertile";
  cell.style.backgroundColor = packToHTMLColor(this.convToRGB(aColTxt));
  cell.setAttribute("tooltiptext", aTip);
  cell.setAttribute("color", aColTxt);

  aRow.appendChild(cell);
  //dd("Palette color appended: "+aColTxt);
}

ColorPicker.prototype.onPaletteHoverCell = function(aCell)
{
}

ColorPicker.prototype.onPaletteClickCell = function(aCell)
{
  try {
  if (aCell && aCell.hasAttribute("color")) {
    if (this.mSelectedCell)
      this.mSelectedCell.removeAttribute("selected");
    
    this.mSelectedCell = aCell;
    aCell.setAttribute("selected", "true");
    
    var value = aCell.getAttribute("color");
    this.mRGBValue = this.convToRGB(value);
    
    this.updateMain();
    // this.notifyChanged(false);
    // popup-hiding event also calls notifyChanged(true)
    this.mPalettePopup.hidePopup();
  }
  }
  catch (e) {
    debug.exception(e);
  }
}

return ColorPicker;

})();
}

