//
//
//

dump("########## cuemol.js loading ... ##########\n");

const {Cc,Ci,Cu,Cr} = require("chrome");
var debug = require("debug_util");
var util = require("util");
var tbk = require("traceback");

var dd = debug.dd;

const XPCCUEMOL_CID = "@cuemol.org/XPCCueMol";

var xpc = exports.xpc = Cc[XPCCUEMOL_CID].getService(Ci.qICueMol);

var wr_classes = new Object();

var dummy = {
  utils: {}
};

function getWrapperCtor(class_name)
{
  var wrClassName = "wrapper_" + class_name;
  var ctor;

  if (wrClassName in wr_classes) {
    //dd("NEW using loaded: "+filenm);
    ctor = wr_classes[wrClassName];
  }
  else {
    // wrapper class is not loaded
    // filenm = "resource://app/resources/cuemol-wrappers/"+class_name+".js";
    filenm = "resource://gre/cuemol-wrappers/"+class_name+".js";
    dd("NEW Loading: "+filenm);
    Cu.import(filenm, wr_classes);
    ctor = wr_classes[wrClassName];
  }

  return ctor;
};

const convPolymObj =
exports.convPolymObj =
dummy.utils.convPolymObj =
function convPolymObj(aWrapped)
{
  //dd("cuemol(module).convPolymObj called.");

  if (typeof(aWrapped) === 'undefined') return null;

  var clsnm, wrclsnm, filenm;
  try {
    clsnm = aWrapped.getClassName();
    var ctor = getWrapperCtor(clsnm);
    var obj = new ctor (aWrapped, dummy);
    if (debug.isdebug()) {
      // set debug message (stack frame info)
      aWrapped.setDbgMsg( tbk.format() );
    }
    return obj;
  }
  catch(e) {
    debug.exception(e);
    dd("ERROR: Argument of convPolymObj("+aWrapped+") is not a XPCCueMol object: "+e+"\n");
    return null;
  }

};

exports.implIface = function (aClassName, aIfName)
{
  var key = "@implements_"+aIfName;
  try {
    var ctor = getWrapperCtor(aClassName);
    if (key in ctor)
      return true;
    else
      return false;
  }
  catch(e) {
    debug.exception(e);
    dd("ERROR: implementsIface\n");
    return false;
  }
};

exports.implIface2 = function (aObj, aIfName)
{
  if (typeof(aObj)!=='object') return false;
  if (typeof(aObj._wrapped)!=='object') return false;
  if (typeof(aObj._wrapped.getClassName)!=='function') return false;

  var clsnm = aObj._wrapped.getClassName();
  return exports.implIface(clsnm, aIfName);
};

exports.getErrMsg = function ()
{
  return xpc.getErrMsg();
};

exports.hasClass = function (name)
{
  if (!xpc.isInitialized())
    return null;
  return xpc.hasClass(name);
};

exports.getService = function (name)
{
  if (!xpc.isInitialized())
    return null;
  var obj = xpc.getService(name);
  return convPolymObj(obj);
};

exports.createObj = function (name, strrep)
{
  if (!xpc.isInitialized())
    return null;

  var obj;
  if (strrep)
    obj = xpc.createFromString(name, strrep);
  else
    obj = xpc.createObj(name);

  return convPolymObj(obj);
};

exports.__defineGetter__("sceMgr", function() {
  if (!xpc.isInitialized())
    return null;
  if (this._sceMgr==null)
    this._sceMgr = exports.getService("SceneManager");
  return this._sceMgr;
});

exports.getUIDObj = function (aObjID)
{
  return exports.sceMgr.getUIDObj(aObjID);
};

exports.getObject = function (aObjID)
{
  return exports.sceMgr.getObject(aObjID);
};

exports.getScene = function (aID)
{
  return exports.sceMgr.getScene(aID);
};

exports.getRenderer = function (aID)
{
  return exports.sceMgr.getRenderer(aID);
};

exports.getView = function (aID)
{
  return exports.sceMgr.getView(aID);
};

exports.getRendNameList = function (aObj)
{
  var nnams = arguments.length;
  var rendary = util.toIntArray( aObj.rend_uids );
  var nrends = rendary.length;
  var res = new Array();

  for (var j=0; j<nrends; ++j) {
    var rend_id = rendary[j];
    var rend = aObj.getRenderer(rend_id);
    var badd = false;
    for (var i=1; i<nnams; ++i) {
      if (rend.type_name==arguments[i]) {
	badd = true;
	break;
      }
    }

    if (badd) {
      //dd("*** match rend: "+rend.name);
      res.push(rend.name);
    }
  }

  return res;
};

///////////////////////////////////////////////
// helper methods

exports.makeSel = function(selstr, uid)
{
  var sel = exports.createObj("SelCommand");

  if (selstr) {
    if (uid) {
      if (!sel.compile(selstr, uid))
	return null;
    }
    else {
      if (!sel.compile(selstr, 0))
	return null;
    }
  }

  return sel;
};

exports.makeColor = function(str, uid)
{
  var stylem = exports.getService("StyleManager");
  var color = null;
  if (uid) {
    color = stylem.compileColor(str, uid);
  }
  else {
    color = stylem.compileColor(str, 0);
  }

  return color;
};

exports.resetProp = function (obj, propname)
{
  obj._wrapped.resetProp(propname);
};

exports.setProp = function (obj, propname, value)
{
  if (typeof(value)==='object' &&
      typeof(value._wrapped)==='object' &&
      typeof(value._wrapped.getClassName)==='function') {
    obj._wrapped.setProp(propname, value._wrapped);
  }
  else {
    obj._wrapped.setProp(propname, value);
  }
};

exports.hasProp = function (obj, propname)
{
  return obj._wrapped.hasProp(propname);
};

exports.getClassName = function (obj)
{
  return obj._wrapped.getClassName();
};

exports.instanceOf = function (obj, ifname)
{
  return obj._wrapped.instanceOf(ifname);
};


exports.println = 
exports.putLogMsg = function (msg)
{
  var logMgr = exports.getService("MsgLog");
  logMgr.writeln(msg);
};

//dump("########## cuemol.js loaded ##########\n");

