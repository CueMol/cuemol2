// -*-Mode: C++;-*-
//
// File-open option tabbeddialog
//
// $Id: fopen-option-dlg.js,v 1.4 2010/12/02 06:58:01 rishitani Exp $
//

var FopenOptionDlg;

( function () {

// constructor
FopenOptionDlg = function (aData)
{
  this.mData = aData; //window.arguments[0];
  this.mData.ondlgok = new Array();
}

var cls = FopenOptionDlg.prototype;

cls.onDialogAccept = function(event)
{
  try {
    // notify dialogaccept to the renderer option page
    if (!window.gRenderOptPage.onDialogAccept(event))
      return false;
  
    // other pages cannot prevent the accept event
    var i, nfuncs = this.mData.ondlgok.length;
    for (i=0; i<nfuncs; ++i)
      (this.mData.ondlgok[i])(event);
    
    dd("FopenOptDlg accept dialog OK.");
    return true;
  }
  catch (e) {
    debug.exception(e);
  }
}

cls.removeElement = function (aId)
{
  var elem = document.getElementById(aId);
  var par = elem.parentNode;
  par.removeChild(elem);
}

cls.selectShowTab = function (aTgtName, aRdrName)
{
  var tab_id = aRdrName + "_options_tab";
  var tabpanel_id = aRdrName + "_options_tabpanel";

  if (aTgtName !== aRdrName) {
    this.removeElement(tab_id);
    this.removeElement(tabpanel_id);
    return false;
  }
  else {
    document.getElementById(tab_id).removeAttribute("hidden");
    document.getElementById(tabpanel_id).removeAttribute("hidden");
    return true;
  }
}

} )();

window.gDlgObj = new FopenOptionDlg(window.arguments[0]);

