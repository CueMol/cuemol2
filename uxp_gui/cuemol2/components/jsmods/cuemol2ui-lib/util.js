// -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
//
//  Utility routines
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");

/*
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;
*/

//////////
// File operations

var MozFile = exports.createMozFile = function(path)
{
  var file = Cc['@mozilla.org/file/local;1']
             .createInstance(Ci.nsILocalFile);
  file.initWithPath(path);
  return file;
}

exports.chkCreateMozFile = function(path)
{
  try {
    var file = MozFile(path);
    if (file.isFile())
      return file;
  }
  catch (e) {
  }

  return null;
}

exports.chkCreateMozDir = function (path)
{
  try {
    var file = MozFile(path);
    if (file.isDirectory())
      return file;
  }
  catch (e) {
  }

  return null;
}

exports.createMozTmpFile = function(aTmpl)
{
  var file;
  file = Cc["@mozilla.org/file/directory_service;1"]
    .getService(Ci.nsIProperties)
      .get("TmpD", Ci.nsIFile);
  file.append(aTmpl);
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o664);
  return file;
}

exports.createDefaultPath = function(aPropName)
{
  var default_path = "";
  try {
    var file = Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
        .get("CurProcD", Ci.nsIFile);
    
    for (var i=1; i<arguments.length; ++i) {
      file.append(arguments[i]);
    }
    default_path = file.path;
  }
  catch (e) {
    debug_util.exception(e);
  }

  return default_path;
}

exports.isFile = function (aPath)
{
  var file;
  var bOK = false;
  try {
    file = MozFile(aPath);
    if (file.isFile())
      bOK = true;
  }
  catch (e) {
    // confpath may not be a fullpath
    bOK = false;
  }

  return bOK;
}

exports.getFileLeafName = function(aPath)
{
  return MozFile(aPath).leafName;
}

exports.getFileDirName = function(aPath)
{
  return MozFile(aPath).parent.path;
}

exports.splitFileName = function (path, fext)
{
  var c = path.lastIndexOf(".");
  if (c<0) {
    // ext not fiound
    return -1;
  }
  //var curext = path.substr(c+1);
  var curext = path.substr(c);
  dd("splitFileName> path ext: "+curext);

  var re = /\s*;\s*/;
  var fextlist = fext.split(re);
  var i, nlen = fextlist.length;
  
  for (i=0; i<nlen; ++i) {
    var elem = fextlist[i];
    dd("splitfname: "+elem);
    if (elem.endsWith(curext)) {
      // if (path.endsWith(elem)) {
      // ext found
      dd("splitFileName> match= "+elem+" in "+fext);
      return c;
    }
  }
  return -1;
}

exports.splitFileName3 = function (path, fext)
{
  var re = /\s*;\s*/;
  var fextlist = fext.split(re);
  var i, nlen = fextlist.length;
  
  for (i=0; i<nlen; ++i) {
    var elem = fextlist[i];

    var c = elem.indexOf(".");
    if (c<0) {
      // invalid ext string
      return -1;
    }
    var curext = elem.substr(c);
    dd("splitFileName3> try ext: "+curext);

    if (path.endsWith(curext)) {
      // ext found
      dd("splitFileName3> match= "+elem+" in "+fext);
      return c;
    }
  }
  return -1;
}

exports.splitFileName2 = function (aPath, aExt)
{
  var dotpos = aPath.lastIndexOf(".");
  if (dotpos<0) {
    // ext not fiound
    var extpos2 = aExt.lastIndexOf(".");
    var path = aPath + aExt.substr(extpos2);
    dotpos = aPath.lastIndexOf(".");
    return {"dotpos":dotpos, "path":path};
  }

  var curext = aPath.substr(dotpos+1);
  if (aExt.indexOf(curext)<0) {
    // ext not found
    return null;
  }

  return {"dotpos":dotpos, "path":aPath};
};

/// remove file extension from path string
exports.removeFileExt = function (aPath)
{
  var c = aPath.lastIndexOf(".");
  if (c<0)
    return aPath;
  return aPath.substr(0, c);
};

//////////
// Misc function

