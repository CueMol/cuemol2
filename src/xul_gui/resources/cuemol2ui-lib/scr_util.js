//
// scripting utility routines
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");

exports.getObj = function (aName) {
    let sceMgr = cuemol.getService("SceneManager");
    let scene = sceMgr.getScene(sceMgr.activeSceneID);
    let mol = scene.getObjectByName(aName);
    return mol;
};

exports.getRend = function (aRendName) {
  let sceMgr = cuemol.getService("SceneManager");
  let scene = sceMgr.getScene(sceMgr.activeSceneID);
  let rend = scene.getRendByName(aRendName);
  return rend;
};

exports.removeRend = function (aRendName, aUseTxn) {
  let sceMgr = cuemol.getService("SceneManager");
  let scene = sceMgr.getScene(sceMgr.activeSceneID);
  let rend = exports.getRend(aRendName);

  if (rend!=null) {
    let obj = rend.getClientObj();
    if (aUseTxn) {
      scene.startUndoTxn("Delete renderer:"+ aRendName);
      var ok;
      try {
	ok = obj.destroyRenderer(rend.uid);
      }
      catch (e) {
	debug.exception(e);
	scene.rollbackUndoTxn();
	return;
      }
      scene.commitUndoTxn();
    }
    else {
      ok = obj.destroyRenderer(rend.uid);
    }
  }
};

exports.vec = function (aX, aY, aZ) {
    let v = cuemol.createObj("Vector");
    if (aX!==undefined)
	v.x = aX;
    if (aY!==undefined)
	v.y = aY;
    if (aZ!==undefined)
	v.z = aZ;
    return v;
};

exports.sel = function (aSelStr, aCtxtID) {
    let selobj = cuemol.createObj("SelCommand");
    if (aCtxtID==undefined)
	selobj.compile(aSelStr, 0);
    else
	selobj.compile(aSelStr, aCtxtID);

    return selobj;
}

exports.toDegree = function (aRad) {
    return aRad*180/Math.PI;
};

exports.toRadian = function (aDeg) {
    return aDeg*Math.PI/180;
};

exports.txn = function (aScene, aMsg, aFunc) {
  // // EDIT TXN START //
  aScene.startUndoTxn(aMsg);
  try {
    aFunc();
  }
  catch (e) {
    debug.exception(e);
    aScene.rollbackUndoTxn();
    return false;
  }
  aScene.commitUndoTxn();
  // EDIT TXN END //

  return true;
};

exports.filePicker = function (aWindow, aExt, aDesc)
{
  const nsIFilePicker = Ci.nsIFilePicker;
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

  fp.init(aWindow, "Select a File", nsIFilePicker.modeOpen);

  if (aExt && aDesc) {
    fp.appendFilter(aDesc, aExt);
  }

  let res = fp.show();
  if (res!=nsIFilePicker.returnOK) {
    return null;
  }

  return fp.file.path;
};

exports.rendPicker = function (aWindow, aMsg, aRegExp)
{
  const util = require("util");

  let sceMgr = cuemol.getService("SceneManager");
  let scene = sceMgr.getScene(sceMgr.activeSceneID);

  let tgtid = util.doSelectObjPrompt(aWindow, scene, aMsg,
  function (type, elem) {
    if (type!="renderer")
      return null;
    if (!elem.type.match(aRegExp))
      return null;
    return elem.name + " (" + elem.type + ", id="+elem.ID+")";
  });

  return sceMgr.getRenderer(tgtid);
};

exports.objPicker = function (aWindow, aMsg, aRegExp)
{
  const util = require("util");

  let sceMgr = cuemol.getService("SceneManager");
  let scene = sceMgr.getScene(sceMgr.activeSceneID);

  let tgtid = util.doSelectObjPrompt(aWindow, scene, aMsg,
  function (type, elem) {
    if (type!="object")
      return null;
    if (!elem.type.match(aRegExp))
      return null;
    return elem.name + " (" + elem.type + ", id="+elem.ID+")";
  });

  return sceMgr.getObject(tgtid);
};

