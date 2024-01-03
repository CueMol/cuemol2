// -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
//
// MRU file manager
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const util = require("util");
const dd = debug_util.dd;

//const pref = require("preferences-service");
const SS = require("simple-storage");

const MRU_BASE = "mru-files";
const MRU_MAX_SIZE = 10;

exports.addMRU = function (fname, ftype)
{
  if (SS.storage[MRU_BASE] &&
      Array.isArray(SS.storage[MRU_BASE])) {
    let ind = exports.searchMRU(fname);
    if (ind>=0) {
      let ss = SS.storage[MRU_BASE];
      let item = ss.splice(ind, 1)[0];
      ss.unshift(item);
      return;
    }
  }
  else {
    // no MRU data --> create
    SS.storage[MRU_BASE] = [];
  }

  let ss = SS.storage[MRU_BASE];
  dd("@@@ MRU="+ss);
  dd("@@@ MRU.length="+ss.length);
  ss.unshift({"fname": fname, "ftype": ftype});
  if (ss.length > MRU_MAX_SIZE) {
    ss.pop();
  }
}

exports.dumpMRU = function ()
{
  if (SS.storage[MRU_BASE] &&
      Array.isArray(SS.storage[MRU_BASE])) {
    let ss = SS.storage[MRU_BASE];
    let nlen = ss.length;
    for (var i=0; i<nlen; ++i) {
      let fn = ss[i].fname;
      let ft = ss[i].ftype;
      dd("@@@ MRU "+i+" fname="+fn+", ftype="+ft);
    }
  }
}
  
exports.searchMRU = function (fname)
{
  if (SS.storage[MRU_BASE] &&
      Array.isArray(SS.storage[MRU_BASE])) {
    let ss = SS.storage[MRU_BASE];
    let nlen = ss.length;
    for (var i=0; i<nlen; ++i) {
      let fn = ss[i].fname;
      //let ft = ss[i].ftype;
      if (fn==fname)
        return i;
    }
  }
  return -1;
}

exports.clearMRU = function ()
{
  SS.storage[MRU_BASE] = [];
}

exports.buildMRUMenu = function (doc, menu)
{
  //while (menu.firstChild)
  //menu.removeChild(menu.firstChild);
  let nelem = menu.childNodes.length;
  let erase_list = [];
  for (let i=0; i<nelem; ++i) {
    if (menu.childNodes[i].className=="mru_entry")
      erase_list.push(menu.childNodes[i]);
  }
  nelem = erase_list.length;
  for (let i=0; i<nelem; ++i) {
    menu.removeChild(erase_list[i]);
  }

  let splitter = menu.firstChild;

  if (SS.storage[MRU_BASE] &&
      Array.isArray(SS.storage[MRU_BASE])) {
  }
  else {
    // no MRU data --> abort

    var item = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
                                   "menuitem");
    item.setAttribute("label", "(none)");
    item.setAttribute("disabled", "true");
    item.className = "mru_entry";
    menu.insertBefore(item, splitter);

    return;
  }

  let ss = SS.storage[MRU_BASE];

  dd("MenuElem: "+menu.localName);
  let nitems = ss.length;
  let name, value, label, res;
  for (let i=0; i<nitems; ++i) {
    let mozf = util.chkCreateMozFile(ss[i].fname);
    if (mozf==null) {
      dd("File: "+ss[i].fname+" not exist");
      continue;
    }
    name = mozf.leafName;
    dd("AddMenu = "+name);
    value = ss[i];
    label = name;

    var item = doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
                                   "menuitem");
    item.setAttribute("oncommand", "gQm2Main.onFileOpenMRU(event)");
    item.setAttribute("label", label);
    item.setAttribute("fname", ss[i].fname);
    item.setAttribute("ftype", ss[i].ftype);
    item.className = "mru_entry";
    menu.insertBefore(item, splitter);
  }

}
