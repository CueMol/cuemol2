//
//  Dialog for creating new tab (or window)
//

window.gDialog = new Object();

( function () {

  var that = this;
  var args = window.arguments[0];

  addEventListener("load", function() {
    try { that.onLoad(); } catch (e) { debug.exception(e); }
  }, false);

  this.onLoad = function()
  {
    this.mScNameText = document.getElementById('Scene_Name');
    this.mVwNameText = document.getElementById('View_Name');

    var strbundle = document.getElementById("strings");

    document.getElementById("New_Scene").label =
      strbundle.getString("newTabWindow_radioNewSce");

    document.getElementById("New_View").label =
      strbundle.getFormattedString("newTabWindow_radioNewViw", [args.cursc.name]);

    var descr;
    if (args.bWin) {
      descr = strbundle.getString("newTabWindow_descrNewWin");
      //document.getElementById('descrw').hidden = false;
    }
    else {
      descr = strbundle.getString("newTabWindow_descrNewTab");
    }
    document.getElementById("descr").value = descr;
    //document.getElementById("New_Tab").title = descr;

    var scname = util.makeUniqName(
      strbundle, "cuemol2_defaultSceneName",
      function (a) {return cuemol.sceMgr.getSceneByName(a);} );
    this.mScNameText.value = scname;

    var vwname = util.makeUniqName(
      strbundle, "cuemol2_defaultViewName",
      function (a) {return args.cursc.getViewByName(a);} );
    this.mVwNameText.value = vwname;
  }

  this.onRadioCmd = function (aEvent)
  {
    var id = aEvent.target.id;
    if (id=="New_Scene") {
      this.mScNameText.disabled = false;
      this.mVwNameText.disabled = true;
    }
    else {
      this.mScNameText.disabled = true;
      this.mVwNameText.disabled = false;
    }
  }

  this.onOK = function ()
  {
    if (document.getElementById('New_Scene').selected) {
      args.name = this.mScNameText.value;
      args.bView = false;
    }
    else if (document.getElementById('New_View').selected) {
      args.name = this.mVwNameText.value;
      args.bView = true;
    }
    args.bInhr = document.getElementById('View_Inhr').checked;

    args.ok = true;
  }

}.apply(window.gDialog) );

