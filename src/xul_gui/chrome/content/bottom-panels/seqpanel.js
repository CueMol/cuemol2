// -*-Mode: C++;-*-
//
// seqpanel.js: mol sequence bottom-panel implementation
//

if (!("seqpanel" in cuemolui)) {

  ( function () {

    var panel = cuemolui.seqpanel = new Object();

    addEventListener("load", function () { try {panel.onLoad();} catch (e) {debug.exception(e);}}, false);
    addEventListener("unload", function () {panel.onUnLoad();}, false);

    panel.mTgtSceneID = null;
    panel.mData = new Object();
    panel.mNames = new Object();

    panel.onLoad = function ()
    {
      var that = this;
      var mainWnd = this.mMainWnd = document.getElementById("main_view");

      this.attachScene(mainWnd.getCurrentSceneID());

      //
      // setup tab-event handler for the MainTabView
      //
      mainWnd.mPanelContainer.addEventListener("select", function(aEvent) {
	  that.detachScene(that.mTgtSceneID);
	  that.attachScene(mainWnd.getCurrentSceneID());
	}, false);
      
      //////////

      this.mCanvas = document.getElementById("seq_canvas");
      this.mScrBox = document.getElementById("seq_scrollbox");
      this.mScrBox.addEventListener("DOMMouseScroll", function(aEvent) {
	  dd("***SCROLL***");
	}, false);
    };

    panel.onUnLoad = function ()
    {
      this.detachScene(that.mTgtSceneID);
    };

    panel.attachScene = function (scid)
    {
      if (scid==null) return;

      var scene = cuemol.getScene(scid);
      if (!scene) return;

      this.mTgtSceneID = scid;
      dd("SeqPanel: change the tgt scene to "+this.mTgtSceneID);

      var that = this;
      var handler = function (args) {
	switch (args.evtType) {
	case cuemol.evtMgr.SEM_ADDED:
	dd("SeqPanel SEM_ADDED: "+args.obj.target_uid);
	that.addMolData(args.obj.target_uid);
	that.renderSeq();
	break;
	
	case cuemol.evtMgr.SEM_REMOVING:
	dd("SeqPanel SEM_REMOVING:"+args.obj.target_uid);
	that.removeMolData(args.obj.target_uid);
	that.renderSeq();
	break;
	
	case cuemol.evtMgr.SEM_CHANGED:
	if (args.method=="sceneAllCleared" ||
	    args.method=="sceneLoaded") {
	  dd("SeqPanel SEM_CHANGED:"+args.srcUID);
	}
	break;
	
	}
      };
      
      var srctype =
      cuemol.evtMgr.SEM_SCENE|
      cuemol.evtMgr.SEM_OBJECT; // source type

      this._callbackID = cuemol.evtMgr.addListener("",
						   srctype,
						   cuemol.evtMgr.SEM_ANY, // event type
						   scene.uid, // source UID
						   handler);
    }

    // detach from the previous active scene
    panel.detachScene = function (oldid)
    {
      if (oldid==null || oldid<0) return;
      var oldscene = cuemol.getScene(oldid);
      if (oldscene && this._callbackID)
	cuemol.evtMgr.removeListener(this._callbackID);
      this._callbackID = null;
    };

    panel.addMolData = function (aMolId)
    {
      var mol = cuemol.getObject(aMolId);
      if (!mol)
	returnl;
      
      // Get chain data
      var json_str = mol.getChainsJSON();
      var data;
      try {
	// dd("MolStruct chains json: "+json_str);
	data = JSON.parse(json_str);
      }
      catch (e) {
	dd("error : "+json_str);
	debug.exception(e);
	return;
      }

      var moldata = new Object();
      var i, nlen = data.length;
      for (i=0; i<nlen; ++i) {
	var node = new Object();
	var chn = data[i];
	var chain = mol.getChain(chn);
	if (!chain) {
	  // ERROR!!
	  continue;
	}

	json_str = chain.getResidsJSON();
	var rdata;
	try {
	  rdata = JSON.parse(json_str);
	}
	catch (e) {
	  dd("error : "+json_str);
	  debug.exception(e);
	  return;
	}
	
	moldata[chn] = rdata;
      }

      this.mData[aMolId] = moldata;
      this.mNames[aMolId] = mol.name;
    };
    
    panel.removeMolData = function (aMolId)
    {
      if (this.mData[aMolId])
	delete this.mData[aMolId];
      if (this.mNames[aMolId])
	delete this.mNames[aMolId];
    };

    panel.renderSeq = function ()
    {
      var ctx = this.mCanvas.getContext("2d");

      var key, chn, nsize=0;
      var nres, res, nmax = 0;
      var row = new Array();
      for (key in this.mData) {
	var moldata = this.mData[key];
	for (chn in moldata) {
	  var chdata = moldata[chn];
	  if (chdata) {
	    nsize++;
	    row.push({mol: key, chain: chn});
	    nres = chdata.length;
	    res = chdata[nres-1].index;
	    res = parseInt(res);
	    dd("chain "+chn+", nres="+nres+", lastind="+res);
	    if (!isNaN(res) && res>nmax)
	      nmax = res;
	  }
	}
      }

      var mtx = ctx.measureText("M");
      var tw = mtx.width;
      var th = 14;

      var nx = nmax+10;
      var ny = nsize;
      
      this.mCanvas.width = tw * nx;
      this.mCanvas.height = th * ny;
      //dd("canvas height="+h);

      ctx.font = "bold "+th+"px monospace";
      ctx.textBaseline = "bottom";

      dd("********* canvas nx="+nx);
      dd("********* canvas ny="+ny);

      for (var y=0; y<ny; ++y) {
	key = row[y].mol;
	chn = row[y].chain;
	dd("mol: "+key+", chain: "+chn);
	
	moldata = this.mData[key];
	chdata = moldata[chn];

	nres = chdata.length;
	for (var i=0; i<nres; ++i) {
	  var sg = chdata[i].single;
	  if (sg=="") sg = "*";
	  var ires = chdata[i].index;
	  ires = parseInt(ires);
	  if (isNaN(ires))
	    continue;
	  ctx.fillText(sg, ires*tw, (y+1)*th);
	}
      }
    };

  } )();
}

