
function checkExists(uri)
{
  let mIoService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  try {
    let httpChannel = mIoService.newChannelFromURI(uri)
      .QueryInterface(Components.interfaces.nsIHttpChannel);
    httpChannel.requestMethod = "HEAD";
    httpChannel.redirectionLimit = 0;
    httpChannel.open();
    dd("Response "+httpChannel.responseStatus+httpChannel.responseStatusText+" for URL: "+uri.prePath+uri.path);
    if (httpChannel.responseStatus!=200) {
      return false;
    }
  }
  catch (e) {
    return false;
  }
  
  return true;
}


function checkPDBExists(pdbid)
{
//  alert("PDB check:"+pdbid);
  let mIoService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  {
    let pdb_url = "http://files.rcsb.org/download/"+pdbid+".pdb.gz";
    let uri = mIoService.newURI(pdb_url, null, null);
    if (!checkExists(uri))
      return false;
  }
 //  alert("PDB OK:"+pdbid);
  {
    let eds_url = "http://eds.bmc.uu.se/eds/sfd/"+pdbid+"/"+pdbid+"_sigmaa.mtz";
    let uri = mIoService.newURI(eds_url, null, null);
    if (!checkExists(uri))
      return false;
  }

  //alert("EDS OK:"+pdbid);
  return true;
}

function getNextPDBID(pdbid)
{
  let i = pdbid.charCodeAt(0);
  let j = pdbid.charCodeAt(1);
  let k = pdbid.charCodeAt(2);
  let l = pdbid.charCodeAt(3);

  ++l;
  if (l==0x3A) {
    l = 0x61;
  }
  else if (l==0x7B){
    l = 0x30;

    ++k;
    if (k==0x3A) {
      k = 0x61;
    }
    else if (k==0x7B){
      k = 0x30;
      
      ++j;
      if (j==0x3A) {
	j = 0x61;
      }
      else if (j==0x7B){
	j = 0x30;
	
	++i;
	if (i==0x3A) {
	  i = 0x61;
	}
	else if (i==0x7B){
	  return "";
	}
      }
    }
  }

  return String.fromCharCode(i,j,k,l);
}

////////////////////////////////

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
  //this.mLoadPDB = false;
  //this.mLoadEDS_2fofc = false;
  //this.mLoadEDS_fofc = false;
  this.mFuncs = null;
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
    dd("PDB ID: "+this.mPDBID+" not found.");
  }
};

StreamListener.prototype.onDataAvailable = function (aRequest, aContext, aStream, aSourceOffset, aLength)
{
  if (!this.m_ok) return;

  /*if (aSourceOffset>10000) {
    cuemol.putLogMsg("souce offset exceeded 10000: "+aSourceOffset);
    return;
  }*/

  var chunk = cuemol.convPolymObj( cuemol.xpc.createBAryFromIStream(aStream) );
  var len = chunk.length;
  if (len>0) {
    //dd("supply data chunk "+len);
    //dd("chunk ="+chunk);
    //dd("chunk wrapped="+chunk._wrapped+", "+chunk._wrapped.getClassName());
    //dd("chunk type="+typeof chunk);
    this.m_strmgr.supplyDataAsync( this.m_tid, chunk, len);
  }

};

StreamListener.prototype.onStopRequest = function (aRequest, aContext, aStatus)
{
  dd("onStopReq "+this.m_ok);
  if (!this.m_ok) return;

  let obj = this.m_strmgr.waitLoadAsync(this.m_tid);

  if (obj) {
    obj.name = this.mNewObjName;
    
    // EDIT TXN START //
    this.m_scene.startUndoTxn("Get PDB");
    try {
      this.m_scene.addObject(obj);
      this.mDlgRes.obj_id = obj.uid;
      this.mDlgRes.new_obj = true;
      gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
    }
    catch (e) {
      dd("Exception occured: "+e);
      debug.exception(e);
    }
    this.m_scene.commitUndoTxn();
    // EDIT TXN END //
  }
  
  dd("created: "+obj);
  this.mChannel = null;

  if (this.mFuncs) {
    if (this.mFuncs.length>0) {
      let funcs = this.mFuncs;
      window.setTimeout(function () {
	funcs.shift().call();
      }, 0);
    }
    else {
      // End of the loading--> try next PDB ID
      newid = getNextPDBID(this.mPDBID);
      if (newid=="")
	return;
      onOpenPDBsite(newid);
    }
  }
};

StreamListener.prototype.forceCancel = function ()
{
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
};

