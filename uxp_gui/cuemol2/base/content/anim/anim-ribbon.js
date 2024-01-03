//
// Animation UI toolribbon
//

if (!("AnimUIToolRibbon" in cuemolui)) {

  const timers = require("timers");

  const slider_base = 100;

  cuemolui.AnimUIToolRibbon = ( function() {

    // constructor
    var ctor = function (aIdBase)
    {
      this.mParent = null;
      this.name = aIdBase;
      this.mTabId = aIdBase+"-ribbon-tab";
      this.mTabPanelId = aIdBase+"-ribbon-tabpanel";

      // attach to the load/unload event for the target document/window
      var that = this;
      window.addEventListener("load", function(){that.onLoad();}, false);
      // aWindow.addEventListener("unload", function() {that.onUnLoad();}, false);

      this.mTimerID = null;
    };

    var klass = ctor.prototype;

    //////

    // private initialization routine
    klass.onLoad = function ()
    {
      var that = this;

      this.mBtnPlayPause = document.getElementById("animui-play-pause");
      this.mBtnPlayPause.addEventListener(
	"command", function (a) { that.onPlayPause(a); }, false);

      this.mBtnStop = document.getElementById("animui-stop");
      this.mBtnStop.addEventListener(
	"command", function (a) { that.onStop(a); }, false);

      this.mLoop = document.getElementById("animui-chkloop");
      this.mLoop.addEventListener(
	"command", function (a) { that.onCmdLoop(a); }, false);

      this.mLabEMin = document.getElementById("animui-cur-min");
      this.mLabESec = document.getElementById("animui-cur-sec");
      this.mLabTMin = document.getElementById("animui-total-min");
      this.mLabTSec = document.getElementById("animui-total-sec");

      this.mSlider = document.getElementById("animui-scale");
      this.mSlider.addEventListener(
	"dragStateChange", function (a) { try {that.onSliChg(a)} catch(e) {debug.exception(e)} }, false);

    };

    klass.onActivated = function ()
    {
      dd("AnimUI Tool activated");
      this.updateUI();
    };

    klass.onInactivated = function ()
    {
      this.mTgtView = null;
      this.mAnimMgr = null;
      timers.clearInterval(this.mTimerID);
      this.mTimerID = null;
    };

    klass.onPlayPause = function (aEvent)
    {
      let scn = cuemol.getScene(this.mParent.mTgtSceneID);
      let am = scn.getAnimMgr();
      if (this.mBtnPlayPause.getAttribute("state")=="play") {
	try {
	  am.start(this.mParent.getTgtView());
	}
	catch (e) {
	  util.alert(window, "Cannot start animation: "+e);
	}

	{
	  let that = this;
	  this.mTimerID = timers.setInterval( function () { that.onTimer(); }, 1000);
	}
      }
      else {
	am.pause();
      }

      this.updateUI();
    };

    klass.onStop = function (aEvent)
    {
      let scn = cuemol.getScene(this.mParent.mTgtSceneID);
      let am = scn.getAnimMgr();
      am.stop();
      this.updateUI();
    };

    klass.onCmdLoop = function (aEvent)
    {
      let scn = cuemol.getScene(this.mParent.mTgtSceneID);
      let am = scn.getAnimMgr();
      am.loop = aEvent.target.checked;
      // this.updateUI();
    };

    klass.onSliChg = function (aEvent)
    {
      dd("isDrag "+aEvent.isDragging);
      if (aEvent.isDragging)
	return;
      
      let scn = cuemol.getScene(this.mParent.mTgtSceneID);
      let am = scn.getAnimMgr();
      let value = this.mSlider.value * slider_base;
      dd("Slider chg value="+value);
      let tv = cuemol.createObj("TimeValue");
      // tv.intval = value;
      tv.millisec = value;
      dd("Slider chg TV="+tv);
      am.goTime(tv, this.mParent.getTgtView());
      this.updateUI();
    };

    klass.onTimer = function ()
    {
      dd("*** AnimUIToolRibbon.onTimer() called");

      this.updateUI();
    };

    klass.updateUI = function ()
    {
      let scn = cuemol.getScene(this.mParent.mTgtSceneID);
      let am = scn.getAnimMgr();

      let total = am.length;
      this.mLabTSec.value = total.getSecond(true);
      this.mLabTMin.value = total.getMinute(false);

      this.mBtnStop.disabled = true;

      if (am.size==0) {
	this.mBtnPlayPause.disabled = true;
	this.mLabESec.value = 0;
	this.mLabEMin.value = 0;
	this.mSlider.disabled = true;
	this.mLoop.disabled = true;
	return;
      }

      this.mBtnPlayPause.disabled = false;
      this.mSlider.disabled = false;
      this.mSlider.min = 0;
      this.mSlider.max = total.getMilliSec(false)/slider_base;
      this.mLoop.disabled = false;
      this.mLoop.checked = am.loop;

      let playst = am.playState;
      //dd("elapsed=" + am.elapsed);
      //dd("playState=" + playst);

      if (playst=="stop" || playst=="pause") {
	timers.clearInterval(this.mTimerID);
	this.mBtnPlayPause.setAttribute("state", "play");
	this.mBtnPlayPause.setAttribute("label", "Play");
	if (playst=="pause") {
	  this.mBtnStop.disabled = false;
	}
      }
      else {
	this.mBtnPlayPause.setAttribute("state", "pause");
	this.mBtnPlayPause.setAttribute("label", "Pause");
	this.mBtnStop.disabled = false;
      }
      
      let elapsed = am.elapsed;
      this.mLabESec.value = elapsed.getSecond(true);
      this.mLabEMin.value = elapsed.getMinute(false);
      this.mSlider.value = elapsed.getMilliSec(false)/slider_base;
    };

    klass.onCtxtMenu = function (aEvent)
    {
      let navi = this.mParent.getTool("navigate");
      if (navi)
	navi.onCtxtMenu(aEvent);
    }
    
    klass.onMouseClicked = function (x, y, mod)
    {
      // dd("AnimUI: mouse clicked");
      let navi = this.mParent.getTool("navigate");
      if (navi)
	navi.onMouseClicked(x, y, mod);
    }
    
    return ctor;
    
  } )();

} // Class AnimUIToolRibbon

////////////////////////////////////////////////////////////////////////////

cuemolui.onAnimRender = function ()
{
  var stylestr = "chrome,resizable=yes,dependent,centerscreen";

  var scene_id = gQm2Main.mMainWnd.getCurrentSceneID();
  var win = gQm2Main.mWinMed.getMostRecentWindow("CueMol2:AnimRenderDlg");
  if (win) {
    win.focus();
  }
  else
    window.openDialog("chrome://cuemol2/content/anim/anim-render-dlg.xul", "",
		      stylestr, scene_id);
  
};

