//
// Mol surf cutting tool
// $Id: surf-cutbyplane.js,v 1.2 2011/04/29 14:52:08 rishitani Exp $
//

( function () { try {

  ///////////////////////////
  // Initialization
  
  const util = require("util");
  
  var dlg = window.gDlgObj = new Object();

  dlg.mTgtSceID = window.arguments[0];
  dlg.mTgtViewID = window.arguments[1];
  dd("CBPDlg> TargetScene="+dlg.mTgtSceID);

  dlg.mObjBox = new cuemolui.ObjMenuList(
    "surf-select-box", window,
    function (elem) {
      if (elem.type=="MolSurfObj") return true;
      return false;
    },
    cuemol.evtMgr.SEM_OBJECT);
  dlg.mObjBox._tgtSceID = dlg.mTgtSceID;
  
  window.addEventListener("load", function(){
    try {dlg.onLoad();} catch (e) {debug.exception(e);}
  }, false);
  
  /////////////////////////////////////////////////////////////////////////////////
  // Event Methods

  dlg.onLoad = function ()
  {
    var that = this;
    
    /*
    this.mObjBox.addSelChanged(function(aEvent) {
      try { that.onObjBoxChanged(aEvent);}
      catch (e) { debug.exception(e); }
    });
     */

    var nobjs = this.mObjBox.getItemCount();
    
    //alert("item count="+nobjs);
    if (nobjs==0) {
      // no mol obj to calc --> disable OK button
      document.documentElement.getButton("accept").disabled = true;
    }

  };
  
  /*
  dlg.onObjBoxChanged = function (aEvent)
  {
    dd("CBPDlg> ObjSelChg: "+aEvent.target.id);
    var mol = this.mObjBox.getSelectedObj();
    if (mol) {
    }
  };
*/
  
  dlg.onDialogAccept = function ()
  {
    var view = cuemol.getView(this.mTgtViewID);
    var scene = cuemol.getScene(this.mTgtSceID);

    //if (!document.getElementById("make-sect-mesh").checked)
    //bnosec = true;

    var cden = parseFloat(document.getElementById("sect-mesh-den").value);
    if (cden==NaN || cden<0.1)
      cden = 5.0;

    var tgtobj = this.mObjBox.getSelectedObj();
    if (tgtobj==null) {
      dd("target surf is null!!")
      return false;
    }

    var vcen = view.center;
    var sd = view.slab;
    var rotmat = view.rotation.conjugate().toMatrix();

    var norm = cuemol.createObj("Vector");
    norm.set4(0,0,1,0);
    dd("norm0="+norm);
    norm = rotmat.mulvec(norm);
    dd("norm1="+norm);

    vcen = vcen.add( norm.scale(sd/2.0) );
    norm = norm.scale(-1.0);
    dd("norm2="+norm);

    var bbody = true;
    var bsect = true;
    var mode = document.getElementById("cuttype-list").selectedItem.value;
    switch (mode) {
    case "full":
    case "separate":
      break;
    case "sect":
      bbody = false;
      bsect = true;
      break;
    case "body":
      bbody = true;
      bsect = false;
      break;
    }

    // create section obj in the separate mode
    var sectobj;
    if (mode=="separate") {
      let strMgr = cuemol.getService("StreamManager");
      let xmldat = strMgr.toXML(tgtobj);
      sectobj = strMgr.fromXML(xmldat, scene.uid);
      let name = tgtobj.name;
      sectobj.name = util.makeUniqName2(
	function (a) {return "sect"+a+"_"+name; },
	function (a) {return scene.getObjectByName(a);} );
    }

    // EDIT TXN START //
    scene.startUndoTxn("Cut surface by plane");
    try {
      if (mode=="separate") {
	scene.addObject(sectobj);
	sectobj.cutByPlane2(cden, norm, vcen, false, true);
	tgtobj.cutByPlane2(cden, norm, vcen, true, false);
      }
      else {
	tgtobj.cutByPlane2(cden, norm, vcen, bbody, bsect);
      }
    }
    catch (e) {
      debug.exception(e);
      scene.rollbackUndoTxn();
      util.alert(window, "Cut surface failed: see log window!!");
      return;
    }
    scene.commitUndoTxn();
    // EDIT TXN END //
  }

} catch (e) {debug.exception(e);} } )();

