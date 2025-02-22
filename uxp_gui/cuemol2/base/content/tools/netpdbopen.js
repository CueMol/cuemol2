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
  this.mLoadFunc = null;

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
  if (!obj) {
    dd("onStopReq: strmgr.waitLoadAsync obj is null");
  }

  this.mLoadFunc(obj);
  dd("created: "+obj);
  this.mChannel = null;
  this.m_window.close();
  
  if (this.mFuncs) {
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

Qm2Main.prototype.onOpenPDBsite = function () {
  let result = null;
  window.openDialog("chrome://cuemol2/content/tools/openPDB.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
            function(aRes) {
              result = aRes;
		    });

  let pdbid = result.pdbid;
  let url_pdb = result.url_pdb;
  let url_map = result.url_map_2fofc;
  let url_map_fofc = result.url_map_fofc;

  if (!pdbid)
    return;

  var funcs = new Array();
  
  if (url_pdb != null) {
    funcs.push( function () {
      gQm2Main.openPDBsiteImpl(pdbid, url_pdb, funcs);
    });
  }

  if (url_map != null) {
    funcs.push( function () {
      gQm2Main.openMapImpl(pdbid, url_map, true, funcs);
    });
  }

  if (url_map_fofc != null) {
    funcs.push( function () {
      gQm2Main.openMapImpl(pdbid, url_map_fofc, false, funcs);
    });
  }


  if (funcs.length>0)
    funcs.shift().call();
}

const startAsyncLoad = (pdbid, pdb_url, reader, loadFunc, chainFuncs) => {
    const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    const uri = ioService.newURI(pdb_url, null, null);
    
    const smg = cuemol.getService("StreamManager");
    const tid = smg.loadObjectAsync(reader);
    let listener = new StreamListener(tid);
    // listener.m_scene = scene;
    listener.m_strmgr = smg;
    // listener.mNewObjName = new_obj_name;
    listener.mPDBID = pdbid;
    // listener.mDlgRes = dlgdata;
    listener.mChannel = ioService.newChannelFromURI(uri);
    listener.mFuncs = chainFuncs;
    listener.mLoadFunc = loadFunc;
    
    const onLoad = (aDlg) => {
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

const getObjRendTypes = (reader) => {
    let tmpobj = reader.createDefaultObj();
    let obj_type = tmpobj._wrapped.getClassName();
    let rend_types = tmpobj.searchCompatibleRendererNames();
    tmpobj = null;
    return {obj_type, rend_types};
}

Qm2Main.prototype.openPDBsiteImpl = function (pdbid, aPDBURL, afuncs)
{
  var bUseMmcif = true;

  var pdb_url = aPDBURL;
  var scene = this.mMainWnd.currentSceneW;
  var listener;

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
  var smg = cuemol.getService("StreamManager");

  //////////
  // show the setup-rend dialog

  var new_obj_name = pdbid;
  let reader = smg.createHandler(rdr_type, 0);
  if (cmp_type)
    reader.compress = cmp_type;

  var {obj_type, rend_types} = getObjRendTypes(reader);

  var dlgdata = new Object();
  dlgdata.sceneID = scene.uid;
  dlgdata.ok = false;
  dlgdata.target = new Array();
  dlgdata.target[0] = new Object();
  dlgdata.target[0].name = new_obj_name;
  dlgdata.target[0].obj_type = obj_type;
  dlgdata.target[0].rend_types = rend_types;
  dlgdata.target[0].reader_name = "xxx";
  dlgdata.target[0].preset_types = this.getCompatibleRendPresetNames(obj_type, scene.uid);

  this.doSetupRendDlg(dlgdata);
  if (!dlgdata.ok)
    return;

  //////////
  // start asynchronous loading

  const loadFunc = (obj) => {
      obj.name = new_obj_name;
      scene.startUndoTxn("Get PDB");
      try {
          scene.addObject(obj);
          dlgdata.obj_id = obj.uid;
          dlgdata.new_obj = true;
          this.doSetupRend(scene, dlgdata);
      }
      catch (e) {
          dd("Exception occured: "+e);
          debug.exception(e);
      }
      scene.commitUndoTxn();
  }

  startAsyncLoad(pdbid, pdb_url, reader, loadFunc, afuncs);
}

Qm2Main.prototype.openMapImpl = function (pdbid, map_url, b2fofc, afuncs)
{
  var scene = this.mMainWnd.currentSceneW;
  var listener;

  dd("open map URL=\""+map_url+"\"");
  cuemol.println("Open map: URL=\""+map_url+"\"");

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

  let reader;
  if (map_url.endsWith("_map_coef.cif.gz")) {
      dd("Open MMCIF URL: "+map_url);
      reader = smg.createHandler("mmcifmap", 0);
      reader.compress = "gzip";
  }
  else if (map_url.endsWith("_map.mtz")) {
      dd("Open MTZ URL: "+map_url);
      reader = smg.createHandler("mtzmap", 0);
      if (b2fofc) {
          reader.clmn_F = "FWT";
          reader.clmn_PHI = "PHWT";
      }
      else {
          reader.clmn_F = "DELFWT";
          reader.clmn_PHI = "PHDELWT";
      }
  }
  else {
      dd("Unknown type URL: "+map_url);
      return;
  }

  reader.gridsize = 0.25;
  var {obj_type, rend_types} = getObjRendTypes(reader);

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

  dlgdata.center = false;
  dlgdata.rendtype = "contour";
  dlgdata.rendname = "contour1";

  //////////
  // start asynchronous loading

  const loadFunc = (obj) => {
      obj.name = new_obj_name;
      scene.startUndoTxn("Get Density Map");
      try {
          scene.addObject(obj);
          dlgdata.obj_id = obj.uid;
          dlgdata.new_obj = true;
          if (b2fofc) {
              dlgdata.rendname = "contour1";
              dlgdata.mapcolor = "#0000FF";
              dlgdata.mapsigma = 1.0;
              this.doSetupRend(scene, dlgdata);
          }
          else {
              dlgdata.rendname = "pos-cont";
              dlgdata.mapcolor = "#00FF00";
              dlgdata.mapsigma = 3.0;
              this.doSetupRend(scene, dlgdata);
              dlgdata.rendname = "neg-cont";
              dlgdata.mapcolor = "#FF0000";
              dlgdata.mapsigma = -3.0;
              this.doSetupRend(scene, dlgdata);
          }
      }
      catch (e) {
          dd("Exception occured: "+e);
          debug.exception(e);
      }
      scene.commitUndoTxn();
  }

  startAsyncLoad(pdbid, map_url, reader, loadFunc, afuncs);
}
