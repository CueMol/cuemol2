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

