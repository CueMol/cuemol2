//
// web PDB download tool
//

var gChannel;

function StreamListener(tid)
{
  this.m_tid = tid;
  this.mData = "";
  this.m_ok = true;
  this.m_sTargetPDB = "";
  this.m_scene = null;
  this.m_strmgr = null;
  this.m_window = null;
  //m_docuemnt: null,
  //m_progress: null,
}

// nsIStreamListener
StreamListener.prototype.onStartRequest = function (aRequest, aContext)
{
  this.mData = "";
  dd("********** ON STARTREQ status="+aRequest.status+" *****");

  var httpch = gChannel.QueryInterface(Components.interfaces.nsIHttpChannel);
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
    alert("PDB ID: "+this.m_sTargetPDB+" not found.");
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
  var mol;

  dd("onStopReq "+this.m_ok);
  if (!this.m_ok) return;

  if (this.showProgress)
    this.showProgress(-1);

  mol = this.m_strmgr.waitLoadAsync(this.m_tid);
  mol.name = this.m_sTargetPDB;

  // EDIT TXN START //
  this.m_scene.startUndoTxn("Get PDB");
  try {
    this.m_scene.addObject(mol);
    this.mDlgRes.obj_id = mol.uid;
    this.mDlgRes.new_obj = true;
    gQm2Main.doSetupRend(this.m_scene, this.mDlgRes);
  }
  catch (e) {
    dd("Exception occured: "+e);
    debug.exception(e);
  }
  this.m_scene.commitUndoTxn();
  // EDIT TXN END //

  dd("created: "+mol);
  gChannel = null;
  this.m_window.close();
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

  gChannel = null;
  this.m_window.close();
};

// nsIChannelEventSink
StreamListener.prototype.onChannelRedirect = function (aOldChannel, aNewChannel, aFlags)
{
  // redirected --> set new channel
  gChannel = aNewChannel;
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
  dump("********** ON REDIRECT ***** \n");
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
  var scene = this.mMainWnd.currentSceneW;
  var pdb_url = "";
  var pdbid = null;

  window.openDialog("chrome://cuemol2/content/tools/openPDB.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
		    function(aArg) { pdbid = aArg; });

  if (!pdbid)
    return;

  var listener;
  gChannel = null;

  //pdb_url = "http://www.rcsb.org/pdb/download/downloadFile.do?"+
  //"fileFormat=pdb&compression=NO&structureId="+pdbid;
  pdb_url = "http://www.rcsb.org/pdb/files/"+pdbid+".pdb.gz";
  //pdb_url = "http://www.rcsb.org/pdb/files/"+pdbid+".pdb"

  dd("open PDB site: URL=\""+pdb_url+"\"");
  // alert("OK PDBID="+pdb_url);

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
  dlgdata.ok = false;
  dlgdata.target = new Array();
  dlgdata.target[0] = new Object();
  dlgdata.target[0].name = new_obj_name;
  dlgdata.target[0].obj_type = obj_type;
  dlgdata.target[0].rend_types = rend_types;
  dlgdata.target[0].reader_name = "xxx";
  // dlgdata.target[0].reader = reader;

  this.doSetupRendDlg(dlgdata);
  if (!dlgdata.ok)
    return;

  //////////
  // start asynchronous loading

  var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  var uri = ioService.newURI(pdb_url, null, null);
  gChannel = ioService.newChannelFromURI(uri);

  var tid = smg.loadObjectAsync(reader);
  listener = new StreamListener(tid);
  listener.m_scene = scene;
  listener.m_strmgr = smg;
  listener.m_sTargetPDB = pdbid;
  listener.mDlgRes = dlgdata;

  function onLoad(aDlg) {
    listener.m_window = aDlg;
    gChannel.notificationCallbacks = listener;
    gChannel.asyncOpen(listener, null);
    return listener;
  }

  window.openDialog("chrome://cuemol2/content/tools/netpdb-progress-dlg.xul",
		    "openPDB",
		    "chrome,modal,resizable=no,dependent,centerscreen",
		    onLoad);

}