// blocking run of a process
exports.run_proc = function (cmd, cmd_history_key, cmd_args)
{
  var exe = MozFile(cmd);
  if (!exe.isFile()) {
    throw "cannot open file: "+cmd;
  }    
  require("preferences-service").set(cmd_history_key, exe.path);

  var proc = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  proc.init(exe);

  proc.run(true, cmd_args, cmd_args.length);
}

exports.clone1 = function (aSrc)
{
  var rval = new Object();
  for (var p in aSrc)
    rval[p] = aSrc[p];

  return rval;
}


////////////////////////////////////////////////

var promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

exports.alert = function(window, text)
{
  try {
    promptSvc.alert(window, "CueMol2", text);
  }
  catch (e) {
    debug_util.exception(e);
  }
}

exports.confirm = function(window, text)
{
  return promptSvc.confirm(window, "CueMol2", text);
}

exports.prompt = function(window, text, defaultValue)
{
  var dummy = {value: false};
  if (defaultValue===undefined||defaultValue===null)
    defaultValue = "";
  var result = {value: defaultValue};
  var ok = promptSvc.prompt(window, "CueMol2", text, result, null, dummy);

  if (!ok) return null;
  return result.value;
}

exports.confirmYesNoCancel = function(window, text)
{
  // default the checkbox to false  
  var check = {value: false};
  
  var flags = promptSvc.BUTTON_POS_0 * promptSvc.BUTTON_TITLE_YES +  
    promptSvc.BUTTON_POS_1 * promptSvc.BUTTON_TITLE_CANCEL  +  
      promptSvc.BUTTON_POS_2 * promptSvc.BUTTON_TITLE_NO;  
   
  var button = promptSvc.confirmEx(window, "CueMol2", text,
                                 flags, "", "", "", null, check);  

  return button;
}

exports.doSelectObjPrompt = function(window, scene, dlg_title, filter_fn)
{
  var id, label, ok;
  var labellist = new Array();
  var uidlist = new Array();
  var selected = {};
  var re = /\(([0-9]+)\)$/, match;
  var scene;

  try {
    var json = scene.getObjectTreeJSON();
    var obj = JSON.parse(json);
    for (var i=0; i<obj.length; ++i) {
      var target = obj[i];
      label = filter_fn((i==0)?"scene":"object", target);
      if (label!==null) {
        labellist.push(label);
        uidlist.push(target.ID);
      }

      var rnds = target.rends;
      if (typeof rnds!='undefined' && 'length' in rnds) {
        for (var j=0; j<rnds.length; ++j) {
          target = rnds[j];
          label = filter_fn("renderer", target);
          if (label!==null) {
            labellist.push(label);
            uidlist.push(target.ID);
          }
        }
      }
    }
  }
  catch (e) {
    debug_util.exception(e);
    return null;
  }

  if (labellist.length==0)
    return null; // No target object

  ok = promptSvc.select(window, "CueMol2", dlg_title, 
                        labellist.length, labellist, selected);

  if (!ok)
    return null;

  target_ID = uidlist[selected.value];

  return target_ID;
}

exports.makeUniqName = function(strbundle, prop_name, try_func)
{
  for (var i=1; ;++i) {
    var tmpscname = strbundle.getFormattedString(prop_name, [i.toString()]);
    var tmpsce = try_func(tmpscname);
    //dump("XXX: "+(typeof tmpsce)+", "+tmpsce+"\n");
    if (typeof tmpsce === "undefined" ||
        tmpsce === null) {
      // tmpscename is unique name
      return tmpscname;
    }
  }

  return;
}

exports.makeUniqName2 = function(str_func, try_func)
{
  for (var i=1; ;++i) {
    //var tmpscname = str_prefix + i.toString();
    var tmpscname = str_func(i.toString());
    var tmpsce = try_func(tmpscname);
    //dump("XXX: "+(typeof tmpsce)+", "+tmpsce+"\n");
    if (typeof tmpsce === "undefined" ||
        tmpsce === null) {
      // tmpscename is unique name
      return tmpscname;
    }
  }

  return;
}

