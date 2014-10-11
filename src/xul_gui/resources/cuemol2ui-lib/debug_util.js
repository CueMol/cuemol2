/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
*/

const pref = require("preferences-service");

var DEBUG = false;
if (pref.has("cuemol2.debug.enable_dump") &&
    pref.get("cuemol2.debug.enable_dump")) {
  DEBUG = true;
}

var dumpln;
if (DEBUG) {
  dumpln = exports.dumpln = function (str) {dump (str + "\n");}
}
else {
  dumpln = exports.dumpln = function (){};
}


if (DEBUG) {
  var _dd_pfx = "";
  var _dd_singleIndent = "  ";
  var _dd_indentLength = _dd_singleIndent.length;
  var _dd_currentIndent = "";
  var _dd_lastDumpWasOpen = false;
  var _dd_timeStack = new Array();
  var _dd_disableDepth = Number.MAX_VALUE;
  var _dd_currentDepth = 0;
  exports.dd = function _dd (str) {
    if (typeof str != "string") {
      dumpln (str);
    } else if (str[str.length - 1] == "{") {
      ++_dd_currentDepth;
      if (_dd_currentDepth >= _dd_disableDepth)
        return;
      if (str.indexOf("OFF") == 0)
        _dd_disableDepth = _dd_currentDepth;
      _dd_timeStack.push (new Date());
      if (_dd_lastDumpWasOpen)
        dump("\n");
      dump (_dd_pfx + _dd_currentIndent + str);
      _dd_currentIndent += _dd_singleIndent;
      _dd_lastDumpWasOpen = true;
    } else if (str[0] == "}") {
      if (--_dd_currentDepth >= _dd_disableDepth)
        return;
      _dd_disableDepth = Number.MAX_VALUE;
      var sufx = (new Date() - _dd_timeStack.pop()) / 1000 + " sec";
      _dd_currentIndent = 
        _dd_currentIndent.substr (0, _dd_currentIndent.length -
                                  _dd_indentLength);
      if (_dd_lastDumpWasOpen)
        dumpln (str + " " + sufx);
      else
        dumpln (_dd_pfx + _dd_currentIndent + str + " " + sufx);
      _dd_lastDumpWasOpen = false;
    } else {
      if (_dd_currentDepth >= _dd_disableDepth)
        return;
      if (_dd_lastDumpWasOpen)
        dump ("\n");
      dumpln (_dd_pfx + _dd_currentIndent + str);
      _dd_lastDumpWasOpen = false;
    }    
  }
}
else {
  exports.dd = function (){};
}

var trace = exports.trace = function () {
  var traceback = require("traceback");
  var stack = traceback.get();
  stack.splice(-1, 1);
  dumpln(traceback.format(stack));
  // message(this.print, "info", [traceback.format(stack)]);
}

if (DEBUG) {
  //_dd_pfx = "qm2: ";
  _dd_pfx = "|";
  exports.warn = function (msg) { dumpln("** WARNING " + msg + " **"); }
  exports.ASSERT = function (expr, msg) {
    if (!expr) {
      dump("** ASSERTION FAILED: " + msg + " **\n" +
           trace() + "\n");
      return false;
    } else {
      return true;
    }
  }
}
else {
  exports.warn = exports.ASSERT = function (){};
}

exports.exception = function exception(e)
{
  var fullString = ("An exception occurred.\n" +
                    require("traceback").format(e) + "\n" + e);
  dumpln(fullString);
};

exports.isdebug = function isdebug()
{
  return DEBUG;
};

/* Dumps an object in tree format, recurse specifiec the the number of objects
 * to recurse, compress is a boolean that can uncompress (true) the output
 * format, and level is the number of levels to intitialy indent (only useful
 * internally.)  A sample dumpObjectTree (o, 1) is shown below.
 *
 * + parent (object)
 * + users (object)
 * | + jsbot (object)
 * | + mrjs (object)
 * | + nakkezzzz (object)
 * | *
 * + bans (object)
 * | *
 * + topic (string) 'ircclient.js:59: nothing is not defined'
 * + getUsersLength (function) 9 lines
 * *
 */
exports.dumpObjectTree =
function dumpObjectTree (o, recurse, compress, level)
{
  var s = "";
  var pfx = "";

  if (typeof recurse == "undefined")
    recurse = 0;
  if (typeof level == "undefined")
    level = 0;
  if (typeof compress == "undefined")
    compress = true;

  for (var i = 0; i < level; i++)
    pfx += (compress) ? "| " : "|  ";

  var tee = (compress) ? "+ " : "+- ";

  for (i in o) {
    var t;
    try {
      t = typeof o[i];

      switch (t) {
      case "function":
        var sfunc = String(o[i]).split("\n");
        if (sfunc[2] == "    [native code]")
          sfunc = "[native code]";
        else
          sfunc = sfunc.length + " lines";
        s += pfx + tee + i + " (function) " + sfunc + "\n";
        break;

      case "object":
        s += pfx + tee + i + " (object) " + o[i] + "\n";
        if (!compress)
          s += pfx + "|\n";
        if ((i != "parent") && (recurse))
          s += dumpObjectTree (o[i], recurse - 1,
                               compress, level + 1);
        break;

      case "string":
        if (o[i].length > 200)
          s += pfx + tee + i + " (" + t + ") " +
            o[i].length + " chars\n";
        else
          s += pfx + tee + i + " (" + t + ") '" + o[i] + "'\n";
        break;

      default:
        s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";
      }
    }
    catch (ex) {
      s += pfx + tee + i + " (exception) " + ex + "\n";
    }

    if (!compress)
      s += pfx + "|\n";

  }

  s += pfx + "*\n";

  return s;

}
