//
// atom picker utility
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");

var gFun = null;

exports.setHandler = function (aFun)
{
  gFun = aFun;
};

exports.getHandler = function ()
{
  return gFun;
};