exports.getSysConfigFname = function (args)
{
  var dir_svc = Cc["@mozilla.org/file/directory_service;1"]
    .getService(Ci.nsIProperties);

  var curproc_dir = dir_svc.get("CurProcD", Ci.nsIFile);

  var cmdLine = args[0];
  var confpath = null;

  // check commandline -conf <path> option
  try {
    cmdLine = cmdLine.QueryInterface(Ci.nsICommandLine);
    confpath = cmdLine.handleFlagWithParam("conf", false);
  }
  catch (e) {
    debug_util.exception(e);
  }
  
  if (confpath==null)
    confpath = "sysconfig.xml";

  var file;
  var bOK = false;

  try {
    // check the existence of confpath (as fullpath)
    file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithPath(confpath);
    if (file.isFile())
      return file.path;
  }
  catch (e) {
    // confpath may not be a fullpath
    // bOK = false;
    //debug_util.exception(e);
  }

  try {
    // check the existence of confpath (as relative path from "CurProcD")
    file = curproc_dir.parent.clone();
    file.append(confpath);
    if (file.isFile())
      return file.path;
  }
  catch (e) {
    //bOK = false;
    dd("file not found: "+file.path);
    debug_util.exception(e);
  }

  // confpath filename is not found
  dd("FATAL ERROR: cannot determine confpath!!");
  return null;
}

exports.getPlatformString = function ()
{
  try {
    var sysInfo =
      Components.classes["@mozilla.org/system-info;1"]
      .getService(Components.interfaces.nsIPropertyBag2);
    return sysInfo.getProperty("name");
  }
  catch (e) {
    dump("System-info not available, trying the user agent string.\n");
    var user_agent = navigator.userAgent;
    if (user_agent.indexOf("Windows") != -1)
      return "Windows_NT";
    else if (user_agent.indexOf("Mac OS X") != -1)
      return "Darwin";
    else if (user_agent.indexOf("Linux") != -1)
      return "Linux";
    else if (user_agent.indexOf("SunOS") != -1)
      return "SunOS";
    return "";
  }
}

exports.selectMenuListByValue = function (aMenuList, aValue)
{
  var bChkAry = false;

  if (typeof aValue=='object' &&
      'some' in aValue &&
      typeof aValue.some=='function')
    bChkAry = true;

  const nelem = aMenuList.itemCount;
  for (var i=0; i<nelem; ++i) {
    var item = aMenuList.getItemAtIndex(i);
    //dd("SelMenuList: item="+item.value);
    //dd("             val ="+aValue);
    if (bChkAry) {
      if (aValue.some( function (elem) { return item.value==elem; } )) {
        aMenuList.selectedItem = item;
        return true;
      }
    }
    else if (item.value==aValue) {
      aMenuList.selectedItem = item;
      return true;
    }
    
  }

  return false;
}

exports.clearMenu = function(menu)
{
  while (menu.firstChild)
    menu.removeChild(menu.firstChild);
}

exports.appendMenu = function(doc, aMenu, aValue, aLabel)
{
  var item = doc.createElementNS(
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    "menuitem");
  item.setAttribute("value", aValue);
  item.setAttribute("label", aLabel);
  aMenu.appendChild(item);

  return item;
}

exports.appendMenuSep = function(doc, aMenu)
{
  var item = doc.createElementNS(
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    "menuseparator");
  aMenu.appendChild(item);

  return item;
}

exports.populateStyleMenus = function (document, scene_id, menu, prefix, regexp)
{
  exports.clearMenu(menu);

  if (regexp==null) {
    var item = exports.appendMenu(document, menu, "", "(no styles)");
    //item.disabled = true;
    item.setAttribute("disabled", "true");
    return;
  }

  var stylem = cuemol.getService("StyleManager");
  var json = stylem.getStyleNamesJSON(0);
  dd("JSON: "+json);
  var names = JSON.parse(json);

  if (scene_id!=null) {
    json = stylem.getStyleNamesJSON(scene_id);
    dd("JSON: "+json);
    names = names.concat( JSON.parse(json) );
  }
  
  dd("MenuElem: "+menu.localName);
  var nitems = names.length;
  var name, value, label, res;
  for (var i=0; i<nitems; ++i) {
    name = names[i].name;
    if (!regexp.test(name)) {
      dd("Style "+name+" no match: "+regexp);
      continue;
    }
    dd("AddMenu = "+name);
    value = prefix+name;
    label = names[i].desc;
    if (!label)
      label = name;
    var item = exports.appendMenu(document, menu, value, label);
    item.setAttribute("remove_re", regexp);
  }
};

