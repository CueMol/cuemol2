
// Cc, Ci, etc are defined cuemol2-utils.js
// var Cc = Components.classes;
// var Ci = Components.interfaces;
//const util = require("util");

window.gPdbDlg = {
  init: function () {
    this.mFindBtn = document.getElementById('find-button');
    this.mPdbIdBox = document.getElementById('pdbid');
    this.mResBox = document.getElementById('result-text');
    this.mArgs = window.arguments;
    this.mIoService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    this.mHis = new util.History("OpenPDB-history");
    dd("this.mHis = "+this.mHis);
    var his = this.mHis
    his.loadFromPref();
    var nhis = his.getLength();
    for (var i=0; i<nhis; ++i) {
      let val = his.getEntry(i);
      dd("entry "+i+": "+val);
      this.mPdbIdBox.appendItem(val,val);
    }
  },

  validation: function (pdbid) {
    var val = pdbid;
    if (val.length!="4")
      return false;
    if (!val.match(/^[0-9][0-9a-z][0-9a-z][0-9a-z]$/i))
      return false;
    return true;
  },

  onCancel: function () {
    window.close();
    return false;
  },

  makePDBURL: function (pdbid, svr_type) {
    if (svr_type == "RCSB_CIF") {
      url_pdb = "https://files.rcsb.org/download/"+pdbid+".cif";
    }
    else if (svr_type == "RCSB_PDB") {
      url_pdb = "https://files.rcsb.org/download/"+pdbid+".pdb";
    }
    else {
      dd("Unknown PDB server: "+svr_type);
      return null;
    }
    url_pdb = cuemolui.replacePDBURL(url_pdb, pdbid);
    return url_pdb;
  },

  makeMapURL: function (pdbid, svr_type, mapchk_2fofc) {
    if (svr_type=="EBI_MTZ") {
      url_map = "https://www.ebi.ac.uk/pdbe/coordinates/files/"+pdbid+"_map.mtz";
    }
    else if (svr_type=="RCSB_CIF") {
      let mid = pdbid.substr(1,2);
      let maptype;
      if (mapchk_2fofc)
        maptype = "2fo-fc";
      else
        maptype = "fo-fc";
      url_map = "https://files.rcsb.org/pub/pdb/validation_reports/"+mid+"/"+pdbid+"/"+pdbid+"_validation_"+maptype+"_map_coef.cif.gz";
    }
    return url_map;
  },

  checkURL: function (url_pdb) {
    let uri = this.mIoService.newURI(url_pdb, null, null);
    let httpChannel;
    try {
      httpChannel = this.mIoService.newChannelFromURI(uri)
        .QueryInterface(Components.interfaces.nsIHttpChannel);
      httpChannel.requestMethod = "HEAD";
      httpChannel.redirectionLimit = 10;
      httpChannel.open();
    }
    catch (e) {
      debug.exception(e);
      return false;
    }

    try {
      dd("Response "+httpChannel.responseStatus+httpChannel.responseStatusText+" for URL: "+url_pdb);
      if (httpChannel.responseStatus==200) {
        return false;
      }
    }
    catch (e) {
      debug.exception(e);
      return false;
    }

    return true;
  },

  showErrMsg: function (msg) {
    this.mResBox.value = msg;
    this.mPdbIdBox.select();
    this.mPdbIdBox.focus();
  },

  onFind: function () {
    let pdbid = this.mPdbIdBox.value.toLowerCase();

    let pdbchk = document.getElementById('chk-get-pdb').checked;
    let mapchk_2fofc = document.getElementById('chk-get-map-2fofc').checked;
    let mapchk_fofc = document.getElementById('chk-get-map-fofc').checked;

    if (!pdbchk && !mapchk_2fofc && !mapchk_fofc) {
      this.mResBox.value = "Neither pdb nor map selected";
      return false;
    }

    if (!this.validation(pdbid)) {
      this.showErrMsg("Invalid PDB ID: "+pdbid);
      return false;
    }

    let url_pdb = null;
    if (pdbchk) {
      let svr = document.getElementById('pdb-svr-list').value;
      url_pdb = this.makePDBURL(pdbid, svr);
      dd("Check PDB URL: "+url_pdb);
      if (this.checkURL(url_pdb)) {
        this.showErrMsg("PDB Entry " + pdbid + ": not found.");
        return false;
      }
    }

    let map_svr = document.getElementById('map-svr-list').value;
    if (mapchk_2fofc || mapchk_fofc) {
      url_map = this.makeMapURL(pdbid, map_svr, mapchk_2fofc);
      dd("Check Map URL: "+url_map);
      if (this.checkURL(url_map)) {
        this.showErrMsg("Map Entry " + pdbid + ": not found.");
        return false;
      }
    }

    url_map_2fofc = null;
    if (mapchk_2fofc)
      url_map_2fofc = this.makeMapURL(pdbid, map_svr, mapchk_2fofc);
    url_map_fofc = null;
    if (mapchk_fofc)
      url_map_fofc = this.makeMapURL(pdbid, map_svr, !mapchk_fofc);

    this.mArgs[0]({
      pdbid: pdbid,
      url_pdb: url_pdb,
      url_map_2fofc: url_map_2fofc,
      url_map_fofc: url_map_fofc
    });

    this.mHis.append(pdbid);
    this.mHis.saveToPref();
    return true;
  }
};
