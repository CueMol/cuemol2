//
// stylesheet related utility routines
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");

exports.getUserDefStyleFname = function ()
{
  let storeFile = Cc["@mozilla.org/file/directory_service;1"].
    getService(Ci.nsIProperties).
      get("ProfD", Ci.nsIFile);

  storeFile.append("user_styles.xml");
  return storeFile.path;
};

exports.contains = function (style_names, name)
{
  var ary = style_names.split(/[,\s]/);
  return ary.some( function (e) { return (e==name); } );
};

exports.remove = function (style_names, re)
{
  var ary = style_names.split(/[,\s]/);
  var newary = ary.filter( function (e) {
    return !re.test(e);
  } );

  return newary.join(",");
};

exports.push = function (style_names, val)
{
  var ary = style_names.split(/[,\s]/);
  ary.push(val);
  return ary.join(",");
};

exports.pop = function (style_names)
{
  var ary = style_names.split(/[,\s]/);
  ary.pop();
  return ary.join(",");
};

exports.unshift = function (style_names, val)
{
  var ary = style_names.split(/[,\s]/);
  ary.unshift(val);
  return ary.join(",");
};

exports.shift = function (style_names)
{
  var ary = style_names.split(/[,\s]/);
  ary.shift();
  return ary.join(",");
};