exports.getChildById = function (element, id)
{
  var nl = element.getElementsByAttribute("id", id);
  return nl.item(0);
}

exports.persistChkBox = function (aId, aDoc)
{
  var elem = aDoc.getElementById(aId);
  elem.setAttribute("checked", elem.checked?"true":"false");
};

exports.toIntArray = function (aString)
{
  var strary = aString.split(",");
  var rval = new Array;
  strary.forEach( function (e) {
    var i = parseInt(e);
    //dd("toIntArray: "+e+" => "+i);
    if ( isNaN(i) )
      return;
    rval.push(i);
  });
  return rval;
};

exports.toFloatArray = function (aString)
{
  var strary = aString.split(",");
  var rval = new Array;
  strary.forEach( function (e) {
    var i = parseFloat(e);
    if ( isNaN(i) )
      return;
    rval.push(i);
  });
  return rval;
};

exports.isNearReal = function (aNum1, aNum2, aPrec)
{
  var prec = 1.0e-3;
  if (arguments.length>=3 && aPrec>1)
    prec = Math.pow(10, -aPrec);
  
  if (Math.abs(aNum1-aNum2)<prec)
    return true;
  else
    return false;
};

////////////////////////////////////////////////
// color functions

exports.convHSB2RGB = function (hsb)
{
  var h = hsb[0];
  var s = hsb[1];
  var v = hsb[2];

  var r, g, b;
  //if (h == 360) {h = 0;}
  //  else if (h>360 or h<0) {return 0;}
  h = h % 360;
  
  s /= 100;
  v /= 100;
  h /= 60;

  var i = Math.floor(h);
  var f = h-i;
  var p = v*(1-s);
  var q = v*(1-(s*f));
  var t = v*(1-(s*(1-f)));
  if (i==0) {r=v; g=t; b=p;}
  else if (i==1) {r=q; g=v; b=p;}
  else if (i==2) {r=p; g=v; b=t;}
  else if (i==3) {r=p; g=q; b=v;}
  else if (i==4) {r=t; g=p; b=v;}
  else if (i==5) {r=v; g=p; b=q;}
  r = Math.floor(r*255);
  g = Math.floor(g*255);
  b = Math.floor(b*255);
  return [r,g,b];
}

exports.convRGB2HSB = function (rgb)
{
  var red = rgb[0];
  var grn = rgb[1];
  var blu = rgb[2];

  var x, val, f, i, hue, sat, val;
  red/=255.0;
  grn/=255.0;
  blu/=255.0;

  x = Math.min(Math.min(red, grn), blu);
  val = Math.max(Math.max(red, grn), blu);

  if (x==val){
    //return({h:undefined, s:0, v:val*100});
    return [0, 0, Math.floor(val*100)];
  }

  f = (red == x) ? grn-blu : ((grn == x) ? blu-red : red-grn);
  i = (red == x) ? 3 : ((grn == x) ? 5 : 1);
  hue = Math.floor((i-f/(val-x))*60)%360;
  sat = Math.floor(((val-x)/val)*100);
  val = Math.floor(val*100);

  return [hue, sat, val];
}

exports.packToHTMLColor = function ( rgb )
{
  var r = rgb[0];
  var g = rgb[1];
  var b = rgb[2];
  
  return '#' + 
    (r < 16 ? '0' : '') + r.toString(16) +
      (g < 16 ? '0' : '') + g.toString(16) +
        (b < 16 ? '0' : '') + b.toString(16);
}

exports.getHTMLColor = function ( aCol )
{
  var r = aCol.r();
  var g = aCol.g();
  var b = aCol.b();
  
  return '#' + 
    (r < 16 ? '0' : '') + r.toString(16) +
      (g < 16 ? '0' : '') + g.toString(16) +
        (b < 16 ? '0' : '') + b.toString(16);
}

////////////////////////////////////////////////
// selection/history

exports.chkboxLoad = function (aDoc, aID, aPrefix)
{
  const pref = require("preferences-service");
  let elem = aDoc.getElementById(aID);
  let hisnm = aPrefix + "."+aID;

  if (pref.has(hisnm))
    elem.checked = pref.get(hisnm);
};

exports.chkboxSave = function (aDoc, aID, aPrefix)
{
  const pref = require("preferences-service");
  let elem = aDoc.getElementById(aID);
  let hisnm = aPrefix + "."+aID;

  pref.set(hisnm, elem.checked);
};

