
//var util = require("util");

const pref = require("preferences-service");
const pref_width_key = "cuemol2.ui.render.lxs-img-width";
const pref_height_key = "cuemol2.ui.render.lxs-img-height";
const pref_haltspp_key = "cuemol2.ui.render.lxs-haltspp";
const pref_bgmode_key = "cuemol2.ui.render.lxs-bgmode";

window.gDlg = {
mDlgData: window.arguments[0],


onLoad: function ()
{
  this.mTextWidth = document.getElementById("text_width");
  this.mTextHeight = document.getElementById("text_height");
  this.mChkReasp = document.getElementById("chk_retainasp");
  this.mHaltSPP = document.getElementById("halt_spp");
  this.mBgModeList = document.getElementById("bg_mode");

  this.mDlgData.faspect = this.mDlgData.width/this.mDlgData.height;
  dd("onLoad faspect = "+this.mDlgData.faspect);

  if (pref.has(pref_width_key)) {
    let val = parseInt( pref.get(pref_width_key) );
    if (!isNaN(val))
      this.mDlgData.width = val;
  }
  if (pref.has(pref_height_key)) {
    let val = parseInt( pref.get(pref_height_key) );
    if (!isNaN(val))
      this.mDlgData.height = val;
  }
  if (pref.has(pref_haltspp_key)) {
    let val = parseInt( pref.get(pref_haltspp_key) );
    if (!isNaN(val))
      this.mDlgData.exporter.haltspp = val;
  }
  if (pref.has(pref_bgmode_key)) {
    try {
      let val = pref.get(pref_bgmode_key);
      this.mDlgData.exporter.bgmode = val;
    }
    catch (e) {
    }
  }

  this.updateWidgets();
},

////////

// dlgdata --> widgets
updateWidgets: function ()
{
  this.mTextWidth.value = this.mDlgData.width;
  this.mTextHeight.value = this.mDlgData.height;
  this.mHaltSPP.value = this.mDlgData.exporter.haltspp;
  util.selectMenuListByValue(this.mBgModeList, this.mDlgData.exporter.bgmode);
},

////////

validateSizeText: function (aEvent)
{
  this.mDlgData.width = parseInt(this.mTextWidth.value);
  this.mDlgData.height = parseInt(this.mTextHeight.value);

  if (this.mChkReasp.checked && aEvent) {
    var id = aEvent.target.id;
    if (id=="text_height")
      this.mDlgData.width = this.mDlgData.height * this.mDlgData.faspect;
    else
      this.mDlgData.height = this.mDlgData.width / this.mDlgData.faspect;
    this.updateWidgets();
  }

  dd("validate, ImageWidth: "+this.mDlgData.width);
  dd("validate, ImageHeight: "+this.mDlgData.height);
},

////////

validateReasp: function ()
{
  this.validateSizeText();
  var elem = this.mChkReasp;
  if (elem.checked) {
    this.mDlgData.width = this.mDlgData.height * this.mDlgData.faspect;
    this.updateWidgets();
  }
  else {
  }
},

////////

onAccept: function ()
{
  try {
    this.validateSizeText();
    this.mDlgData.ok = true;

    this.mDlgData.exporter.width = this.mDlgData.width;
    this.mDlgData.exporter.height = this.mDlgData.height;

    this.mDlgData.exporter.haltspp = parseInt(this.mHaltSPP.value);
    this.mDlgData.exporter.bgmode = this.mBgModeList.value;

    // save preferences
    pref.set(pref_width_key, String(this.mDlgData.width));
    pref.set(pref_height_key, String(this.mDlgData.height));
    pref.set(pref_haltspp_key, this.mHaltSPP.value);
    pref.set(pref_bgmode_key, this.mBgModeList.value);

    return true;
  }
  catch (e) { debug.exception(e); }
},
};
