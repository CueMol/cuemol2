
// Cc, Ci, etc are defined cuemol2-utils.js
// var Cc = Components.classes;
// var Ci = Components.interfaces;
//const util = require("util");

window.gPdbDlg = {
  init: function () {
    // this.mFindBtn = document.getElementById('find-button');
    this.mAcceptBtn = document.documentElement.getButton("accept");
    this.mAcceptBtn.disabled = true;
    // dd("*** btn="+btn);
    this.mPdbIdBox = document.getElementById('pdbid');
    this.mResBox = document.getElementById('result-text');

    this.mPdbChk = document.getElementById('chk-get-pdb');
    this.mMap2fofcChk = document.getElementById('chk-get-map-2fofc');
    this.mMapFofcChk = document.getElementById('chk-get-map-fofc');

    this.mPdbSvrList = document.getElementById('pdb-svr-list');
    this.mMapSvrList = document.getElementById('map-svr-list');

    this.mArgs = window.arguments;
    this.mIoService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    this.mHis = new util.History("OpenPDB-history");
    dd("this.mHis = "+this.mHis);
    this.loadPDBHistory();

    const that = this;
    const updateWidgetsFn = (event) => {
      try {
        that.updateWidgets(event);
      }
      catch (e) {
        debug.exception(e);
      }
    };
    this.mPdbIdBox.addEventListener("input", updateWidgetsFn, false);
    this.mPdbIdBox.addEventListener("select", updateWidgetsFn, false);
    this.mPdbChk.addEventListener("click", updateWidgetsFn, false);
    this.mMap2fofcChk.addEventListener("click", updateWidgetsFn, false);
    this.mMapFofcChk.addEventListener("click", updateWidgetsFn, false);
  },

  loadPDBHistory: function () {
    let his = this.mHis
    his.loadFromPref();
    let nhis = his.getLength();
    for (let i=0; i<nhis; ++i) {
      let val = his.getEntry(i);
      dd("entry "+i+": "+val);
      this.mPdbIdBox.appendItem(val,val);
    }
  },

  updateWidgets: function(event) {
    let val = this.mPdbIdBox.value.toLowerCase();
    // dd("UpdateWidgets PDB ID: "+val);
    if (!this.isValidPDBID(val)) {
      this.mResBox.value = "";
      this.mAcceptBtn.disabled = true;
      return;
    }

    let pdbchk = this.mPdbChk.checked;
    let mapchk_2fofc = this.mMap2fofcChk.checked;
    let mapchk_fofc = this.mMapFofcChk.checked;

    if (!pdbchk && !mapchk_2fofc && !mapchk_fofc) {
      this.mResBox.value = "Neither pdb nor map selected";
      this.mAcceptBtn.disabled = true;
      return;
    }

    window.setTimeout( () => {
      if (pdbchk) {
        const url_pdb = this.checkPDBAvail(val, this.mPdbSvrList.value);
        if (url_pdb === null) {
          this.mAcceptBtn.disabled = true;
          return;
        }
      }
      if (mapchk_2fofc) {
        const url_map_2fofc = this.checkPDBMapAvail(val, this.mMapSvrList.value, true);
        if (url_map_2fofc === null) {
          this.mAcceptBtn.disabled = true;
          return;
        }
      }
      if (mapchk_fofc) {
        const url_map_fofc = this.checkPDBMapAvail(val, this.mMapSvrList.value, false);
        if (url_map_fofc === null) {
          this.mAcceptBtn.disabled = true;
          return;
        }
      }
    }, 0);

    this.mResBox.value = "";
    this.mAcceptBtn.disabled = false;
  },

  isValidPDBID: function (pdbid) {
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
    let url_pdb = null;
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
    let url_map = null;
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

  urlCache: {},

  checkURLAvail: function (url_pdb) {
    if (url_pdb in this.urlCache) {
      dd("URL cache hit: "+url_pdb+" => "+this.urlCache[url_pdb]);
      return this.urlCache[url_pdb];
    }
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
      // this.urlCache[url_pdb] = false;
      return false;
    }

    try {
      dd("Response "+httpChannel.responseStatus+httpChannel.responseStatusText+" for URL: "+url_pdb);
      if (httpChannel.responseStatus==200) {
        // found --> OK
        this.urlCache[url_pdb] = true;
        return true;
      }
    }
    catch (e) {
      debug.exception(e);
      return false;
    }

    // not found
    this.urlCache[url_pdb] = false;
    return false;
  },

  showErrMsg: function (msg) {
    dd("showErrMsg: "+msg);
    this.mResBox.value = msg;
    // this.mPdbIdBox.select();
    // this.mPdbIdBox.focus();
  },

  checkPDBAvail : function (pdbid, svr_type) {
    const url_pdb = this.makePDBURL(pdbid, svr_type);
    dd("Check PDB URL: "+url_pdb);
    if (this.checkURLAvail(url_pdb)) {
      return url_pdb;
    }
    this.showErrMsg("PDB Entry " + pdbid + ": not found.");
    return null;
  },

  checkPDBMapAvail : function (pdbid, svr_type, b2fofc) {
    const url_map = this.makeMapURL(pdbid, svr_type, b2fofc);
    dd("Check Map URL: "+url_map);
    if (this.checkURLAvail(url_map)) {
      return url_map;
    }
    this.showErrMsg("Map Entry " + pdbid + ": not found.");
    return null;
  },

  onFind: function () {
    let pdbid = this.mPdbIdBox.value.toLowerCase();

    let pdbchk = this.mPdbChk.checked;
    let mapchk_2fofc = this.mMap2fofcChk.checked;
    let mapchk_fofc = this.mMapFofcChk.checked;

    if (!pdbchk && !mapchk_2fofc && !mapchk_fofc) {
      this.mResBox.value = "Neither pdb nor map selected";
      return false;
    }

    if (!this.isValidPDBID(pdbid)) {
      this.showErrMsg("Invalid PDB ID: "+pdbid);
      return false;
    }

    let url_pdb = null;
    if (pdbchk) {
      url_pdb = this.checkPDBAvail(pdbid, this.mPdbSvrList.value);
      if (url_pdb === null) {
        return false;
      }
    }

    let url_map_2fofc = null;
    if (mapchk_2fofc) {
      url_map_2fofc = this.checkPDBMapAvail(pdbid, this.mMapSvrList.value, true);
      if (url_map_2fofc === null) {
        return false;
      }
    }

    let url_map_fofc = null;
    if (mapchk_fofc) {
      url_map_fofc = this.checkPDBMapAvail(pdbid, this.mMapSvrList.value, false);
      if (url_map_fofc === null) {
        return false;
      }
    }

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