var _storage = require("simple-storage");

exports.History = function(aname,anmax)
{
  this._data = [];
  this._stor_name = aname;
  if (anmax>0)
    this._nmax = anmax;
  else
    this._nmax = 10;
};

var History = exports.History.prototype;

History.getLength = function ()
{
  return this._data.length;
};

History.getEntry = function (ind)
{
  return this._data[ind];
};

History.append = function (str)
{
  if (str===null || str===undefined || str==="") return;
  
  var nitems = this._data.length;
  var nmat = null;
  for (var i=0; i<nitems; ++i) { 
    if (this._data[i]==str) {
      nmat = i;
      break;
    }
  }
  if (nmat!==null) {
    dd("His("+this._stor_name+").append: "+str+" is already in history");
    var item = this._data.splice(nmat, 1)[0];
    //dd("!!! splice typeof item = "+typeof item);
    this._data.unshift(item);
    //dd("!!! selHis = "+this._data);
    return;
  }

  var newlen = this._data.unshift(str);
  if (newlen>this._nmax)
    this._data.pop();
};

History.push = function (str)
{
  if (str===null || str===undefined || str==="") return;
  
  var nitems = this._data.length;
  var nmat = null;
  for (var i=0; i<nitems; ++i) { 
    if (this._data[i]==str) {
      nmat = i;
      break;
    }
  }
  if (nmat!==null) {
    dd("His("+this._stor_name+").append: "+str+" is already in history");
    var item = this._data.splice(nmat, 1)[0];
    //dd("!!! splice typeof item = "+typeof item);
    this._data.push(item);
    //dd("!!! selHis = "+this._data);
    return;
  }

  var newlen = this._data.push(str);
  if (newlen>this._nmax)
    this._data.shift();
};

History.saveToPref = function ()
{
  var nitems = this._data.length;
  var tmp = new Array(nitems);
  for (var i=0; i<nitems; ++i) {
    dd("save to: "+this._stor_name+" ("+i+")"+this._data[i]);
    tmp[i] = this._data[i];
  }
  _storage.storage[this._stor_name] = tmp;
};

History.loadFromPref = function ()
{
  if (_storage.storage[this._stor_name]) {
    var src = _storage.storage[this._stor_name];
    var nitems = src.length;
    var tmp = new Array(nitems);
    for (var i=0; i<nitems; ++i) {
      dd("load from: "+this._stor_name+" ("+i+")"+src[i]);
      tmp[i] = src[i];
    }
    this._data = tmp;
  }
  else {
    dd("load from: "+this._stor_name+" not found.");
  }
};

History.dumpToStr = function ()
{
  var str = "";
  var nitems = this._data.length;
  for (var i=0; i<nitems; ++i) {
    str += i + ": " + this._data[i] + "\n";
  }
  return str;
};

//////////

var _stor_name = "selection_history";

exports.selHistory = {

_data: [],
    
getLength: function () {
  return this._data.length;
},

getEntry: function (ind) {
  return this._data[ind];
},

append: function (str)
{
  if (str===null || str===undefined || str==="") return;
  
  var nitems = this._data.length;
  var nmat = null;
  for (var i=0; i<nitems; ++i) { 
    if (this._data[i]==str) {
      nmat = i;
      break;
    }
  }
  if (nmat!==null) {
    dd("selHis.append: "+str+" is already in history");
    var item = this._data.splice(nmat, 1)[0];
    //dd("!!! splice typeof item = "+typeof item);
    this._data.unshift(item);
    //dd("!!! selHis = "+this._data);
    return;
  }

  var newlen = this._data.unshift(str);
  if (newlen>10)
    this._data.pop();
},

saveToPref: function () {
  var nitems = this._data.length;
  var tmp = new Array(nitems);
  for (var i=0; i<nitems; ++i)
    tmp[i] = this._data[i];
  _storage.storage[_stor_name] = tmp;
},

loadFromPref: function () {
  if (_storage.storage[_stor_name]) {
    var src = _storage.storage[_stor_name];
    var nitems = src.length;
    var tmp = new Array(nitems);
    for (var i=0; i<nitems; ++i)
      tmp[i] = src[i];
    this._data = tmp;
  }
},

};

