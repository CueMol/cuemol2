// -*-Mode: C++;-*-
//
// $Id: config-dialog.js,v 1.7 2011/04/17 07:18:58 rishitani Exp $
//

window.gDialog = new Object();

( function () {

var that = this;
//var args = window.arguments[0].QueryInterface(Ci.xpcIJSWeakReference).get(); 
var cur_fontname;
var cur_fontsize;
var cur_color;
var cur_fontstyle;
var cur_fontwgt;
var cur_uilang = "en-US";

const pref = require("preferences-service");

// addEventListener("load", function() {
//   try { that.init(); } catch (e) { debug.exception(e); }
// }, false);

addEventListener("unload", function() {that.fini();}, false);

addEventListener("dialogaccept",
                 function() {
                   try { that.onDialogAccept(); }
                   catch (e) { debug.exception(e);} 
                 }, false);

this.stylem = cuemol.getService("StyleManager");

this.init = function ()
{
  cur_fontname = this.stylem.getStyleValue(0, "", "DefaultLabel.font_name");
  cur_fontsize = this.stylem.getStyleValue(0, "", "DefaultLabel.font_size");
  cur_color = this.stylem.getStyleValue(0, "", "DefaultLabel.color");

  cur_fontstyle = this.stylem.getStyleValue(0, "", "DefaultLabel.font_style");
  cur_fontwgt = this.stylem.getStyleValue(0, "", "DefaultLabel.font_weight");

  dd("Current default font-name: "+cur_fontname);
  dd("Current default font-size: "+cur_fontsize);
  dd("Current default color: "+cur_color);
  dd("Current default font-style: "+cur_fontstyle);
  dd("Current default font-wgt: "+cur_fontwgt);

  //////////

  this.mSampleText = document.getElementById("atomlabel-sample");

  //alert("init");
  this.mColPicker = document.getElementById("atomlabel-colpicker");

  if (cur_color)
    this.mColPicker.setColorText(cur_color);

  this.mFontStyleChk = document.getElementById("atomlabel-font-style");
  this.mFontStyleChk.addEventListener("command", function (a) { that.onChgItalic(a) }, false);
  if ( cur_fontstyle=="italic" ||cur_fontstyle=="oblique" )
    this.mFontStyleChk.checked = true;
  else
    this.mFontStyleChk.checked = false;

  this.mFontWgtChk = document.getElementById("atomlabel-font-weight");
  this.mFontWgtChk.addEventListener("command", function (a) { that.onChgBold(a) }, false);
  if ( cur_fontwgt=="bold")
    this.mFontWgtChk.checked = true;
  else
    this.mFontWgtChk.checked = false;

  //////////

  var element = this.mFontList = document.getElementById("atomlabel-fontnames-list");
  FontBuilder.buildFontList(null, null, element);

  var firstnode = element.menupopup.childNodes[0];
  element.menupopup.insertBefore(document.createElement("menuseparator"), firstnode);
  element.insertItemAt(0, "serif", "serif");
  element.insertItemAt(1, "san-serif", "san-serif");
  element.insertItemAt(2, "cursive", "cursive");
  element.insertItemAt(3, "fantasy", "fantasy");
  element.insertItemAt(4, "monospace", "monospace");

  this.mFontList.addEventListener("select", function (a) { that.onSelectFont(a) }, false);

  for (var i=0; i<this.mFontList.itemCount; ++i) {
    var item = this.mFontList.getItemAtIndex(i);
    if (item.value == cur_fontname) {
      this.mFontList.selectedItem = item;
      break;
    }
  }

  //////////

  this.mFontSizeList = document.getElementById("atomlabel-fontsize-list");
  if (cur_fontsize)
    this.mFontSizeList.value = cur_fontsize;

  //////////
  
  this.mUILangList = document.getElementById("uilang-list");
  if (pref.has("general.useragent.locale")) {
    cur_uilang = pref.get("general.useragent.locale");
    this.setUILang(cur_uilang);
  }

  this.mbUseHiDPI = false;
  if (pref.has("cuemol2.ui.view.use_hidpi"))
    this.mbUseHiDPI = pref.get("cuemol2.ui.view.use_hidpi");
}

this.fini = function ()
{
}

this.setUILang = function (lang_value)
{
  var list = this.mUILangList;
  const nlen = list.itemCount;
  for (var i=0; i<nlen; ++i) {
    var elem = list.getItemAtIndex(i);
    if (elem.value==lang_value) {
      list.selectedIndex = i;
      return;
    }
  }
  dd("setUILang: unknown lang value: "+lang_value);
}

this.onDialogAccept = function ()
{
  // alert("DialogAccMisc");

  var new_fontname = this.mFontList.selectedItem.value;
  var new_fontsize = this.mFontSizeList.value;
  var new_color = this.mColPicker.getColorText();

  var new_fontstyle = "normal";
  if (this.mFontStyleChk.checked)
    new_fontstyle = "italic";

  var new_fontwgt = "normal";
  if (this.mFontWgtChk.checked)
    new_fontwgt = "bold";

  dd("New default font-name: "+new_fontname);
  dd("New default font-size: "+new_fontsize);
  dd("New default color: "+new_color);

  if (new_fontname != cur_fontname)
    this.stylem.setStyleValue(0, "user", "DefaultLabel.font_name", new_fontname);
  if (new_fontsize != cur_fontsize)
    this.stylem.setStyleValue(0, "user", "DefaultLabel.font_size", new_fontsize);
  if (new_color != cur_color)
    this.stylem.setStyleValue(0, "user", "DefaultLabel.color", new_color);

  if (new_fontstyle != cur_fontstyle)
    this.stylem.setStyleValue(0, "user", "DefaultLabel.font_style", new_fontstyle);
  if (new_fontwgt != cur_fontwgt)
    this.stylem.setStyleValue(0, "user", "DefaultLabel.font_weight", new_fontwgt);

  this.stylem.firePendingEvents();
  
  //////////
  // UI language
  var new_uilang = this.mUILangList.selectedItem.value;
  dd("selected uilang = "+new_uilang);
  if (new_uilang != cur_uilang)
    pref.set("general.useragent.locale", new_uilang);

  dd("ConfigDlg> mbUseHiDPI="+this.mbUseHiDPI);
  dd("ConfigDlg> pref="+pref.get("cuemol2.ui.view.use_hidpi"));

  var bReloadView = false;
  if (pref.has("cuemol2.ui.view.use_hidpi"))
    if (this.mbUseHiDPI != pref.get("cuemol2.ui.view.use_hidpi"))
      bReloadView = true;

  //args.bViewReload = bReloadView;
  if (bReloadView) {
    // TO DO: reload view impl
  }
  dd( "ConfigDlg> bViewReload=" + bReloadView );
}

this.onSelectFont = function (aEvent)
{
  var name = this.mFontList.selectedItem.value;
  dd("Font selected: "+name);
  this.mSampleText.style.fontFamily = name;
}

this.onChgItalic = function (aEvent)
{
  dd("Font chg italic: "+this.mFontStyleChk.checked);
  if (this.mFontStyleChk.checked)
    this.mSampleText.style.fontStyle = "italic";
  else
    this.mSampleText.style.fontStyle = "normal";
}

this.onChgBold = function (aEvent)
{
  dd("Font chg bold: "+this.mFontWgtChk.checked);
  if (this.mFontWgtChk.checked)
    this.mSampleText.style.fontWeight = "bold";
  else
    this.mSampleText.style.fontWeight = "normal";
}

}.apply(window.gDialog) );

