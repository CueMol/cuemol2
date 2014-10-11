//
//
//

const ndetail_max = 5;

Qm2Main.prototype.writeLwScene = function (sc, view, path)
{
  //alert("writeLwScene");
  let qslopt = new Object();
  qslopt.ok = false;

  window.openDialog("chrome://cuemol2/content/exportqsl-opt-dlg.xul",
		    "QSL options",
		    "chrome,modal,resizable=yes,dependent,centerscreen",
		    qslopt);
  if (!qslopt.ok) {
    dd("option dialog canceled");
    //delete qslopt;
    qslopt = null;
    return;
  }
  
  dd("SaveQSL detail="+qslopt.ndetail);
  dd("SaveQSL open="+qslopt.open);
  dd("SaveQSL compr="+qslopt.compress);

  ////////////////

  var newsc;
  // var svc;
  var scene;
  //var view;

  try {
    newsc = cuemol.sceMgr.createScene();
    scene = gQm2Main.mMainWnd.currentScene;
    //var view = gQm2Main.mMainWnd.currentView;
  }
  catch (e) {
    debug.exception(e);
    return;
  }

  if (qslopt.ndetail<0) {
    this.writeQslImpl(scene, newsc, qslopt, path);
  }
  else {
    let json_str = scene.getObjectTreeJSON();
    let data;
    try {
      data = JSON.parse(json_str);
    }
    catch (e) {
      dd("error : "+json_str);
      require("debug_util").exception(e);
      return;
    }

    try {
      scene.startUndoTxn("Change props temporary");

      let i, nlen = data.length;
      for (i=1; i<nlen; ++i) {
	elem = data[i];
	let j, njlen = elem.rends.length;
	if (elem.rends && elem.rends.length>0) {
	  for (j=0; j<njlen; ++j) {
	    let rend = elem.rends[j];
	    let prend = cuemol.getRenderer(rend.ID);
	    this.setRendDetail(elem, prend, qslopt.ndetail);
	  }
	}
      }
    }
    catch (e) {
      debug.exception(e);
      scene.rollbackUndoTxn();
      return;
    }

    this.writeQslImpl(scene, newsc, qslopt, path);

    // always rollback the tmp-detail-chg txn
    scene.rollbackUndoTxn();
  }
  
  if (qslopt.open) {
    // reveal the new qsl scene in the new molview tab
    this.openSceneImpl(path);
  }
};

Qm2Main.prototype.writeQslImpl = function (scene, newsc, qslopt, path)
{
  try {
    var svc = cuemol.getService('LWViewerManager');
    svc.convToLWScene(scene, newsc);

    let qsc_io = require("qsc-io");
    let option = new Object;
    if (qslopt.compress)
      option.compress = "gzip";
    else
      option.compress = "none";

    try {
      qsc_io.writeSceneFile(newsc, path, null, option);
    }
    catch (e) {
      util.alert(window, "ERROR, Write scene failed: "+e);
    }

    // remove temporary scene
    cuemol.sceMgr.destroyScene(newsc.getUID());
  }
  catch (e) {
    debug.exception(e);
  }
};

function makeDetLev(nlow, nhi, nval)
{
  var ndiv = (nhi-nlow)/(ndetail_max-1.0);
  return nlow + ndiv*(nval-1);
};

Qm2Main.prototype.setRendDetail = function (obj, rend, ndet)
{
  var type_name = rend.type_name;
  var json = rend._wrapped.getPropsJSON();
  var props;
  //dd("json: "+json);
  dd("SetRendDetail called ndet="+ndet);

  try {
    props = JSON.parse(json);
  }
  catch (e) {
    dd("GenPropEdit.onLoad> Error !! " + e + " in JSON parse");
    debug.exception(e);
    return;
  }

  // recursively check the all properties
  ( function (objdata, parname) {
    for (var i=0; i<objdata.length; ++i) {
      var elem = objdata[i];
      var dotname;
      if (parname)
        dotname = parname+"."+elem.name;
      else
        dotname = elem.name;

      // dd("prop: "+dotname);

      if (typeof elem.value=='object') {
	arguments.callee(elem.value, dotname);
	continue;
      }
      if (elem.readonly)
	continue;
      
      if (type_name==="dsurface") {
	if (elem.name==="detail") {
	  rend._wrapped.setProp(dotname, makeDetLev(1, 11, ndet));
	  continue;
	}
      }

      if (type_name==="cartoon") {
	if (dotname==="helix.detail") {
	  rend._wrapped.setProp(dotname, makeDetLev(8, 24, ndet));
	  continue;
	}
	else if (dotname==="sheet.detail") {
	  rend._wrapped.setProp(dotname, makeDetLev(2, 8, ndet));
	  continue;
	}
      }

      if (type_name==="cpk"||type_name==="ballstick") {
	if (elem.name==="detail") {
	  rend._wrapped.setProp(dotname, makeDetLev(3, 16, ndet));
	  continue;
	}
      }

      if (type_name==="nucl") {
	if (elem.name==="base_detail") {
	  rend._wrapped.setProp(dotname, makeDetLev(3, 16, ndet));
	  continue;
	}
      }

      if (elem.name==="detail") {
	dd("!! DETAIL: "+dotname);
	rend._wrapped.setProp(dotname, makeDetLev(4, 16, ndet));
      }
      else if (elem.name==="axialdetail") {
	dd("!! AXDETAIL: "+dotname);
	rend._wrapped.setProp(dotname, makeDetLev(2, 8, ndet));
      }

    }
  } ) (props);

  dd("SetRendDetail END");
};