StreamListener.prototype.onStatus = function (aRequest, aContext, aStatus, aStatusArg)
{
};

// nsIHttpEventSink
StreamListener.prototype.onRedirect = function (aOldChannel, aNewChannel)
{
  dd("********** ON REDIRECT");
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

/////////////////////////////////////////////////////////////////////////////////

function randstr()
{
  let n = Math.floor(Math.random() * 1000000);
  return "r="+n;
}

function openPDBsiteImpl(pdbid, afuncs)
{
  var pdb_url = "";
  var scene = gQm2Main.mMainWnd.currentSceneW;
  var listener;

  pdb_url = "http://files.rcsb.org/download/"+pdbid+".pdb.gz"+"?"+randstr();
  cuemol.putLogMsg("open PDB site: URL=\""+pdb_url+"\"");

  var new_obj_name = pdbid;

  //////////
  // show the setup-rend dialog

  var smg = cuemol.getService("StreamManager");

  var obj_type;
  var rend_types;
  var reader = smg.createHandler("pdb", 0);
  reader.compress = "gzip";
  ( function () {
    var tmpobj = reader.createDefaultObj();
    obj_type = tmpobj._wrapped.getClassName();
    rend_types = tmpobj.searchCompatibleRendererNames();
    tmpobj = null;
  }) ();

  var dlgdata = new Object();
  dlgdata.sceneID = scene.uid;
  dlgdata.ok = true;
  dlgdata.rendtype = "simple";
  dlgdata.rendname = "simple0";
  dlgdata.center = true;

  //////////
  // start <asynchronous loading

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


  listener.m_window = window;
  listener.mChannel.notificationCallbacks = listener;
  listener.mChannel.asyncOpen(listener, null);
}

function openEDSsiteImpl(pdbid, afuncs)
{
  var scene = gQm2Main.mMainWnd.currentSceneW;
  var eds_url="";

  var listener;

  eds_url = "http://eds.bmc.uu.se/eds/sfd/"+pdbid+"/"+pdbid+"_sigmaa.mtz?"+randstr();
  cuemol.putLogMsg("open EDS site: URL=\""+eds_url+"\"");

  var new_obj_name = pdbid+"_2fofc";


  //////////
  // show the setup-rend dialog

  var smg = cuemol.getService("StreamManager");

  var obj_type;
  var rend_types;
  var reader = smg.createHandler("mtzmap", 0);
  reader.clmn_F = "2FOFCWT";
  reader.clmn_PHI = "PH2FOFCWT";
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
  listener.mPDBID = pdbid;

  listener.m_window = window;
  listener.mChannel.notificationCallbacks = listener;
  listener.mChannel.asyncOpen(listener, null);
}



function onOpenPDBsite(pdbid)
{
  var scene = gQm2Main.mMainWnd.currentSceneW;
  var uids = scene.obj_uids.split(",");
  if (uids.length>20) {
    scene.clearAllData();
    if (cuemolui.logpanel)
      cuemolui.logpanel.clearLogContents();
  }
  
  for (;;) {
    if (checkPDBExists(pdbid))
      break;

    cuemol.putLogMsg("PDB ID: "+pdbid+" not found.");
    pdbid = getNextPDBID(pdbid);
  }

  var bpdb = true;
  var bmap_2fofc = true;

  var funcs = new Array();
  
  funcs.push( function () {
    openPDBsiteImpl(pdbid, funcs);
  });

  funcs.push( function () {
    openEDSsiteImpl(pdbid, funcs);
  });

  funcs.shift().call();
}


/////////////////////////////////////////////////

var scene = gQm2Main.mMainWnd.currentSceneW;

var chars = "0123456789abcdefghijklmnopqrstuvwxyz";

var logmgr = cuemol.getService("MsgLog");
logmgr.setFileRedirPath("F:\\proj\\log.txt");

pdbid = "3a00";
onOpenPDBsite(pdbid);

/*
for (let i=3; i<=9; ++i) {
  for (let j=0; j<chars.length; ++j) {
    for (let k=0; k<chars.length; ++k) {
      for (let l=0; l<chars.length; ++l) {
	let pdbid =
	  chars.substr(i, 1) +
	    chars.substr(j, 1) +
	      chars.substr(k, 1) +
		chars.substr(l, 1);
	
	onOpenPDBsite(pdbid);
      }
      scene.clearAllData();
    }
    if (cuemolui.logpanel)
      cuemolui.logpanel.clearLogContents();
  }
}
*/
     
//logmgr.setFileRedirPath("");

