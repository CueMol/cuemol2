// -*-Mode: C++;-*-
//
// web PDB download tool
//

// var gChannel;

function StreamListener(tid)
{
  this.m_tid = tid;
  this.mData = "";
  this.m_ok = true;
  this.mNewObjName = "";
  this.mPDBID = "";
  this.m_scene = null;
  this.m_strmgr = null;
  this.m_window = null;
  this.mChannel = null;
  this.mFuncs = null;

  this.mLoadPDB = false;
  this.mLoadEDS_2fofc = false;
  this.mLoadEDS_fofc = false;
}

// nsIStreamListener
StreamListener.prototype.onStartRequest = function (aRequest, aContext)
{
  this.mData = "";
  dd("********** ON STARTREQ status="+aRequest.status+" *****");

  var httpch = this.mChannel.QueryInterface(Ci.nsIHttpChannel);
  dd("channel "+httpch);
  dd("contentType "+httpch.contentType);
  dd("contentLength "+httpch.contentLength);
  dd("response "+httpch.responseStatus+httpch.responseStatusText);

  if (httpch.contentLength>=0) {
    //this.m_progress.mode = "determined";
    //this.m_progress.value = "0";
  }
  else {
    //this.m_progress.mode = "undetermined";
  }
  //this.m_progress.hidden = false;
  //this.m_progress.disabled = false;

  if (httpch.responseStatus!=200) {
    this.m_ok = false;
    this.m_strmgr.waitLoadAsync(this.m_tid);
    alert("PDB ID: <"+this.mPDBID+"> not found ("+httpch.responseStatus+").");
  }
};

StreamListener.prototype.onDataAvailable = function (aRequest, aContext, aStream, aSourceOffset, aLength)
{
  if (!this.m_ok) return;

  var chunk = cuemol.convPolymObj( cuemol.xpc.createBAryFromIStream(aStream) );
  var len = chunk.length;
  if (len>0) {
    //dd("supply data chunk "+len);
    //dd("chunk ="+chunk);
    //dd("chunk wrapped="+chunk._wrapped+", "+chunk._wrapped.getClassName());
    //dd("chunk type="+typeof chunk);
    this.m_strmgr.supplyDataAsync( this.m_tid, chunk, len);
  }

  if (this.showProgress)
    this.showProgress(len);

};

StreamListener.prototype.onStopRequest = function (aRequest, aContext, aStatus)
{
  dd("onStopReq "+this.m_ok);
  if (!this.m_ok) return;

  if (this.showProgress)
    this.showProgress(-1);

  let obj = this.m_strmgr.waitLoadAsync(this.m_tid);
  obj.name = this.mNewObjName;

  // EDIT TXN START //
  if (this.mLoadPDB)
    this.m_scene.startUndoTxn("Get PDB");
  else
    this.m_scene.startUndoTxn("Get EDS");

  try {
    this.m_scene.addObject(obj);
    this.mDlgRes.obj_id = obj.uid;
    this.mDlgRes.new_obj = true;
    if (this.mLoadEDS_2fofc) {
	this.mDlgRes.rendname = "contour1";
	this.mDlgRes.mapcolor = "#0000FF";
	this.mDlgRes.mapsigma = 1.0;
	gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
    }
    else if (this.mLoadEDS_fofc) {
	this.mDlgRes.rendname = "pos-cont";
	this.mDlgRes.mapcolor = "#00FF00";
	this.mDlgRes.mapsigma = 3.0;
	gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
	this.mDlgRes.rendname = "neg-cont";
	this.mDlgRes.mapcolor = "#FF0000";
	this.mDlgRes.mapsigma = -3.0;
	gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
    }
    else {
	gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
    }
  }
  catch (e) {
    dd("Exception occured: "+e);
    debug.exception(e);
  }
  this.m_scene.commitUndoTxn();
  // EDIT TXN END //

  dd("created: "+obj);
  this.mChannel = null;
  this.m_window.close();

  if (this.mFuncs) {
    // let pdbid = this.mPDBID;
    let funcs = this.mFuncs;
    window.setTimeout(function () {
      if (funcs.length>0)
	funcs.shift().call();
    }, 0);
  }
};

StreamListener.prototype.forceCancel = function ()
{
  if (!this.m_ok) return;

  this.m_ok = false;
  var mol = this.m_strmgr.waitLoadAsync(this.m_tid);

  //if (mol) {
  //this.m_strmgr.destroyObject(mol.uid);
  //}

  dd("calceled: "+mol);

  this.mChannel = null;
  this.m_window.close();
};

// nsIChannelEventSink
StreamListener.prototype.onChannelRedirect = function (aOldChannel, aNewChannel, aFlags)
{
  // redirected --> set new channel
  this.mChannel = aNewChannel;
};

// nsIInterfaceRequestor
StreamListener.prototype.getInterface = function (aIID)
{
  try {
    return this.QueryInterface(aIID);
  } catch (e) {
    throw Components.results.NS_NOINTERFACE;
  }
};

