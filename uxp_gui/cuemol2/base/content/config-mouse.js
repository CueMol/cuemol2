//
// Mouse configuration impl
//

window.gMouseConfPane = new Object();

( function () {

var util = require("util");
var styleutil = require("styleutil");

var that = this;

addEventListener("unload", function() {that.fini();}, false);

addEventListener("dialogaccept", function() {
  try { that.onDialogAccept(); } catch (e) { debug.exception(e); }
}, false);

this.init = function ()
{
  try { 
    // populate the mouse preset menulist
    this.mMouseList = document.getElementById("mousebind-styles");
    util.populateStyleMenus(document, null, this.mMouseList.menupopup,
			    "", /ViewInConf$/);

    var vic = cuemol.getService("ViewInputConfig");
    dd("ViewInputConfig style="+vic.style);
    util.selectMenuListByValue(this.mMouseList, vic.style.split(/[,\s]/));

    this.mTbRadBox = document.getElementById("mouse-tbrad");
    this.mTbRadBox.value = vic.tbrad;
    
    this.mHitPrecBox = document.getElementById("mouse-hitprec");
    this.mHitPrecBox.value = vic.hitprec;
    dd("HitPrec value=" + vic.hitprec);

  } catch (e) { debug.exception(e); }
};

this.fini = function ()
{
};

const pref = require("preferences-service");

this.onDialogAccept = function ()
{
  var vic = cuemol.getService("ViewInputConfig");
  var stylem = cuemol.getService("StyleManager");

  var newval;

  var curstyle = vic.style;
  newval = this.mMouseList.selectedItem.value;
  if (!styleutil.contains(curstyle, newval)) {
    curstyle = styleutil.remove(curstyle, /ViewInConf$/);
    curstyle = styleutil.unshift(curstyle, newval);
    dd("New VIC style = " + curstyle);
    vic.style = curstyle;
    pref.set("cuemol2.ui.viewinconf", newval)
  }

  newval = parseFloat(this.mTbRadBox.value);
  if (newval!=NaN && newval>0.0 &&
      Math.abs(vic.tbrad-newval)>0.01) {
    vic.tbrad = newval;
    stylem.setStyleValue(0, "user", "UserViewConf.tbrad", newval.toString());
  }

  newval = parseFloat(this.mHitPrecBox.value);
  if (newval!=NaN && newval>0.0 &&
      Math.abs(vic.hitprec-newval)>0.01) {
    vic.hitprec = newval;
    stylem.setStyleValue(0, "user", "UserViewConf.hitprec", hitprec.toString());
  }

  require("native-widget").updateNatWins();
};

}.apply(window.gMouseConfPane) );

