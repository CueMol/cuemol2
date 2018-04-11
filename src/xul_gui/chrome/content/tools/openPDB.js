
var Cc = Components.classes;
var Ci = Components.interfaces;
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

  onFind: function () {
    var pdbid = this.mPdbIdBox.value.toLowerCase();

    var pdbchk = document.getElementById('chk-get-pdb').checked;
    var mapchk_2fofc = document.getElementById('chk-get-map-2fofc').checked;
    var mapchk_fofc = document.getElementById('chk-get-map-fofc').checked;

    var url_pdb = null;
    var url_map = null;

    if (!pdbchk && !mapchk_2fofc && !mapchk_fofc) {
      this.mResBox.value = "Neither pdb nor map selected";
      return false;
    }

    if (!this.validation(pdbid)) {
      this.mResBox.value = "Invalid PDB ID: "+pdbid;
      this.mPdbIdBox.select();
      this.mPdbIdBox.focus();
      return false;
    }

    if (pdbchk) {
      //let url_pdb = "http://www.rcsb.org/pdb/download/downloadFile.do?"+
      //"fileFormat=pdb&compression=NO&structureId="+pdbid;

      let svr = document.getElementById('pdb-svr-list').value;

      //if (svr=="EBI")
      //  url_pdb = "http://files.rcsb.org/download/"+pdbid+".cif.gz";
      //else
      //url_pdb = "http://files.rcsb.org/download/"+pdbid+".cif.gz";

      url_pdb = cuemolui.replacePDBURL(svr, pdbid);
      let uri = this.mIoService.newURI(url_pdb, null, null);
  
      try {
        let httpChannel = this.mIoService.newChannelFromURI(uri)
          .QueryInterface(Components.interfaces.nsIHttpChannel);
        httpChannel.requestMethod = "HEAD";
        httpChannel.redirectionLimit = 10;
        httpChannel.open();
        dd("Response "+httpChannel.responseStatus+httpChannel.responseStatusText+" for URL: "+url_pdb);
        if (httpChannel.responseStatus!=200) {
          this.mResBox.value = "PDB Entry "+pdbid+" not found.";
          this.mPdbIdBox.select();
          this.mPdbIdBox.focus();
          return false;
        }
      }
      catch (e) {
        debug.exception(e);
        return false;
      }
    }

    if (mapchk_2fofc || mapchk_fofc) {
      let svr = document.getElementById('map-svr-list').value;
      if (svr=="EDS")
        url_map = "http://eds.bmc.uu.se/eds/sfd/"+pdbid+"/"+pdbid+"_sigmaa.mtz";
      else
        url_map = "http://www.ebi.ac.uk/pdbe/coordinates/files/"+pdbid+"_map.mtz";

      let uri = this.mIoService.newURI(url_map, null, null);
  
      try {
        let httpChannel = this.mIoService.newChannelFromURI(uri)
          .QueryInterface(Components.interfaces.nsIHttpChannel);
        httpChannel.requestMethod = "HEAD";
        httpChannel.redirectionLimit = 0;
        httpChannel.open();
        dd("Response "+httpChannel.responseStatus+httpChannel.responseStatusText+" for URL: "+url_map);
        if (httpChannel.responseStatus!=200) {
          this.mResBox.value = "PDBe map Entry "+pdbid+" not found.";
          this.mPdbIdBox.select();
          this.mPdbIdBox.focus();
          return false;
        }
      }
      catch (e) {
        debug.exception(e);
        return false;
      }
    }

    this.mArgs[0](pdbid, pdbchk, mapchk_2fofc, mapchk_fofc, url_pdb, url_map);

    this.mHis.append(pdbid);
    this.mHis.saveToPref();
    return true;
  }
};