// nsIProgressEventSink
StreamListener.prototype.onProgress = function (aRequest, aContext, aProgress, aProgressMax)
{
  // dump("********** ON PROGRESS "+aProgress+" / "+aProgressMax+"***** \n");
};

StreamListener.prototype.onStatus = function (aRequest, aContext, aStatus, aStatusArg)
{
  // dump("********** ON STATUS "+aStatus+"***** "+aStatusArg+"\n");
};

// nsIHttpEventSink
StreamListener.prototype.onRedirect = function (aOldChannel, aNewChannel)
{
  dd("********** ON REDIRECT *****");
};

// XPCOM interface
StreamListener.prototype.QueryInterface = function(aIID)
{
  if (aIID.equals(Ci.nsISupports) ||
      aIID.equals(Ci.nsIInterfaceRequestor) ||
      aIID.equals(Ci.nsIChannelEventSink) ||
      aIID.equals(Ci.nsIProgressEventSink) ||
      aIID.equals(Ci.nsIHttpEventSink) ||
      aIID.equals(Ci.nsIStreamListener))
    return this;

  throw Components.results.NS_NOINTERFACE;
};

////////////////////////////////////////////////////////////

Qm2Main.prototype.onOpenPDBsite = function ()
{
  var pdbid = null;
  var bpdb = false;
  var bmap_2fofc = false;
  var bmap_fofc = false;

  var url_pdb = null;
  var url_map = null;

  window.openDialog("chrome://cuemol2/content/tools/openPDB.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
		    function(aPDBID, aPDB, aMap2FoFc, aMapFoFc, aPDBURL, aMapURL) {
		      pdbid = aPDBID;
		      bpdb = aPDB;
		      bmap_2fofc = aMap2FoFc;
		      bmap_fofc = aMapFoFc;
		      url_pdb = aPDBURL;
		      url_map = aMapURL;
		    });

  if (!pdbid)
    return;

  var funcs = new Array();
  
  if (bpdb) {
    funcs.push( function () {
      gQm2Main.openPDBsiteImpl(pdbid, url_pdb, funcs);
    });
  }

  if (bmap_2fofc) {
    funcs.push( function () {
      gQm2Main.openEDSsiteImpl(pdbid, url_map, true, funcs);
    });
  }

  if (bmap_fofc) {
    funcs.push( function () {
      gQm2Main.openEDSsiteImpl(pdbid, url_map, false, funcs);
    });
  }


  if (funcs.length>0)
    funcs.shift().call();
}


Qm2Main.prototype.openPDBsiteImpl = function (pdbid, aPDBURL, afuncs)
{
  var bUseMmcif = true;

  var pdb_url = aPDBURL;
  var scene = this.mMainWnd.currentSceneW;
  var listener;

  //pdb_url = "http://www.rcsb.org/pdb/download/downloadFile.do?"+"fileFormat=pdb&compression=YES&structureId="+pdbid;
  //pdb_url = "http://www.rcsb.org/pdb/files/"+pdbid+".pdb.gz";
  //pdb_url = "http://www.rcsb.org/pdb/files/"+pdbid+".pdb"
  //pdb_url = "ftp://ftp.wwpdb.org/pub/pdb/data/structures/divided/pdb/"+mid+"/pdb"+pdbid+".ent.gz"

  var rdr_type=null;
  var cmp_type=null;
  
  if (pdb_url.match(/\.pdb\.gz$/) ||
      pdb_url.match(/\.ent\.gz$/)) {
    rdr_type = "pdb";
    cmp_type = "gzip";
  }
  else if (pdb_url.match(/\.pdb$/) ||
           pdb_url.match(/\.ent$/)) {
    rdr_type = "pdb";
    cmp_type = null;
  }
  else if (pdb_url.match(/\.cif\.gz$/)) {
    rdr_type = "mmcif";
    cmp_type = "gzip";
  }
  else if (pdb_url.match(/\.cif$/)) {
    rdr_type = "mmcif";
    cmp_type = null;
  }
  

  cuemol.println("Open PDB site: URL=\""+pdb_url+"\"");
  dd("open PDB site: URL=\""+pdb_url+"\"");
  // alert("OK PDBID="+pdb_url);

  var new_obj_name = pdbid;

  //////////
  // show the setup-rend dialog

  var smg = cuemol.getService("StreamManager");

  var obj_type;
  var rend_types;
  var reader;

  reader = smg.createHandler(rdr_type, 0);
  if (cmp_type)
    reader.compress = cmp_type;

  ( function () {
    var tmpobj = reader.createDefaultObj();
    obj_type = tmpobj._wrapped.getClassName();
    rend_types = tmpobj.searchCompatibleRendererNames();
    tmpobj = null;
  }) ();

  var dlgdata = new Object();
  dlgdata.sceneID = scene.uid;
  dlgdata.ok = false;
  dlgdata.target = new Array();
  dlgdata.target[0] = new Object();
  dlgdata.target[0].name = new_obj_name;
  dlgdata.target[0].obj_type = obj_type;
  dlgdata.target[0].rend_types = rend_types;
  dlgdata.target[0].reader_name = "xxx";
  // dlgdata.target[0].reader = reader;
  dlgdata.target[0].preset_types = this.getCompatibleRendPresetNames(obj_type, scene.uid);

  this.doSetupRendDlg(dlgdata);
  if (!dlgdata.ok)
    return;

  //////////
  // start asynchronous loading

  var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var uri = ioService.newURI(pdb_url, null, null);

  var tid = smg.loadObjectAsync(reader);
  listener = new StreamListener(tid);
  listener.m_scene = scene;
  listener.m_strmgr = smg;
  listener.mNewObjName = new_obj_name;
  listener.mPDBID = pdbid;
  listener.mDlgRes = dlgdata;
  listener.mChannel = ioService.newChannelFromURI(uri);
  listener.mFuncs = afuncs;
  listener.mLoadPDB = true;

  function onLoad(aDlg) {
    listener.m_window = aDlg;
    listener.mChannel.notificationCallbacks = listener;
    listener.mChannel.asyncOpen(listener, null);
    return listener;
  }

  window.openDialog("chrome://cuemol2/content/tools/netpdb-progress-dlg.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
		    onLoad);

}

Qm2Main.prototype.openEDSsiteImpl = function (pdbid, aURLMap, b2fofc, afuncs)
{
  var scene = this.mMainWnd.currentSceneW;
  var eds_url=aURLMap;

  var listener;

  // // EDS
  // eds_url = "http://eds.bmc.uu.se/eds/sfd/"+pdbid+"/"+pdbid+"_sigmaa.mtz";
  // EBI: http://www.ebi.ac.uk/pdbe/coordinates/files/1cbs_map.mtz
  //eds_url = "http://www.ebi.ac.uk/pdbe/coordinates/files/"+pdbid+"_map.mtz";

  //dd("open PDBe site (density): URL=\""+eds_url+"\"");
  cuemol.println("Open map: URL=\""+eds_url+"\"");

  var new_obj_name;
  if (b2fofc)
    new_obj_name = pdbid+"_2fofc";
  else
    new_obj_name = pdbid+"_fofc";


  //////////
  // show the setup-rend dialog

  var smg = cuemol.getService("StreamManager");

  var obj_type;
  var rend_types;
  var reader = smg.createHandler("mtzmap", 0);
  // reader.compress = "gzip";
  if (b2fofc) {
    if (eds_url.search(/_sigmaa.mtz$/)) {
      reader.clmn_F = "2FOFCWT";
      reader.clmn_PHI = "PH2FOFCWT";
    }
    else {
      reader.clmn_F = "FWT";
      reader.clmn_PHI = "PHWT";
    }
  }
  else {
    if (eds_url.search(/_sigmaa.mtz$/)) {
      reader.clmn_F = "FOFCWT";
      reader.clmn_PHI = "PHFOFCWT";
    }
    else {
      reader.clmn_F = "DELFWT";
      reader.clmn_PHI = "PHDELWT";
    }
  }
  reader.gridsize = 0.25;
  ( function () {
    var tmpobj = reader.createDefaultObj();
    obj_type = tmpobj._wrapped.getClassName();
    rend_types = tmpobj.searchCompatibleRendererNames();
    tmpobj = null;
  }) ();

  var dlgdata = new Object();
  dlgdata.sceneID = scene.uid;
  dlgdata.ok = true;
  dlgdata.target = new Array();
  dlgdata.target[0] = new Object();
  dlgdata.target[0].name = new_obj_name;
  dlgdata.target[0].obj_type = obj_type;
  dlgdata.target[0].rend_types = rend_types;
  dlgdata.target[0].reader_name = "xxx";
  // dlgdata.target[0].reader = reader;

  dlgdata.center = true;
  dlgdata.rendtype = "contour";
  dlgdata.rendname = "contour1";

  //////////
  // start asynchronous loading

  var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var uri = ioService.newURI(eds_url, null, null);

  var tid = smg.loadObjectAsync(reader);
  listener = new StreamListener(tid);
  listener.m_scene = scene;
  listener.m_strmgr = smg;
  listener.mNewObjName = new_obj_name;
  listener.mDlgRes = dlgdata;
  listener.mChannel = ioService.newChannelFromURI(uri);
  listener.mFuncs = afuncs;

  if (b2fofc) {
    listener.mLoadEDS_2fofc = true;
  }
  else {
    listener.mLoadEDS_fofc = true;
  }

  function onLoad(aDlg) {
    listener.m_window = aDlg;
    listener.mChannel.notificationCallbacks = listener;
    listener.mChannel.asyncOpen(listener, null);
    return listener;
  }

  window.openDialog("chrome://cuemol2/content/tools/netpdb-progress-dlg.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
		    onLoad);

}

